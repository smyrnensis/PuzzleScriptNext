const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const gameRuntime3d = require("../src/js/game_runtime3d.js");
const rules3d = require("../src/js/rules3d.js");
const commandQueue = require("../src/js/command_queue.js");
const ruleGroups = require("../src/js/rule_groups.js");
const randomRuleGroups = require("../src/js/random_rule_groups.js");
const cellMasks = require("../src/js/cell_masks.js");
const sfxArtifacts = require("../src/js/sfx_artifacts.js");

const MOV_BITS_2D = 5;
const MOV_MASK_2D = 0x1f;
const MOV_BITS_3D = 7;
const MOV_MASK_3D = 0x7f;

function load2DFullTurnOracle() {
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
            URL: "test://full-turn",
            addEventListener: function() {},
            dispatchEvent: function() {},
            getElementById: function() { return null; },
            getElementsByTagName: function() { return []; },
            body: {}
        },
        window: { console },
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
        logErrorCacheable: function(message) { throw new Error(message); },
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
        tryPlayUndoSound: function() {},
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
        RuleGroups: ruleGroups,
        RandomRuleGroups: randomRuleGroups,
        CellMasks: cellMasks,
        SfxArtifacts: sfxArtifacts,
        __fullTurnStorage: storage
    };

    const hooks = `
module.exports.__fullTurnOracle = {
    run: function(options) {
        options = options || {};
        Object.keys(__fullTurnStorage).forEach(function(key) {
            delete __fullTurnStorage[key];
        });
        STRIDE_OBJ = 1;
        STRIDE_MOV = 1;
        MOV_BITS = 5;
        MOV_MASK = 0x1f;
        state = makeState(options);
        curLevelNo = 0;
        curlevelTarget = null;
        curLevel = new Level(0, options.width || options.objects.length, 1, 2, new Int32Array(options.objects), null);
        RebuildLevelArrays();
        resetTurnGlobals();
        restartTarget = backupLevel();
        backups = [];
        state.rules = (options.rules || []).map(function(group) {
            return group.map(makeRule);
        });
        state.lateRules = (options.lateRules || []).map(function(group) {
            return group.map(makeRule);
        });
        var result = processInput(inputDir(options.input), false, false);
        return snapshot(result);
    },
    runLevelStart: function(options) {
        options = options || {};
        Object.keys(__fullTurnStorage).forEach(function(key) {
            delete __fullTurnStorage[key];
        });
        STRIDE_OBJ = 1;
        STRIDE_MOV = 1;
        MOV_BITS = 5;
        MOV_MASK = 0x1f;
        state = makeState(options);
        curLevelNo = 0;
        curlevelTarget = null;
        curLevel = new Level(0, options.width || options.objects.length, 1, 2, new Int32Array(options.objects), null);
        RebuildLevelArrays();
        resetTurnGlobals();
        restartTarget = backupLevel();
        backups = [];
        state.rules = (options.rules || []).map(function(group) {
            return group.map(makeRule);
        });
        state.lateRules = (options.lateRules || []).map(function(group) {
            return group.map(makeRule);
        });
        runrulesonlevelstart_phase = true;
        var result = processInput(-1, true, false);
        runrulesonlevelstart_phase = false;
        return snapshot(result);
    }
};

function makeState(options) {
    return {
        metadata: options.metadata || {},
        default_metadata: {},
        levels: [],
        sections: [],
        links: [],
        winconditions: (options.winconditions || []).map(makeWinCondition),
        sounds: [],
        objectCount: 3,
        playerMask: new BitVec(new Int32Array([2])),
        layerMasks: [
            new BitVec(new Int32Array([1])),
            new BitVec(new Int32Array([6]))
        ],
        groupNumber_to_RigidGroupIndex: {},
        rigidGroupIndex_to_GroupIndex: [],
        loopPoint: {},
        lateLoopPoint: {},
        subroutines: [],
        sfx_CreationMasks: [],
        sfx_DestructionMasks: [],
        sfx_MovementMasks: [[], []],
        sfx_MovementFailureMasks: [],
        sfx_Events: {},
        idDict: ["background", "player", "wall"],
        objects: {
            background: { id: 0, layer: 0 },
            player: { id: 1, layer: 1 },
            wall: { id: 2, layer: 1 }
        }
    };
}

function makeRule(spec) {
    var patternRows = spec.patterns.map(function(row) {
        return row.cells.map(makePatternCell);
    });
    return new Rule([
        directionMask(spec.direction || "right"),
        patternRows,
        spec.hasReplacements !== false,
        spec.lineNumber || 1,
        spec.ellipsisCount || patternRows.map(function() { return 0; }),
        spec.groupNumber || 0,
        !!spec.rigid,
        spec.commands || [],
        !!spec.randomRule,
        spec.patterns.map(function(row) { return mask(row.objectMask || [0]); }),
        spec.patterns.map(function(row) { return mask(row.movementMask || [0]); }),
        !!spec.globalRule,
        !!spec.isOnce
    ]);
}

function makePatternCell(cell) {
    return new CellPattern([
        mask(cell.objectsPresent || [0]),
        mask(cell.objectsMissing || [0]),
        (cell.anyObjectsPresent || []).map(mask),
        mask(cell.movementsPresent || [0]),
        mask(cell.movementsMissing || [0]),
        cell.replacement ? makeReplacement(cell.replacement) : null
    ]);
}

function makeReplacement(replacement) {
    return new CellReplacement([
        mask(replacement.objectsClear || [0]),
        mask(replacement.objectsSet || [0]),
        mask(replacement.movementsClear || [0]),
        mask(replacement.movementsSet || [0]),
        mask(replacement.movementsLayerMask || [0]),
        mask(replacement.randomEntityMask || [0]),
        mask(replacement.randomDirMask || [0])
    ]);
}

function makeWinCondition(condition) {
    return [
        condition[0],
        mask(condition[1]),
        mask(condition[2]),
        condition[3] || 1,
        !!condition[4],
        !!condition[5]
    ];
}

function mask(values) {
    return new BitVec(new Int32Array(values));
}

function directionMask(name) {
    return ({ up: 1, down: 2, left: 4, right: 8 })[name] || name || 8;
}

function inputDir(input) {
    if (input === null || input === undefined || input === "")
        return -1;
    return ({ up: 0, left: 1, down: 2, right: 3, action: 4 })[input];
}

function resetTurnGlobals() {
    unitTesting = false;
    titleScreen = false;
    textMode = false;
    winning = false;
    againing = false;
    restarting = false;
    runrulesonlevelstart_phase = false;
    hasUsedCheckpoint = false;
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
    perfCounters = { commands: 0, groups: 0, randoms: 0, tries: 0, rules: 0, matched: 0, matches: 0, replaces: 0, replaced: 0, applied: 0 };
    verbose_logging = false;
}

function snapshot(result) {
    return {
        result: !!result,
        objects: Array.prototype.slice.call(curLevel.objects),
        movements: Array.prototype.slice.call(curLevel.movements),
        winning: winning,
        againing: againing,
        backupCount: backups.length,
        hasCheckpoint: storage_has(document.URL + "_checkpoint")
    };
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__fullTurnOracle;
}

function run3DFullTurn(options) {
    const state = make3DState(options);
    const session = gameRuntime3d.createSessionFromState3D(state);
    const result = gameRuntime3d.processSessionTurn3D(session, options.input || null);
    return snapshot3DSession(session, result);
}

function run3DLevelStart(options) {
    const state = make3DState(options);
    const session = gameRuntime3d.createSessionFromState3D(state);
    return snapshot3DSession(session, { turn: session.lastTurn || { changed: false, sessionArtifacts: {} } });
}

function make3DState(options) {
    return {
        metadata: options.metadata || {},
        default_metadata: {},
        playerMask: new Int32Array([2]),
        layerMasks: [new Int32Array([1]), new Int32Array([6])],
        objectCount: 3,
        idDict: ["background", "player", "wall"],
        objects: {
            background: { id: 0, layer: 0 },
            player: { id: 1, layer: 1 },
            wall: { id: 2, layer: 1 }
        },
        collisionLayers: [["background"], ["player", "wall"]],
        rules3d: {
            groups: (options.rules || []).map(group => group.map(make3DRule)),
            lateGroups: (options.lateRules || []).map(group => group.map(make3DRule)),
            loopPoint: {},
            lateLoopPoint: {},
            subroutines: [],
            winConditions: (options.winconditions || []).map(condition => [
                condition[0],
                new Int32Array(condition[1]),
                new Int32Array(condition[2]),
                condition[3] || 1,
                !!condition[4],
                !!condition[5]
            ])
        },
        levels: [{
            is3d: true,
            width: options.width || options.objects.length,
            height: 1,
            depth: 1,
            cellCount: options.objects.length,
            n_tiles: options.objects.length,
            layerCount: 2,
            objects: new Int32Array(options.objects)
        }]
    };
}

function snapshot3DSession(session, result) {
    return {
        result: !!(result.turn.changed || session.won),
        objects: Array.from(session.runtime.board.cells),
        movements: Array.from(session.runtime.board.movements),
        winning: session.won,
        againing: !!(result.turn.sessionArtifacts && result.turn.sessionArtifacts.againRequested && result.turn.boardChanged),
        backupCount: session.backups.length,
        hasCheckpoint: !!session.checkpointSource
    };
}

function make3DRule(spec) {
    const patterns = spec.patterns.map(row => {
        const cells = row.cells.map(cell => {
            return {
                offset: { x: 0, y: 0, z: 0 },
                pattern: rules3d.makeCellPattern({
                    objectsPresent: new Int32Array(cell.objectsPresent || [0]),
                    objectsMissing: new Int32Array(cell.objectsMissing || [0]),
                    anyObjectsPresent: (cell.anyObjectsPresent || []).map(mask => new Int32Array(mask)),
                    movementsPresent: new Int32Array(convert2DMovementMaskTo3D(cell.movementsPresent || [0])),
                    movementsMissing: new Int32Array(convert2DMovementMaskTo3D(cell.movementsMissing || [0])),
                    replacement: cell.replacement ? rules3d.makeCellReplacement({
                        objectsClear: new Int32Array(cell.replacement.objectsClear || [0]),
                        objectsSet: new Int32Array(cell.replacement.objectsSet || [0]),
                        movementsClear: new Int32Array(convert2DMovementMaskTo3D(cell.replacement.movementsClear || [0])),
                        movementsSet: new Int32Array(convert2DMovementMaskTo3D(cell.replacement.movementsSet || [0])),
                        movementsLayerMask: new Int32Array(convert2DMovementLayerMaskTo3D(cell.replacement.movementsLayerMask || [0])),
                        randomEntityMask: new Int32Array(cell.replacement.randomEntityMask || [0]),
                        randomDirMask: new Int32Array(cell.replacement.randomDirMask || [0])
                    }) : null
                })
            };
        });
        return rules3d.makePattern(cells);
    });

    return {
        lineNumber: spec.lineNumber || 1,
        direction: spec.direction || "right",
        groupNumber: spec.groupNumber || 0,
        rigid: !!spec.rigid,
        randomRule: !!spec.randomRule,
        globalRule: !!spec.globalRule,
        isOnce: !!spec.isOnce,
        commands: spec.commands || [],
        patterns
    };
}

function convert2DMovementMaskTo3D(mask) {
    const value = mask[0] || 0;
    let result = 0;
    for (let layer = 0; layer < 4; layer++) {
        const layerValue = (value >>> (MOV_BITS_2D * layer)) & MOV_MASK_2D;
        const converted = convert2DLayerMovementTo3D(layerValue);
        result |= converted << (MOV_BITS_3D * layer);
    }
    return [result];
}

function convert2DMovementLayerMaskTo3D(mask) {
    const value = mask[0] || 0;
    let result = 0;
    for (let layer = 0; layer < 4; layer++) {
        const layerValue = (value >>> (MOV_BITS_2D * layer)) & MOV_MASK_2D;
        if (layerValue)
            result |= MOV_MASK_3D << (MOV_BITS_3D * layer);
    }
    return [result];
}

function convert2DLayerMovementTo3D(value) {
    return value & MOV_MASK_2D;
}

function runParityScenario(oracle, scenario) {
    const expected = JSON.parse(JSON.stringify(oracle.run(scenario)));
    const actual = run3DFullTurn(scenario);
    assert.deepStrictEqual(actual, expected, scenario.name);
}

const movePlayerRightRule = {
    lineNumber: 10,
    direction: "right",
    patterns: [{
        objectMask: [2],
        movementMask: [0],
        cells: [{
            objectsPresent: [2],
            replacement: {
                movementsSet: [8 << 5],
                movementsLayerMask: [MOV_MASK_3D << MOV_BITS_3D]
            }
        }]
    }]
};

const lateWallRule = {
    lineNumber: 20,
    direction: "right",
    patterns: [{
        objectMask: [2],
        movementMask: [0],
        cells: [{
            objectsPresent: [2],
            replacement: {
                objectsClear: [6],
                objectsSet: [4]
            }
        }]
    }]
};

function commandRule(commands) {
    return {
        lineNumber: 30,
        direction: "right",
        commands,
        patterns: [{
            objectMask: [2],
            movementMask: [0],
            cells: [{
                objectsPresent: [2]
            }]
        }]
    };
}

function testInputMovementFullTurnMatches2D(oracle) {
    runParityScenario(oracle, {
        name: "input movement full turn matches 2D",
        input: "right",
        objects: [3, 1],
        rules: [],
        lateRules: []
    });
}

function testRuleMovementFullTurnMatches2D(oracle) {
    runParityScenario(oracle, {
        name: "rule-seeded movement full turn matches 2D",
        input: null,
        objects: [3, 1],
        rules: [[movePlayerRightRule]],
        lateRules: []
    });
}

function testLateAndCheckpointFullTurnMatches2D(oracle) {
    runParityScenario(oracle, {
        name: "late rule and checkpoint session tail full turn match 2D",
        input: null,
        objects: [3, 1],
        rules: [[Object.assign({}, movePlayerRightRule, { commands: [["checkpoint"]] })]],
        lateRules: [[lateWallRule]]
    });
}

function testWinConditionsFullTurnMatches2D(oracle) {
    runParityScenario(oracle, {
        name: "winconditions advance session after turn like 2D checkWin",
        input: null,
        objects: [3, 1],
        rules: [],
        lateRules: [],
        winconditions: [
            [0, [2], [7], 1, false, false]
        ]
    });
}

function testRequirePlayerMovementMatches2D(oracle) {
    runParityScenario(oracle, {
        name: "require_player_movement allows actual movement like 2D",
        input: "right",
        metadata: { require_player_movement: true },
        objects: [3, 1],
        rules: [],
        lateRules: []
    });
    runParityScenario(oracle, {
        name: "require_player_movement cancels blocked input like 2D",
        input: "right",
        metadata: { require_player_movement: true },
        objects: [3, 5],
        rules: [],
        lateRules: []
    });
}

function testRunRulesOnLevelStartMatches2D(oracle) {
    const scenario = {
        name: "run_rules_on_level_start applies no-input lifecycle turn like 2D",
        metadata: { run_rules_on_level_start: true },
        objects: [3, 1],
        rules: [[movePlayerRightRule]],
        lateRules: []
    };
    const expected = JSON.parse(JSON.stringify(oracle.runLevelStart(scenario)));
    const actual = run3DLevelStart(scenario);
    assert.deepStrictEqual(actual, expected, scenario.name);
}

function testRunRulesOnLevelStartCommandTailMatches2D(oracle) {
    for (const scenario of [
        {
            name: "run_rules_on_level_start win command is suppressed like 2D dontDoWin",
            metadata: { run_rules_on_level_start: true },
            objects: [3, 1],
            rules: [[commandRule([["win"]])]],
            lateRules: []
        },
        {
            name: "run_rules_on_level_start checkpoint command updates restart state like 2D",
            metadata: { run_rules_on_level_start: true },
            objects: [3, 1],
            rules: [[Object.assign({}, movePlayerRightRule, { commands: [["checkpoint"]] })]],
            lateRules: []
        }
    ]) {
        const expected = JSON.parse(JSON.stringify(oracle.runLevelStart(scenario)));
        const actual = run3DLevelStart(scenario);
        assert.deepStrictEqual(actual, expected, scenario.name);
    }
}

const oracle = load2DFullTurnOracle();
testInputMovementFullTurnMatches2D(oracle);
testRuleMovementFullTurnMatches2D(oracle);
testLateAndCheckpointFullTurnMatches2D(oracle);
testWinConditionsFullTurnMatches2D(oracle);
testRequirePlayerMovementMatches2D(oracle);
testRunRulesOnLevelStartMatches2D(oracle);
testRunRulesOnLevelStartCommandTailMatches2D(oracle);

console.log("full turn 2d parity tests passed");
