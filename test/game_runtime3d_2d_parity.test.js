const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const gameRuntime3d = require("../src/js/game_runtime3d.js");
const commandQueue = require("../src/js/command_queue.js");
const cellMasks = require("../src/js/cell_masks.js");
const sfxArtifacts = require("../src/js/sfx_artifacts.js");

function load2DSessionOracle() {
    const enginePath = path.join(__dirname, "../src/js/engine.js");
    let source = fs.readFileSync(enginePath, "utf8");

    source = source.replace("\ngenerateTitleScreen();\nif (titleMode>0){", "\nif (titleMode>0){");
    source = source.replace("\ncanvasResize();\n\nfunction tryPlaySimpleSound", "\nfunction tryPlaySimpleSound");

    const storage = {};
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
            URL: "test://session-effects",
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
        curLevelNo: 0,
        curlevelTarget: null,
        solvedSections: [],
        storage_has: function(key) { return Object.prototype.hasOwnProperty.call(storage, key); },
        storage_get: function(key) { return storage[key]; },
        storage_set: function(key, value) { storage[key] = value; },
        storage_remove: function(key) { delete storage[key]; },
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
        tryPlayTitleSound: function() {},
        tryPlayStartGameSound: function() {},
        tryPlayStartLevelSound: function() {},
        tryPlayEndLevelSound: function() {},
        tryPlayEndGameSound: function() {},
        tryPlayRestartSound: function() {},
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
        CommandQueue: commandQueue,
        CellMasks: cellMasks,
        SfxArtifacts: sfxArtifacts,
        __sessionOracleStorage: storage
    };

    const hooks = `
module.exports.__sessionOracle = {
    reset: function(options) {
        options = options || {};
        Object.keys(__sessionOracleStorage).forEach(function(key) {
            delete __sessionOracleStorage[key];
        });
        STRIDE_OBJ = 1;
        STRIDE_MOV = 1;
        MOV_BITS = 5;
        MOV_MASK = 0x1f;
        state = {
            metadata: options.metadata || {},
            default_metadata: options.defaultMetadata || {},
            levels: options.levels.map(function(cells, index) {
                var level = new Level(0, cells.length, 1, 1, new Int32Array(cells), null);
                level.title = "Level " + index;
                level.linksTop = options.levelLinksTop && options.levelLinksTop[index] !== undefined
                    ? options.levelLinksTop[index]
                    : (options.links || []).length;
                return level;
            }),
            sections: options.sections || [],
            links: options.links || [],
            winconditions: [],
            sounds: [],
            playerMask: new BitVec(new Int32Array([1])),
            layerMasks: [new BitVec(new Int32Array([7]))],
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
            idDict: ["player", "wall", "door"],
            objects: {
                player: { id: 0, layer: 0 },
                wall: { id: 1, layer: 0 },
                door: { id: 2, layer: 0 }
            }
        };
        curLevelNo = options.levelIndex || 0;
        curlevelTarget = null;
        curLevel = state.levels[curLevelNo].clone();
        RebuildLevelArrays();
        resetTurnGlobals();
        restartTarget = backupLevel();
        backups = [];
    },
    setCell: function(index, mask) {
        curLevel.objects[index] = mask;
    },
    seedBackup: function() {
        addUndoState(backupLevel());
    },
    applyArtifacts: function(artifacts, turn) {
        var data = artifacts || {};
        var turnInfo = turn || {};
        var queue = data.queue || artifactQueue(data);
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
        var before = backupLevel();
        if (turnInfo.forceModified) {
            curLevel.objects[0] = curLevel.objects[0] === 1 ? 2 : 1;
        }
        var oldGotoLink = gotoLink;
        if (queue.indexOf("link") >= 0 && turnInfo.playerPositions) {
            gotoLink = function() {
                playerPositions = turnInfo.playerPositions.slice();
                return oldGotoLink();
            };
        }
        processInput(-1, false, false, before);
        gotoLink = oldGotoLink;
    },
    snapshot: function() {
        return {
            levelIndex: curLevelNo,
            objects: Array.prototype.slice.call(curLevel.objects),
            restartObjects: restartTarget ? restartTarget.dat.slice() : null,
            hasCheckpoint: storage_has(document.URL + "_checkpoint"),
            winning: winning,
            completed: titleScreen === true,
            backupCount: backups.length,
            linkDepth: linkStack.length
        };
    }
};

function artifactQueue(data) {
    var queue = [];
    if (data.undoRequested) queue.push("undo");
    if (data.gotoTarget != null) queue.push("goto," + data.gotoTarget);
    if (data.linkRequested) queue.push("link");
    if (data.cancelRequested) queue.push("cancel");
    if (data.restartRequested) queue.push("restart");
    if (data.quitRequested) queue.push("quit");
    if (data.winRequested) queue.push("win");
    if (data.checkpointRequested) queue.push("checkpoint");
    if (data.againRequested) queue.push("again");
    return queue;
}

function resetTurnGlobals() {
    titleScreen = false;
    textMode = false;
    winning = false;
    againing = false;
    restarting = false;
    runrulesonlevelstart_phase = false;
    hasUsedCheckpoint = false;
    linkStack = [];
    messagetext = "";
    statusText = "";
    gosubTarget = -1;
    oldflickscreendat = [];
    cameraPositionTarget = {};
    cameraPosition = {};
    currentMovedEntities = {};
    newMovedEntities = {};
    keybuffer = [];
    sfxCreateMask = new BitVec(STRIDE_OBJ);
    sfxDestroyMask = new BitVec(STRIDE_OBJ);
    sfxCreateList = [];
    sfxDestroyList = [];
    seedsToPlay_CanMove = [];
    seedsToPlay_CantMove = [];
    seedsToAnimate = {};
    perfCounters = { commands: 0, groups: 0, randoms: 0, tries: 0 };
    verbose_logging = false;
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__sessionOracle;
}

function make3DSession(levels, sections, options) {
    const opts = options || {};
    return gameRuntime3d.createSessionFromState3D({
        metadata: {},
        default_metadata: {},
        playerMask: new Int32Array([1]),
        layerMasks: [new Int32Array([7])],
        objectCount: 3,
        idDict: ["player", "wall", "door"],
        objects: {
            player: { id: 0, layer: 0 },
            wall: { id: 1, layer: 0 },
            door: { id: 2, layer: 0 }
        },
        sections: sections || [],
        links: opts.links || [],
        collisionLayers: [["player", "wall"]],
        rules3d: { groups: [], lateGroups: [] },
        levels: levels.map((cells, index) => ({
            is3d: true,
            title: `Level ${index}`,
            width: cells.length,
            height: 1,
            depth: 1,
            cellCount: cells.length,
            n_tiles: cells.length,
            layerCount: 1,
            linksTop: opts.levelLinksTop && opts.levelLinksTop[index] !== undefined
                ? opts.levelLinksTop[index]
                : (opts.links || []).length,
            objects: new Int32Array(cells)
        }))
    });
}

function snapshot3D(session) {
    return {
        levelIndex: session.levelIndex,
        objects: Array.from(session.runtime.board.cells),
        restartObjects: session.restartSource ? Array.from(session.restartSource.cells) : null,
        hasCheckpoint: !!session.checkpointSource,
        winning: session.won,
        completed: session.completed,
        backupCount: session.backups.length,
        linkDepth: session.linkStack.length
    };
}

function runScenario(oracle, scenario) {
    const levels = scenario.levels.map(cells => Array.from(cells));
    const sections = scenario.sections || [];
    const links = scenario.links || [];
    const levelLinksTop = scenario.levelLinksTop;
    oracle.reset({ levels, sections, links, levelLinksTop });
    const session = make3DSession(levels.map(cells => new Int32Array(cells)), sections, {
        links,
        levelLinksTop
    });

    for (const step of scenario.steps) {
        if (step.seedBackup) {
            oracle.seedBackup();
            session.backups.push(session.runtime.board.cloneSource());
        }
        if (step.setCell) {
            oracle.setCell(step.setCell.index, step.setCell.value);
            session.runtime.board.setCell(step.setCell.index, new Int32Array([step.setCell.value]));
        }
        if (step.artifacts) {
            oracle.applyArtifacts(step.artifacts, step.turn || {});
            const turn = Object.assign({}, step.turn || {});
            if (turn.startSource === "current")
                turn.startSource = session.runtime.board.cloneSource();
            if (turn.forceModified)
                session.runtime.board.setCell(0, new Int32Array([session.runtime.board.cells[0] === 1 ? 2 : 1]));
            gameRuntime3d.applySessionArtifacts3D(session, step.artifacts, turn);
        }
    }

    const expected = JSON.parse(JSON.stringify(oracle.snapshot()));
    const actual = snapshot3D(session);
    assert.deepStrictEqual(actual, expected, scenario.name);
}

function testCheckpointThenRestartMatches2D(oracle) {
    runScenario(oracle, {
        name: "checkpoint updates restart target and restart restores checkpoint state",
        levels: [[1]],
        steps: [
            { setCell: { index: 0, value: 2 } },
            { artifacts: { queue: ["checkpoint"], checkpointRequested: true } },
            { setCell: { index: 0, value: 1 } },
            { artifacts: { queue: ["restart"], restartRequested: true } }
        ]
    });
}

function testRestartWithoutCheckpointMatches2D(oracle) {
    runScenario(oracle, {
        name: "restart restores initial restart target when no checkpoint exists",
        levels: [[1]],
        steps: [
            { setCell: { index: 0, value: 2 } },
            { artifacts: { queue: ["restart"], restartRequested: true } }
        ]
    });
}

function testGotoMatches2D(oracle) {
    runScenario(oracle, {
        name: "goto switches level and resets restart target",
        levels: [[1], [2]],
        sections: [{ firstLevel: 1 }],
        steps: [
            { artifacts: { queue: ["goto,0"], gotoTarget: "0" } }
        ]
    });
}

function testWinAdvancesToNextLevelLike2DUnitMode(oracle) {
    runScenario(oracle, {
        name: "win command advances to next level in 2D unit mode and 3D session",
        levels: [[1], [2]],
        steps: [
            { artifacts: { queue: ["win"], winRequested: true } }
        ]
    });
}

function testUndoRestoresPreviousBackupLike2D(oracle) {
    runScenario(oracle, {
        name: "undo restores previous undo backup",
        levels: [[1]],
        steps: [
            { seedBackup: true },
            { setCell: { index: 0, value: 2 } },
            { artifacts: { queue: ["undo"], undoRequested: true } }
        ]
    });
}

function testCancelRestoresTurnStartBackupLike2D(oracle) {
    runScenario(oracle, {
        name: "cancel restores the current turn start backup",
        levels: [[1]],
        steps: [
            { artifacts: { queue: ["cancel"], cancelRequested: true }, turn: { startSource: "current", forceModified: true } }
        ]
    });
}

function testQuitCompletesSessionLike2DTitleExit(oracle) {
    runScenario(oracle, {
        name: "quit exits the active session like 2D title flow",
        levels: [[1]],
        steps: [
            { artifacts: { queue: ["quit"], quitRequested: true } }
        ]
    });
}

function testLinkFollowsVisibleLinkTargetLike2D(oracle) {
    runScenario(oracle, {
        name: "link follows player cell link target and records link stack",
        levels: [[5], [2]],
        sections: [{ firstLevel: 1 }],
        links: [{ object: "door", targetNo: 0 }],
        levelLinksTop: [1, 1],
        steps: [
            { artifacts: { queue: ["link"], linkRequested: true }, turn: { playerPositions: [0] } }
        ]
    });
}

function testWinInsideLinkReturnsToSourceLike2D(oracle) {
    runScenario(oracle, {
        name: "win while inside a link returns to the link source instead of advancing",
        levels: [[5], [2], [4]],
        sections: [{ firstLevel: 1 }],
        links: [{ object: "door", targetNo: 0 }],
        levelLinksTop: [1, 1, 1],
        steps: [
            { artifacts: { queue: ["link"], linkRequested: true }, turn: { playerPositions: [0] } },
            { artifacts: { queue: ["win"], winRequested: true } }
        ]
    });
}

const oracle = load2DSessionOracle();
testCheckpointThenRestartMatches2D(oracle);
testRestartWithoutCheckpointMatches2D(oracle);
testGotoMatches2D(oracle);
testWinAdvancesToNextLevelLike2DUnitMode(oracle);
testUndoRestoresPreviousBackupLike2D(oracle);
testCancelRestoresTurnStartBackupLike2D(oracle);
testQuitCompletesSessionLike2DTitleExit(oracle);
testLinkFollowsVisibleLinkTargetLike2D(oracle);
testWinInsideLinkReturnsToSourceLike2D(oracle);

console.log("3d game runtime 2d parity tests passed");
