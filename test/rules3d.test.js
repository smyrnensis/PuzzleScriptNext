const assert = require("assert");

const cellMatch = require("../src/js/cell_match3d.js");
const slots = require("../src/js/slots3d.js");
const runtimeApi = require("../src/js/runtime3d.js");
const frames = require("../src/js/rule_frames3d.js");
const rules = require("../src/js/rules3d.js");

function movement(board, direction, layer) {
    return board.directionBits[direction] << (board.movementBits * layer);
}

function testFindsAbsolutePatternMatchesOn3DBoard() {
    const runtime = makeRuntime(3, 1, 1, 1);
    runtime.board.setCell(runtime.board.coordToIndex(1, 0, 0), cellMatch.bitMask(1, [2]));

    const pattern = rules.makePattern([
        {
            offset: { x: 0, y: 0, z: 0 },
            pattern: rules.makeCellPattern({
                objectsPresent: cellMatch.bitMask(1, [2])
            })
        }
    ]);

    const matches = rules.findPatternMatches(runtime.board, pattern);

    assert.deepStrictEqual(matches.map(match => match.origin), [runtime.board.coordToIndex(1, 0, 0)]);
}

function testRejectsAbsolutePatternWhenNoObjectMaskMatches() {
    const runtime = makeRuntime(2, 1, 1, 1);
    runtime.board.setCell(0, cellMatch.bitMask(1, [1]));

    const pattern = rules.makePattern([
        {
            offset: { x: 0, y: 0, z: 0 },
            pattern: rules.makeCellPattern({
                objectsMissing: cellMatch.bitMask(1, [1])
            })
        }
    ]);

    const matches = rules.findPatternMatches(runtime.board, pattern);

    assert.deepStrictEqual(matches.map(match => match.origin), [1]);
}

function testPatternMatchingIncludesMovementMasks() {
    const runtime = makeRuntime(2, 1, 1, 1);
    const board = runtime.board;
    runtime.board.setCell(0, cellMatch.bitMask(1, [1]));
    runtime.board.setMovements(0, new Int32Array([movement(board, "up", 1)]));

    const pattern = rules.makePattern([
        {
            offset: { x: 0, y: 0, z: 0 },
            pattern: rules.makeCellPattern({
                objectsPresent: cellMatch.bitMask(1, [1]),
                movementsPresent: new Int32Array([movement(board, "up", 1)]),
                movementsMissing: new Int32Array([0x0002])
            })
        }
    ]);

    assert.deepStrictEqual(rules.findPatternMatches(runtime.board, pattern).map(match => match.origin), [0]);

    pattern.cells[0].pattern.movementsMissing = new Int32Array([movement(board, "up", 1)]);
    assert.deepStrictEqual(rules.findPatternMatches(runtime.board, pattern), []);
}

function testCellReplacementAppliesObjectAndMovementMasksLike2DReplacement() {
    const runtime = makeRuntime(2, 1, 1, 1);
    const board = runtime.board;
    board.setCell(0, new Int32Array([0b0011]));
    board.setMovements(0, new Int32Array([0x0084]));

    const replacement = rules.makeCellReplacement({
        objectsClear: new Int32Array([0b0001]),
        objectsSet: new Int32Array([0b0100]),
        movementsClear: new Int32Array([0x0004]),
        movementsSet: new Int32Array([0x0100])
    });

    assert.strictEqual(rules.applyCellReplacement(board, 0, replacement), true);
    assert.deepStrictEqual(Array.from(board.getCell(0)), [0b0110]);
    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0x0180]);
    assert.strictEqual(rules.applyCellReplacement(board, 0, replacement), false);
}

function testCellReplacementRecordsSfxCreateDestroyArtifacts() {
    const runtime = makeRuntimeWithObjects(2, 1, 1, {
        layerCount: 2,
        idDict: ["background", "player", "crate"],
        objects: {
            background: { layer: 0 },
            player: { layer: 1 },
            crate: { layer: 1 }
        },
        sfx_CreationMasks: [{ objId: 2, seed: "33" }],
        sfx_DestructionMasks: [{ objId: 1, seed: "44" }]
    });
    const board = runtime.board;
    board.setCell(0, new Int32Array([0b0011]));

    const replacement = rules.makeCellReplacement({
        objectsClear: new Int32Array([0b0010]),
        objectsSet: new Int32Array([0b0100])
    });

    assert.strictEqual(rules.applyCellReplacement(board, 0, replacement), true);
    assert.deepStrictEqual(Array.from(board.sfxCreateMask), [0b0100]);
    assert.deepStrictEqual(Array.from(board.sfxDestroyMask), [0b0010]);
    assert.deepStrictEqual(board.sfxCreateList, [{ posIndex: 0, objId: 2 }]);
    assert.deepStrictEqual(board.sfxDestroyList, [{ posIndex: 0, objId: 1 }]);
}

function testRandomEntityReplacementUsesSharedLayerClearSemantics() {
    const runtime = makeRuntimeWithObjects(2, 1, 1, {
        layerCount: 2,
        idDict: ["background", "crateA", "crateB"],
        objects: {
            background: { layer: 0 },
            crateA: { layer: 1 },
            crateB: { layer: 1 }
        }
    });
    const board = runtime.board;
    board.uniform = () => 0;
    board.setCell(0, new Int32Array([0b0011]));
    board.setMovements(0, new Int32Array([0x0402]));

    const replacement = rules.makeCellReplacement({
        randomEntityMask: new Int32Array([0b0100])
    });

    assert.strictEqual(rules.applyCellReplacement(board, 0, replacement), true);
    assert.deepStrictEqual(Array.from(board.getCell(0)), [0b0101]);
    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0x0002]);
}

function testRandomDirReplacementUses3DDirectionDomain() {
    const runtime = makeRuntimeWithObjects(2, 1, 1, {
        layerCount: 2,
        idDict: ["background", "player"],
        objects: {
            background: { layer: 0 },
            player: { layer: 1 }
        }
    });
    const board = runtime.board;
    board.uniform = () => 5 / 6;
    board.setCell(0, new Int32Array([0b0010]));
    board.setMovements(0, new Int32Array([0]));

    const replacement = rules.makeCellReplacement({
        randomDirMask: new Int32Array([1 << 7])
    });

    assert.strictEqual(rules.applyCellReplacement(board, 0, replacement), true);
    assert.deepStrictEqual(Array.from(board.getMovements(0)), [movement(board, "back", 1)]);
}

function testMatchReplacementUsesPatternReplacementAtMatchedCells() {
    const runtime = makeRuntime(2, 1, 1, 1);
    const board = runtime.board;
    board.setCell(1, new Int32Array([0b0001]));

    const pattern = rules.makePattern([
        {
            offset: {},
            pattern: rules.makeCellPattern({
                objectsPresent: new Int32Array([0b0001]),
                replacement: rules.makeCellReplacement({
                    objectsClear: new Int32Array([0b0001]),
                    objectsSet: new Int32Array([0b0010])
                })
            })
        }
    ]);
    const match = rules.findPatternMatches(board, pattern)[0];

    assert.strictEqual(rules.applyMatchReplacements(board, match), true);
    assert.deepStrictEqual(Array.from(board.getCell(1)), [0b0010]);
}

function testExpandsRelativeMarkersThrough24RuleFrames() {
    const pattern = rules.makePattern([
        {
            offset: { x: 0, y: 0, z: 0 },
            pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [1]) })
        },
        {
            offset: { relative: { ">": 1 } },
            pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [2]) })
        },
        {
            offset: { relative: { "^": 1 } },
            pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [3]) })
        },
        {
            offset: { relative: { "o": 1 } },
            pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [4]) })
        }
    ], {
        frameExpansion: "proper-orthogonal-frames"
    });

    const variants = rules.expandPatternFrames(pattern);
    const standardVariant = variants.find(variant => variant.frame.markerDirections[">"] === "right"
        && variant.frame.markerDirections["^"] === "front"
        && variant.frame.markerDirections["o"] === "up");

    assert.strictEqual(variants.length, 24);
    assert.deepStrictEqual(standardVariant.cells.map(cell => cell.offset), [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: -1 },
        { x: 0, y: -1, z: 0 }
    ]);
}

function testFindsRelativePatternUsingStandardFramePlacement() {
    const runtime = makeRuntime(3, 3, 3, 1);
    const origin = runtime.board.coordToIndex(1, 1, 1);
    runtime.board.setCell(origin, cellMatch.bitMask(1, [1]));
    runtime.board.setCell(runtime.board.coordToIndex(2, 1, 1), cellMatch.bitMask(1, [2]));
    runtime.board.setCell(runtime.board.coordToIndex(1, 1, 0), cellMatch.bitMask(1, [3]));
    runtime.board.setCell(runtime.board.coordToIndex(1, 0, 1), cellMatch.bitMask(1, [4]));

    const pattern = rules.makePattern([
        { offset: {}, pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [1]) }) },
        { offset: { relative: { ">": 1 } }, pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [2]) }) },
        { offset: { relative: { "^": 1 } }, pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [3]) }) },
        { offset: { relative: { "o": 1 } }, pattern: rules.makeCellPattern({ objectsPresent: cellMatch.bitMask(1, [4]) }) }
    ], {
        frameExpansion: "proper-orthogonal-frames"
    });

    const matches = rules.findPatternMatches(runtime.board, pattern);

    assert(matches.some(match => match.origin === origin
        && match.frame.markerDirections[">"] === "right"
        && match.frame.markerDirections["^"] === "front"
        && match.frame.markerDirections["o"] === "up"));
}

function testNormalRulesUseLocalRadiusScanBoundsLike2D() {
    const runtime = makeRuntime(5, 5, 1, 1);
    const board = runtime.board;
    for (let index = 0; index < board.cellCount; index++)
        board.setCell(index, new Int32Array([1]));

    const pattern = rules.makePattern([
        { offset: {}, pattern: rules.makeCellPattern({ objectsPresent: new Int32Array([1]) }) },
        { offset: { x: 1, y: 0, z: 0 }, pattern: rules.makeCellPattern({ objectsPresent: new Int32Array([1]) }) }
    ]);

    const matches = rules.findPatternMatches(board, pattern, {
        scanDirection: "right",
        localRadius: "1",
        playerPositions: [board.coordToIndex(2, 2, 0)]
    });

    assert.deepStrictEqual(matches.map(match => match.origin), [
        board.coordToIndex(1, 1, 0),
        board.coordToIndex(2, 1, 0),
        board.coordToIndex(1, 2, 0),
        board.coordToIndex(2, 2, 0),
        board.coordToIndex(1, 3, 0),
        board.coordToIndex(2, 3, 0)
    ]);
}

function testGlobalRulesBypassLocalRadiusScanBoundsLike2D() {
    const runtime = makeRuntime(5, 5, 1, 1);
    const board = runtime.board;
    for (let index = 0; index < board.cellCount; index++)
        board.setCell(index, new Int32Array([1]));

    const pattern = rules.makePattern([
        { offset: {}, pattern: rules.makeCellPattern({ objectsPresent: new Int32Array([1]) }) },
        { offset: { x: 1, y: 0, z: 0 }, pattern: rules.makeCellPattern({ objectsPresent: new Int32Array([1]) }) }
    ]);

    const matches = rules.findPatternMatches(board, pattern, {
        scanDirection: "right",
        isGlobal: true,
        localRadius: "1",
        playerPositions: [board.coordToIndex(2, 2, 0)]
    });

    assert.deepStrictEqual(matches.map(match => match.origin), [
        0, 5, 10, 15,
        1, 6, 11, 16,
        2, 7, 12, 17,
        3, 8, 13, 18,
        4, 9, 14, 19
    ]);
}

function testEllipsisPatternMatchesVariableGapAlongRuleAxisLike2D() {
    const runtime = makeRuntime(5, 1, 1, 1);
    const board = runtime.board;
    board.setCell(0, new Int32Array([0b0001]));
    board.setCell(3, new Int32Array([0b0010]));

    const pattern = rules.makePattern([
        { offset: { x: 0, y: 0, z: 0 }, rowIndex: 0, pattern: rules.makeCellPattern({ objectsPresent: new Int32Array([0b0001]) }) },
        { ellipsis: true, rowIndex: 1 },
        { offset: { x: 2, y: 0, z: 0 }, rowIndex: 2, pattern: rules.makeCellPattern({ objectsPresent: new Int32Array([0b0010]) }) }
    ], {
        ellipsisCount: 1
    });

    const matches = rules.findPatternMatches(board, pattern, { scanDirection: "right" });

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].origin, 0);
    assert.deepStrictEqual(matches[0].gaps, [2]);
    assert.deepStrictEqual(matches[0].cells.map(cell => cell.index), [0, 3]);
}

function makeRuntime(width, height, depth, strideObj) {
    const cellCount = width * height * depth;
    const level = {
        is3d: true,
        width,
        height,
        depth,
        cellCount,
        n_tiles: cellCount,
        layerCount: 1,
        objects: new Int32Array(cellCount * strideObj)
    };

    return runtimeApi.createRuntime3D(slots.buildSlots3D({
        metadata: {},
        default_metadata: {},
        levels: [level]
    }));
}

function makeRuntimeWithObjects(width, height, depth, stateOptions) {
    const cellCount = width * height * depth;
    const level = {
        is3d: true,
        width,
        height,
        depth,
        cellCount,
        n_tiles: cellCount,
        layerCount: stateOptions.layerCount,
        objects: new Int32Array(cellCount)
    };

    return runtimeApi.createRuntime3D(slots.buildSlots3D({
        metadata: {},
        default_metadata: {},
        levels: [level],
        collisionLayers: new Array(stateOptions.layerCount).fill(null),
        objectCount: stateOptions.idDict.length,
        idDict: stateOptions.idDict,
        objects: stateOptions.objects,
        sfx_CreationMasks: stateOptions.sfx_CreationMasks || [],
        sfx_DestructionMasks: stateOptions.sfx_DestructionMasks || []
    }));
}

testFindsAbsolutePatternMatchesOn3DBoard();
testRejectsAbsolutePatternWhenNoObjectMaskMatches();
testPatternMatchingIncludesMovementMasks();
testCellReplacementAppliesObjectAndMovementMasksLike2DReplacement();
testCellReplacementRecordsSfxCreateDestroyArtifacts();
testRandomEntityReplacementUsesSharedLayerClearSemantics();
testRandomDirReplacementUses3DDirectionDomain();
testMatchReplacementUsesPatternReplacementAtMatchedCells();
testExpandsRelativeMarkersThrough24RuleFrames();
testFindsRelativePatternUsingStandardFramePlacement();
testNormalRulesUseLocalRadiusScanBoundsLike2D();
testGlobalRulesBypassLocalRadiusScanBoundsLike2D();
testEllipsisPatternMatchesVariableGapAlongRuleAxisLike2D();

console.log("3d rule tests passed");
