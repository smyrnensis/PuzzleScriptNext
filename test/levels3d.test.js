const assert = require("assert");

const ThreeDimensionLevels = require("../src/js/levels3d.js");

const DIRECTION_BITS_3D = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    action: 16,
    front: 32,
    back: 64
};
const MOV_BITS_3D = 7;
const MOV_MASK_3D = 0x7f;

function movement3D(direction, layer) {
    return DIRECTION_BITS_3D[direction] << (MOV_BITS_3D * layer);
}

function movementLayerMask3D(layer) {
    return MOV_MASK_3D << (MOV_BITS_3D * layer);
}

function testParseThreeDimensionLevels() {
    const result = ThreeDimensionLevels.parseThreeDimensionLevels([
        "###",
        "#P#",
        "###",
        ";",
        "...",
        ".G.",
        "...",
        "",
        "###",
        "#B#",
        "###"
    ]);

    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.levels.length, 2);
    assert.deepStrictEqual(
        pickDimensions(result.levels[0]),
        { width: 3, height: 2, depth: 3 }
    );
    assert.deepStrictEqual(
        result.levels[0].slices,
        [
            ["###", "#P#", "###"],
            ["...", ".G.", "..."]
        ]
    );
    assert.deepStrictEqual(
        pickDimensions(result.levels[1]),
        { width: 3, height: 1, depth: 3 }
    );
}

function testInlineSemicolonIsNotASeparator() {
    const result = ThreeDimensionLevels.parseThreeDimensionLevels(["A;B"]);

    assert.deepStrictEqual(result.errors, []);
    assert.strictEqual(result.levels.length, 1);
    assert.deepStrictEqual(
        result.levels[0].slices,
        [["A;B"]]
    );
}

function testValidationErrors() {
    assertHasError(
        ThreeDimensionLevels.parseThreeDimensionLevels(["###", ";", ";"]),
        "empty_slice"
    );
    assertHasError(
        ThreeDimensionLevels.parseThreeDimensionLevels(["###", ";"]),
        "trailing_slice_separator"
    );
    assertHasError(
        ThreeDimensionLevels.parseThreeDimensionLevels(["##", "###"]),
        "row_width_mismatch"
    );
    assertHasError(
        ThreeDimensionLevels.parseThreeDimensionLevels(["##", "##", ";", "##"]),
        "slice_height_mismatch"
    );
}

function testCoordRoundTrip() {
    const size = { width: 3, height: 2, depth: 4 };
    for (let x = 0; x < size.width; x++) {
        for (let y = 0; y < size.height; y++) {
            for (let z = 0; z < size.depth; z++) {
                const index = ThreeDimensionLevels.coordToIndex3(x, y, z, size);
                assert.deepStrictEqual(ThreeDimensionLevels.indexToCoord3(index, size), { x, y, z });
                assert.strictEqual(ThreeDimensionLevels.coordToIndex3({ x, y, z }, size), index);
            }
        }
    }
}

function testAsciiLevelAxisContract() {
    const result = ThreeDimensionLevels.parseThreeDimensionLevel([
        "AB",
        "CD",
        ";",
        "EF",
        "GH"
    ]);

    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(
        pickDimensions(result.level),
        { width: 2, height: 2, depth: 2 }
    );

    assert.strictEqual(glyphAt(result.level, 0, 0, 0), "A");
    assert.strictEqual(glyphAt(result.level, 1, 0, 0), "B");
    assert.strictEqual(glyphAt(result.level, 0, 0, 1), "C");
    assert.strictEqual(glyphAt(result.level, 0, 1, 0), "E");

    const size = result.level;
    const indexA = ThreeDimensionLevels.coordToIndex3(0, 0, 0, size);
    assert.strictEqual(ThreeDimensionLevels.coordToIndex3(1, 0, 0, size) - indexA, size.height * size.depth);
    assert.strictEqual(ThreeDimensionLevels.coordToIndex3(0, 0, 1, size) - indexA, 1);
    assert.strictEqual(ThreeDimensionLevels.coordToIndex3(0, 1, 0, size) - indexA, size.depth);
}

function testPuzzleScriptParserLegacyLevels3SectionIsNotASection() {
    const mode = loadParserMode();
    const state = mode.startState();

    state.objects = { "#": {}, ".": {}, p: {}, b: {}, g: {} };
    feedLine(mode, state, "levels3", 1);

    assert.strictEqual(state.section, "");
    assert.deepStrictEqual(state.threeDimensionLevels, [[]]);
}

function testPuzzleScriptParserThreeDimensionsLevelsIsCaseInsensitiveByDefault() {
    const mode = loadParserMode();
    const state = mode.startState();

    state.objects = { "#": {}, p: {} };
    feedLine(mode, state, "three_dimensions", 1);
    feedLine(mode, state, "levels", 2);
    feedLine(mode, state, "#P#", 3);

    assert.strictEqual(state.case_sensitive, false);
    assert.deepStrictEqual(
        state.threeDimensionLevels,
        [
            [3, null, "#p#"]
        ]
    );
}

function testPuzzleScriptParserThreeDimensionsLevelsHonorsCaseSensitivePrelude() {
    const mode = loadParserMode();
    const state = mode.startState();

    state.objects = { "#": {}, p: {} };
    feedLine(mode, state, "case_sensitive", 1);
    feedLine(mode, state, "three_dimensions", 2);
    feedLine(mode, state, "levels", 3);
    const tokens = feedLine(mode, state, "#P#", 4);

    assert.strictEqual(state.case_sensitive, true);
    assert.deepStrictEqual(
        state.threeDimensionLevels,
        [
            [4, null, "#P#"]
        ]
    );
    assert(tokens.includes("ERROR"));
}

function testPuzzleScriptParserThreeDimensionsPreludeEnables3DDirections() {
    const mode = loadParserMode();
    const state = mode.startState();

    state.objects = { p: {} };
    state.names = ["p"];

    feedLine(mode, state, "three_dimensions", 1);
    feedLine(mode, state, "rules", 2);
    const tokens = feedLine(mode, state, "[ front p ] -> [ back p ]", 3);

    assert(state.metadata.includes("three_dimensions"));
    assert.deepStrictEqual(
        state.rules,
        [["[ front p ] -> [ back p ]", 3, "[ front p ] -> [ back p ]"]]
    );
    assert(tokens.includes("DIRECTION"));
    assert(!tokens.includes("ERROR"));
}

function testPuzzleScriptParserThreeDimensionsRoutesLevelsTo3D() {
    const mode = loadParserMode();
    const state = mode.startState();

    state.objects = { "#": {}, ".": {}, p: {}, b: {}, g: {} };
    feedLine(mode, state, "three_dimensions", 1);
    feedLine(mode, state, "levels", 2);
    feedLine(mode, state, "###", 3);
    feedLine(mode, state, "#p#", 4);
    feedLine(mode, state, "###", 5);
    feedLine(mode, state, ";", 6);
    feedLine(mode, state, "...", 7);
    feedLine(mode, state, ".g.", 8);
    feedLine(mode, state, "...", 9);
    mode.blankLine(state);
    feedLine(mode, state, "###", 11);
    feedLine(mode, state, "#b#", 12);
    feedLine(mode, state, "###", 13);

    assert.strictEqual(state.section, "levels");
    assert.deepStrictEqual(state.levels, [[]]);
    assert.deepStrictEqual(
        state.threeDimensionLevels,
        [
            [3, null, "###", "#p#", "###", ";", "...", ".g.", "..."],
            [11, null, "###", "#b#", "###"]
        ]
    );
}

function testPuzzleScriptParserNormalLevelsRemain2D() {
    const mode = loadParserMode();
    const state = mode.startState();

    state.objects = { "#": {}, p: {} };
    feedLine(mode, state, "levels", 1);
    feedLine(mode, state, "#p#", 2);
    mode.blankLine(state);
    feedLine(mode, state, "###", 4);

    assert.deepStrictEqual(
        state.levels,
        [
            [2, null, "#p#"],
            [4, null, "###"]
        ]
    );
    assert.deepStrictEqual(state.threeDimensionLevels, [[]]);
}

function testPuzzleScriptParserThreeDimensionsObjectSpritesUse2DRowsStackedBySlice() {
    const mode = loadParserMode();
    const state = mode.startState();

    feedLine(mode, state, "three_dimensions", 1);
    feedLine(mode, state, "objects", 2);
    feedLine(mode, state, "player", 3);
    feedLine(mode, state, "blue orange", 4);
    feedLine(mode, state, "01", 5);
    feedLine(mode, state, ".0", 6);
    feedLine(mode, state, ";", 7);
    feedLine(mode, state, "10", 8);
    feedLine(mode, state, "0.", 9);
    mode.blankLine(state);

    assert.deepStrictEqual(
        state.objects.player.spritematrix,
        [
            [0, 1],
            [-1, 0]
        ]
    );
    assert.deepStrictEqual(
        state.objects.player.sprite3matrix,
        [
            [
                [0, 1],
                [1, 0]
            ],
            [
                [-1, 0],
                [0, -1]
            ]
        ]
    );
}

function testCompilerThreeDimensionLevelsLowering() {
    const { compiler, errors } = loadCompilerForTest();
    assert.strictEqual(typeof compiler.lowerThreeDimensionLevels, "function");

    const state = Object.assign(makeCompilerState(), {
        threeDimensionLevels: [
            [20, null, "###", "#p#", "###", ";", "...", ".g.", "..."],
            []
        ]
    });

    compiler.lowerThreeDimensionLevels(state);

    assert.deepStrictEqual(errors, []);
    assert.strictEqual(state.threeDimensionLevels, undefined);
    assert.strictEqual(state.levels.length, 1);
    assert.deepStrictEqual(
        pickDimensions(state.levels[0]),
        { width: 3, height: 2, depth: 3 }
    );
    assert.deepStrictEqual(
        state.levels[0].slices,
        [
            ["###", "#p#", "###"],
            ["...", ".g.", "..."]
        ]
    );
}

function testCompilerThreeDimensionLevelsErrors() {
    const { compiler, errors } = loadCompilerForTest();
    const state = {
        threeDimensionLevels: [
            [5, null, "##", "###"]
        ]
    };

    compiler.lowerThreeDimensionLevels(state);

    assert.strictEqual(errors.length, 1);
    assert(errors[0].message.includes("row_width_mismatch"));
    assert.strictEqual(errors[0].lineNumber, 6);
}

function testCompilerThreeDimensionLevelCellLoweringUsesExplicitDotGlyph() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    const parsedLevel = ThreeDimensionLevels.parseThreeDimensionLevel([
        { text: "p.", lineNumber: 30 },
        { text: ".#", lineNumber: 31 }
    ]).level;

    const level = compiler.levelFromThreeDimensionParsedSource(state, parsedLevel);

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(
        pickDimensions(level),
        { width: 2, height: 1, depth: 2 }
    );
    assert.strictEqual(level.cellCount, 4);
    assert.deepStrictEqual(cellBits(level, 0), [0, 1]);
    assert.deepStrictEqual(cellBits(level, 1), [0]);
    assert.deepStrictEqual(cellBits(level, 2), [0]);
    assert.deepStrictEqual(cellBits(level, 3), [0, 2]);
}

function testCompilerThreeDimensionLevelCellLoweringMapsRowsToZAndSlicesToY() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    const parsedLevel = ThreeDimensionLevels.parseThreeDimensionLevel([
        { text: "p.", lineNumber: 70 },
        { text: "##", lineNumber: 71 },
        { text: ";", lineNumber: 72 },
        { text: ".#", lineNumber: 73 },
        { text: "p.", lineNumber: 74 }
    ]).level;

    const level = compiler.levelFromThreeDimensionParsedSource(state, parsedLevel);

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(
        pickDimensions(level),
        { width: 2, height: 2, depth: 2 }
    );
    assert.deepStrictEqual(cellBitsAtCoord(level, 0, 0, 0), [0, 1]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 0, 0, 1), [0, 2]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 0, 1, 0), [0]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 0, 1, 1), [0, 1]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 1, 0, 0), [0]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 1, 0, 1), [0, 2]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 1, 1, 0), [0, 2]);
    assert.deepStrictEqual(cellBitsAtCoord(level, 1, 1, 1), [0]);
}

function testCompilerThreeDimensionLevelCellLoweringRejectsUndefinedDotGlyph() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    delete state.glyphDict["."];
    const parsedLevel = ThreeDimensionLevels.parseThreeDimensionLevel([
        { text: "p.", lineNumber: 40 }
    ]).level;

    compiler.levelFromThreeDimensionParsedSource(state, parsedLevel);

    assert.strictEqual(errors.length, 1);
    assert(errors[0].message.includes('symbol "."'));
    assert(errors[0].message.includes("not found"));
    assert.strictEqual(errors[0].lineNumber, 40);
}

function testCompilerThreeDimensionLevelCellLoweringRejectsPropertyGlyph() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    state.glyphDict.o = undefined;
    state.propertiesDict.o = ["player", "wall"];
    const parsedLevel = ThreeDimensionLevels.parseThreeDimensionLevel([
        { text: "o", lineNumber: 50 }
    ]).level;

    compiler.levelFromThreeDimensionParsedSource(state, parsedLevel);

    assert.strictEqual(errors.length, 1);
    assert(errors[0].message.includes('symbol "o"'));
    assert(errors[0].message.includes("ambiguous"));
    assert.strictEqual(errors[0].lineNumber, 50);
}

function testCompilerThreeDimensionLevelBackgroundFillUsesFirstExplicitBackgroundCell() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    state.glyphDict.x = [3, -1];
    state.layerMasks[0] = bitVecWithBits(0, 3);
    const parsedLevel = ThreeDimensionLevels.parseThreeDimensionLevel([
        { text: "xp", lineNumber: 60 },
        { text: "p#", lineNumber: 61 }
    ]).level;

    const level = compiler.levelFromThreeDimensionParsedSource(state, parsedLevel);

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(cellBits(level, 0), [3]);
    assert.deepStrictEqual(cellBits(level, 1), [1, 3]);
    assert.deepStrictEqual(cellBits(level, 2), [1, 3]);
    assert.deepStrictEqual(cellBits(level, 3), [2, 3]);
}

function testCompilerDeclares3DHostRendererCapabilitiesStructurally() {
    const { compiler } = loadCompilerForTest();

    assert.deepStrictEqual(
        compiler.inferHostCapabilities({ levels: [{ is3d: true }] }),
        [
            {
                kind: "renderer",
                renderer: "three3d",
                requires: ["THREE", "webgl"],
                owner: "graphics3d"
            }
        ]
    );
    assert.deepStrictEqual(
        compiler.inferHostCapabilities({ levels: [{ width: 1, height: 1 }] }),
        []
    );
}

function testPlayHost3DRendererUses2DProcessInputEntryShape() {
    const session = { runtime: {}, state: {} };
    const compiledState = { levels: [{ is3d: true }] };
    const calls = [];
    let renderedFrame = null;

    global.canvas = {};
    global.window = {
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
        puzzle3DSession: session,
        puzzle3DCompiledState: compiledState,
        GameRuntime3D: {
            processSessionTurn3D: function(actualSession, direction, options) {
                calls.push({ actualSession, direction, options });
                return {
                    session: actualSession,
                    turn: { changed: false, boardChanged: true, moved: false },
                    turns: [],
                    sessionState: { levelIndex: 0 }
                };
            }
        },
        Puzzle3DRenderFrame: {
            buildSessionTurnRenderFrame3D: function(result, options) {
                return { result, options };
            }
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: function(_canvas, frame) {
                renderedFrame = frame;
            }
        }
    };

    delete require.cache[require.resolve("../src/js/play_host3d.js")];
    const playHost3D = require("../src/js/play_host3d.js");
    const changed = playHost3D.processInput(0, true, false, "backup", 12);

    assert.strictEqual(changed, true);
    assert.deepStrictEqual(calls, [
        {
            actualSession: session,
            direction: "front",
            options: { dontDoWin: true, dontModify: false, backup: "backup", coord: 12, deferAgain: true, deferWin: true, deferQuit: true }
        }
    ]);
    assert.strictEqual(window.puzzle3DRenderFrame, renderedFrame);

    playHost3D.restore();
    assert.strictEqual(window.puzzle3DSession, null);

    delete global.window;
    delete global.canvas;
    delete global.dirNames;
}

function testCompilerLowersPuzzleScriptRuleTo3DMasks() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    state.rules = [
        {
            lineNumber: 70,
            direction: "right",
            lhs: [
                [
                    ["", "player"],
                    ["", "wall"]
                ]
            ],
            rhs: [
                [
                    ["right", "player"],
                    ["", "wall"]
                ]
            ],
            groupNumber: 70,
            commands: []
        }
    ];

    const lowered = compiler.rulesToMask3D(state);
    const rule = lowered.groups[0];
    const pattern = rule.patterns[0];

    assert.deepStrictEqual(errors, []);
    assert.strictEqual(state.rules3d, lowered);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(rule, "unsupportedFeatures"), false);
    assert.deepStrictEqual(pattern.cells.map(cell => cell.offset), [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 }
    ]);
    assert.deepStrictEqual(Array.from(pattern.cells[0].pattern.objectsPresent), [2]);
    assert.deepStrictEqual(Array.from(pattern.cells[1].pattern.objectsPresent), [4]);
    assert.deepStrictEqual(Array.from(pattern.cells[0].pattern.replacement.movementsSet), [movement3D("right", 1)]);
}

function testCompilerLowersDirectionWords3D() {
    const { compiler, errors } = loadCompilerForTest();
    const state = makeCompilerState();
    state.rules = [
        {
            lineNumber: 75,
            direction: "front",
            lhs: [
                [
                    ["front", "player"],
                    ["", "wall"]
                ]
            ],
            rhs: [
                [
                    ["back", "player"],
                    ["", "wall"]
                ]
            ],
            groupNumber: 75,
            commands: []
        }
    ];

    const lowered = compiler.rulesToMask3D(state);
    const pattern = lowered.groups[0].patterns[0];

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(pattern.cells.map(cell => cell.offset), [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -1 }
    ]);
    assert.deepStrictEqual(Array.from(pattern.cells[0].pattern.movementsPresent), [movement3D("front", 1)]);
    assert.deepStrictEqual(Array.from(pattern.cells[0].pattern.replacement.movementsSet), [movement3D("back", 1)]);
}


function testCompilerLowersReplacement3DClearsDisappearingLayer() {
    const { compiler } = loadCompilerForTest();
    const state = makeCompilerState();
    state.rules = [
        {
            lineNumber: 80,
            direction: "right",
            lhs: [
                [
                    ["", "player"]
                ]
            ],
            rhs: [
                [
                    []
                ]
            ],
            groupNumber: 80,
            commands: []
        }
    ];

    const replacement = compiler.rulesToMask3D(state).groups[0].patterns[0].cells[0].pattern.replacement;

    assert.deepStrictEqual(Array.from(replacement.objectsClear), [6]);
    assert.deepStrictEqual(Array.from(replacement.movementsLayerMask), [movementLayerMask3D(1)]);
}

function testCompilerKeepsLate3DAsTurnPhaseNotUnsupportedFeature() {
    const { compiler } = loadCompilerForTest();
    const state = makeCompilerState();
    state.rules = [
        {
            lineNumber: 90,
            direction: "right",
            lhs: [
                [
                    ["right", "player"]
                ]
            ],
            rhs: [
                [
                    ["right", "player"]
                ]
            ],
            late: true,
            rigid: false,
            groupNumber: 90,
            commands: []
        }
    ];

    const lowered = compiler.rulesToMask3D(state);

    assert.strictEqual(lowered.groups.length, 0);
    assert.strictEqual(lowered.lateGroups.length, 1);
    assert.deepStrictEqual(Array.from(lowered.lateGroups[0].patterns[0].cells[0].pattern.movementsPresent), [movement3D("right", 1)]);
}

function testCompilerPreservesNonSpatialRuleFeatures3D() {
    const { compiler } = loadCompilerForTest();
    const state = makeCompilerState();
    state.rules = [
        {
            lineNumber: 91,
            direction: "right",
            lhs: [
                [
                    ["", "player"]
                ]
            ],
            rhs: [
                [
                    ["", "player"]
                ]
            ],
            late: true,
            rigid: true,
            groupNumber: 91,
            commands: [["win"]]
        }
    ];

    const lowered = compiler.rulesToMask3D(state);

    assert.strictEqual(lowered.lateGroups.length, 1);
    assert.deepStrictEqual(lowered.lateGroups[0].commands, [["win"]]);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(lowered.lateGroups[0], "unsupportedFeatures"), false);
}

function pickDimensions(level) {
    return {
        width: level.width,
        height: level.height,
        depth: level.depth
    };
}

function assertHasError(result, code) {
    assert(
        result.errors.some(error => error.code === code),
        `Expected ${code}, got ${JSON.stringify(result.errors)}`
    );
}

function loadCompilerForTest() {
    global.ThreeDimensionLevels = ThreeDimensionLevels;
    const errors = [];
    global.logError = (message, lineNumber) => errors.push({ message, lineNumber });
    global.logErrorNoLine = message => errors.push({ message, lineNumber: null });
    global.Level = function() {};
    global.BitVec = TestBitVec;

    delete require.cache[require.resolve("../src/js/compiler3d.js")];
    const compiler = require("../src/js/compiler3d.js");
    return { compiler, errors };
}

function makeCompilerState() {
    return {
        STRIDE_OBJ: 1,
        STRIDE_MOV: 1,
        MOV_BITS: 7,
        MOV_MASK: MOV_MASK_3D,
        backgroundid: 0,
        backgroundlayer: 0,
        collisionLayers: [["background"], ["player", "wall"]],
        objects: {
            background: { id: 0, layer: 0 },
            player: { id: 1, layer: 1 },
            wall: { id: 2, layer: 1 }
        },
        objectMasks: {
            background: bitVecWithBits(0),
            player: bitVecWithBits(1),
            wall: bitVecWithBits(2)
        },
        propertiesSingleLayer: {},
        glyphDict: {
            ".": [0, -1],
            p: [-1, 1],
            g: [-1, 1],
            b: [-1, 2],
            "#": [-1, 2]
        },
        propertiesDict: {},
        layerMasks: [
            bitVecWithBits(0),
            bitVecWithBits(1, 2)
        ]
    };
}

function bitVecWithBits() {
    const bitvec = new TestBitVec(1);
    for (let i = 0; i < arguments.length; i++)
        bitvec.ibitset(arguments[i]);
    return bitvec;
}

function cellBits(level, index) {
    const value = level.objects[index];
    const bits = [];
    for (let i = 0; i < 32; i++) {
        if (value & (1 << i))
            bits.push(i);
    }
    return bits;
}

function glyphAt(level, x, y, z) {
    return level.slices[y][z].charAt(x);
}

function cellBitsAtCoord(level, x, y, z) {
    return cellBits(level, ThreeDimensionLevels.coordToIndex3(x, y, z, level));
}

class TestBitVec {
    constructor(init) {
        this.data = init instanceof Int32Array ? new Int32Array(init) : new Int32Array(init);
    }

    iand(other) {
        for (let i = 0; i < this.data.length; i++)
            this.data[i] &= other.data[i];
    }

    ior(other) {
        for (let i = 0; i < this.data.length; i++)
            this.data[i] |= other.data[i];
    }

    ibitset(index) {
        this.data[index >> 5] |= 1 << (index & 31);
    }

    iszero() {
        return this.data.every(value => value === 0);
    }

    bitsClearInArray(arr) {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] & arr[i])
                return false;
        }
        return true;
    }

    anyBitsInCommon(other) {
        return !this.bitsClearInArray(other.data);
    }
}

function loadParserMode() {
    global.window = {
        CodeMirror: {
            defineMode: (_name, modeFactory) => {
                global.__puzzleModeFactory = modeFactory;
            }
        }
    };
    global.consolePrint = () => {};
    global.logError = () => {};
    global.logWarning = () => {};
    global.logWarningNoLine = () => {};
    global.colorPalettes = { arnecolors: { blue: "#0000ff", orange: "#ff8800" } };
    global.applyTransforms = () => {};
    global.wordAlreadyDeclared = (state, name) => state.names.includes(name);
    global.createObjectRef = () => false;

    delete require.cache[require.resolve("../src/js/parser3d.js")];
    require("../src/js/parser3d.js");

    assert(global.__puzzleModeFactory, "parser3d.js did not register a CodeMirror mode");
    return global.__puzzleModeFactory();
}

function feedLine(mode, state, line, lineNumber) {
    state.lineNumber = lineNumber;
    const stream = new TestStringStream(line);
    const tokens = [];
    let guard = 0;

    do {
        const before = stream.pos;
        const kind = mode.token(stream, state);
        if (kind != null)
            tokens.push(kind);
        if (stream.pos === before && stream.eol())
            break;
        guard++;
        assert(guard < 100, `Parser did not finish line: ${line}`);
    } while (!stream.eol());

    return tokens;
}

class TestStringStream {
    constructor(string) {
        this.string = string;
        this.pos = 0;
        this.start = 0;
        this.lineStart = 0;
    }

    sol() {
        return this.pos === 0;
    }

    eol() {
        return this.pos >= this.string.length;
    }

    eatWhile(regex) {
        while (!this.eol() && regex.test(this.string[this.pos]))
            this.pos++;
    }

    eatSpace() {
        this.eatWhile(/[ \t]/);
    }

    peek() {
        return this.string[this.pos];
    }

    next() {
        return this.string[this.pos++];
    }

    skipToEnd() {
        this.pos = this.string.length;
    }

    match(pattern, consume) {
        const shouldConsume = consume !== false;
        const rest = this.string.slice(this.pos);

        if (typeof pattern === "string") {
            const matched = rest.startsWith(pattern);
            if (matched && shouldConsume)
                this.pos += pattern.length;
            return matched;
        }

        const match = rest.match(pattern);
        if (!match || match.index !== 0)
            return null;
        if (shouldConsume)
            this.pos += match[0].length;
        return match;
    }
}

testParseThreeDimensionLevels();
testInlineSemicolonIsNotASeparator();
testValidationErrors();
testCoordRoundTrip();
testAsciiLevelAxisContract();
testPuzzleScriptParserLegacyLevels3SectionIsNotASection();
testPuzzleScriptParserThreeDimensionsLevelsIsCaseInsensitiveByDefault();
testPuzzleScriptParserThreeDimensionsLevelsHonorsCaseSensitivePrelude();
testPuzzleScriptParserThreeDimensionsPreludeEnables3DDirections();
testPuzzleScriptParserThreeDimensionsRoutesLevelsTo3D();
testPuzzleScriptParserNormalLevelsRemain2D();
testPuzzleScriptParserThreeDimensionsObjectSpritesUse2DRowsStackedBySlice();
testCompilerThreeDimensionLevelsLowering();
testCompilerThreeDimensionLevelsErrors();
testCompilerThreeDimensionLevelCellLoweringUsesExplicitDotGlyph();
testCompilerThreeDimensionLevelCellLoweringMapsRowsToZAndSlicesToY();
testCompilerThreeDimensionLevelCellLoweringRejectsUndefinedDotGlyph();
testCompilerThreeDimensionLevelCellLoweringRejectsPropertyGlyph();
testCompilerThreeDimensionLevelBackgroundFillUsesFirstExplicitBackgroundCell();
testCompilerDeclares3DHostRendererCapabilitiesStructurally();
testPlayHost3DRendererUses2DProcessInputEntryShape();
testCompilerLowersPuzzleScriptRuleTo3DMasks();
testCompilerLowersDirectionWords3D();
testCompilerLowersReplacement3DClearsDisappearingLayer();
testCompilerKeepsLate3DAsTurnPhaseNotUnsupportedFeature();
testCompilerPreservesNonSpatialRuleFeatures3D();

console.log("3d tests passed");
