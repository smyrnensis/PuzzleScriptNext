const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const againLoop = require("../src/js/again_loop.js");
const commandQueue = require("../src/js/command_queue.js");

function testAgainLoopUsesProbeBeforeRunningAgainTurn() {
    const calls = [];
    const result = againLoop.runAgainLoop({
        inputDirection: "right",
        runTurn(input) {
            calls.push(["run", input]);
            return { input };
        },
        afterTurn(turn) {
            return { againRequested: turn.input === "right" };
        },
        canAgainChange() {
            calls.push(["probe"]);
            return false;
        }
    });

    assert.deepStrictEqual(calls, [["run", "right"], ["probe"]]);
    assert.strictEqual(result.turns.length, 1);
}

function testAgainLoopRunsNoInputTurnWhenProbePasses() {
    let probeCount = 0;
    const result = againLoop.runAgainLoop({
        inputDirection: "right",
        runTurn(input) {
            return { input };
        },
        afterTurn(turn) {
            return { againRequested: turn.input === "right" };
        },
        canAgainChange() {
            probeCount++;
            return true;
        }
    });

    assert.strictEqual(probeCount, 1);
    assert.deepStrictEqual(result.turns.map(turn => turn.input), ["right", null]);
}

function testNoInputProbeUsesBoardChangeLike2DDryRun() {
    const result = againLoop.evaluateNoInputAgainProbe({
        runProbe() {
            return { boardChanged: true, sessionArtifacts: { queue: [] } };
        },
        boardChanged(probe) {
            return probe.boardChanged;
        },
        planSessionTail() {
            throw new Error("board-changing dry-run should not need tail fallback.");
        }
    });

    assert.strictEqual(result, true);
}

function testNoInputProbeIgnoresPureAgainAndCheckpointLike2DDryRun() {
    for (const plan of [
        { againRequested: true },
        { checkpointRequested: true },
        {}
    ]) {
        const result = againLoop.evaluateNoInputAgainProbe({
            runProbe() {
                return { boardChanged: false, sessionArtifacts: { queue: [] } };
            },
            boardChanged() {
                return false;
            },
            planSessionTail() {
                return plan;
            }
        });
        assert.strictEqual(result, false);
    }
}

function testNoInputProbeTreatsWinCommandLike2DDryRun() {
    const result = againLoop.evaluateNoInputAgainProbe({
        runProbe() {
            return { boardChanged: false, sessionArtifacts: { queue: ["win"] } };
        },
        boardChanged() {
            return false;
        },
        planSessionTail() {
            return { winRequested: true };
        }
    });
    assert.strictEqual(result, true);
}

function testNoInputProbeTreatsTerminalActionsLike2DDryRun() {
    assert.strictEqual(probeTerminal({ type: "cancel", commandsLeft: false }), false);
    assert.strictEqual(probeTerminal({ type: "cancel", commandsLeft: true }), true);
    assert.strictEqual(probeTerminal({ type: "restart" }), true);
    assert.strictEqual(probeTerminal({ type: "goto", target: "next" }), true);
}

function testNoInputProbeMatches2DEngineDryRunOracle() {
    const oracle = load2DAgainDryRunOracle();
    const scenarios = [
        { name: "empty queue", queue: [] },
        { name: "again only", queue: ["again"] },
        { name: "checkpoint only", queue: ["checkpoint"] },
        { name: "win only", queue: ["win"] },
        { name: "cancel only", queue: ["cancel"] },
        { name: "cancel with command left", queue: ["cancel", "sfx0"] },
        { name: "restart", queue: ["restart"] },
        { name: "goto", queue: ["goto,0"] },
        { name: "undo", queue: ["undo"] },
        { name: "link", queue: ["link"] }
    ];

    for (const scenario of scenarios) {
        const expected = oracle.run(scenario.queue);
        const actual = againLoop.evaluateNoInputAgainProbe({
            runProbe() {
                return { boardChanged: false, sessionArtifacts: { queue: scenario.queue.slice() } };
            },
            boardChanged() {
                return false;
            },
            planSessionTail(probe, planOptions) {
                return commandQueue.planSessionTail(probe.sessionArtifacts, planOptions);
            }
        });

        assert.strictEqual(actual, expected, scenario.name);
    }
}

function probeTerminal(terminalAction) {
    return againLoop.evaluateNoInputAgainProbe({
        runProbe() {
            return { boardChanged: false, sessionArtifacts: { queue: [] } };
        },
        boardChanged() {
            return false;
        },
        planSessionTail() {
            return { terminalAction };
        }
    });
}

function load2DAgainDryRunOracle() {
    const enginePath = path.join(__dirname, "../src/js/engine.js");
    let source = fs.readFileSync(enginePath, "utf8");
    source = source.replace("\ngenerateTitleScreen();\nif (titleMode>0){", "\nif (titleMode>0){");
    source = source.replace("\ncanvasResize();\n\nfunction tryPlaySimpleSound", "\nfunction tryPlaySimpleSound");

    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        Event: function Event(name) { this.type = name; },
        CustomEvent: function CustomEvent(name, init) {
            this.type = name;
            this.detail = init && init.detail;
        },
        RNG: function RNG() { this.uniform = function() { return 0; }; },
        document: {
            URL: "test://again-dry-run",
            addEventListener: function() {},
            dispatchEvent: function() {},
            getElementById: function() { return null; },
            getElementsByTagName: function() { return []; },
            body: {}
        },
        window: {},
        Image: function Image() {},
        localStorage: {},
        debugSwitch: "",
        verbose_logging: false,
        unitTesting: true,
        IDE: false,
        canvas: null,
        levelEditorOpened: false,
        solving: false,
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        storage_remove: function() {},
        consolePrint: function() {},
        consolePrintFromRule: function() {},
        addToDebugTimeline: function() { return 0; },
        htmlColor: function(_color, text) { return text; },
        htmlJump: function(lineNumber) { return String(lineNumber); },
        logWarning: function() {},
        consoleCacheDump: function() {},
        canvasResize: function() {},
        redraw: function() {},
        clearInputHistory: function() {},
        clearLocalStorage: function() {},
        tryLoadCustomFont: function() {},
        tryLoadImages: function() {},
        regenText: function() {},
        generateTitleScreen: function() {},
        drawMessageScreen: function() {},
        killAudioButton: function() {},
        showAudioButton: function() {},
        isSitelocked: function() { return false; },
        initSmoothCamera: function() {},
        updateCameraPositionTarget: function() {},
        tryPlaySimpleSound: function() {},
        tryPlayCancelSound: function() {},
        tryPlayShowMessageSound: function() {},
        goToTitleScreen: function() {},
        gotoLevelSelectScreen: function() {},
        setSectionSolved: function() {},
        fillRange: function(start, end) {
            const result = [];
            for (let i = start; i < end; i++)
                result.push(i);
            return result;
        },
        fillAndHighlight: function(screen) { return screen; },
        colorToHex: function(_palette, value) { return value || "#000000"; },
        deepClone: function(value) {
            return value == null ? value : JSON.parse(JSON.stringify(value));
        },
        twiddleMetaData: function() {},
        twiddleable_params: [],
        CommandQueue: commandQueue
    };

    const hooks = `
module.exports.__againDryRunOracle = {
    run: function(queue) {
        STRIDE_OBJ = 1;
        STRIDE_MOV = 1;
        MOV_BITS = 5;
        MOV_MASK = 0x1f;
        state = {
            metadata: {},
            default_metadata: {},
            levels: [new Level(0, 1, 1, 1, new Int32Array([1]), null)],
            sections: [{ firstLevel: 0 }],
            links: [{ object: "player", targetNo: 0 }],
            winconditions: [],
            sounds: [],
            playerMask: new BitVec(new Int32Array([1])),
            layerMasks: [new BitVec(new Int32Array([1]))],
            rigidGroupIndex_to_GroupIndex: [],
            rules: [],
            lateRules: [],
            loopPoint: {},
            lateLoopPoint: {},
            subroutines: [],
            sfx_CreationMasks: [],
            sfx_DestructionMasks: [],
            sfx_MovementMasks: [],
            sfx_MovementFailureMasks: [],
            sfx_Events: {},
            idDict: ["player"],
            objects: {
                player: { id: 0, layer: 0 }
            }
        };
        curLevelNo = 0;
        curlevelTarget = null;
        curLevel = state.levels[0].clone();
        RebuildLevelArrays();
        oldflickscreendat = [];
        cameraPositionTarget = {};
        restartTarget = backupLevel();
        backups = [];
        linkStack = [];
        winning = false;
        againing = false;
        titleScreen = false;
        textMode = false;
        messagetext = "";
        statusText = "";
        gosubTarget = -1;
        sfxCreateMask = new BitVec(STRIDE_OBJ);
        sfxDestroyMask = new BitVec(STRIDE_OBJ);
        sfxCreateList = [];
        sfxDestroyList = [];
        seedsToPlay_CanMove = [];
        seedsToPlay_CantMove = [];
        seedsToAnimate = {};

        var applied = false;
        applyRules = function(rules) {
            if (rules === state.rules && !applied) {
                curLevel.commandQueue = queue.slice();
                curLevel.commandQueueSourceRules = queue.map(function(_command, index) {
                    return { lineNumber: index + 1 };
                });
                applied = true;
            }
            return false;
        };

        return processInput(-1, true, true, backupLevel());
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__againDryRunOracle;
}

testAgainLoopUsesProbeBeforeRunningAgainTurn();
testAgainLoopRunsNoInputTurnWhenProbePasses();
testNoInputProbeUsesBoardChangeLike2DDryRun();
testNoInputProbeIgnoresPureAgainAndCheckpointLike2DDryRun();
testNoInputProbeTreatsWinCommandLike2DDryRun();
testNoInputProbeTreatsTerminalActionsLike2DDryRun();
testNoInputProbeMatches2DEngineDryRunOracle();

console.log("again loop tests passed");
