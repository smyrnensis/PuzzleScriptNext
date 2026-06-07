const assert = require("assert");

const slots = require("../src/js/slots3d.js");
const runtimeApi = require("../src/js/runtime3d.js");

const MOV_BITS_3D = 7;
const MOV_MASK_3D = 0x7f;

function testBoardCoordinateRoundTripMatchesLevel3IndexOrder() {
    const runtime = makeRuntime(3, 2, 4, 2);
    const board = runtime.board;

    for (let x = 0; x < board.width; x++) {
        for (let y = 0; y < board.height; y++) {
            for (let z = 0; z < board.depth; z++) {
                const index = board.coordToIndex(x, y, z);
                assert.strictEqual(index, x * board.height * board.depth + y * board.depth + z);
                assert.deepStrictEqual(board.indexToCoord(index), { x, y, z });
                assert.strictEqual(board.coordToIndex({ x, y, z }), index);
            }
        }
    }
}

function testNeighborUsesAbsolute3DDirectionsAndBounds() {
    const runtime = makeRuntime(3, 3, 3, 1);
    const board = runtime.board;
    const center = board.coordToIndex(1, 1, 1);

    assert.strictEqual(board.neighbor(center, "left"), board.coordToIndex(0, 1, 1));
    assert.strictEqual(board.neighbor(center, "right"), board.coordToIndex(2, 1, 1));
    assert.strictEqual(board.neighbor(center, "front"), board.coordToIndex(1, 1, 0));
    assert.strictEqual(board.neighbor(center, "back"), board.coordToIndex(1, 1, 2));
    assert.strictEqual(board.neighbor(center, "up"), board.coordToIndex(1, 0, 1));
    assert.strictEqual(board.neighbor(center, "down"), board.coordToIndex(1, 2, 1));

    assert.strictEqual(board.neighbor(board.coordToIndex(0, 1, 1), "left"), null);
    assert.strictEqual(board.neighbor(board.coordToIndex(1, 0, 1), "up"), null);
    assert.strictEqual(board.neighbor(board.coordToIndex(1, 1, 0), "front"), null);
}

function testAsciiAxisContractNeighbors() {
    const runtime = makeRuntime(2, 2, 2, 1);
    const board = runtime.board;
    const indexA = board.coordToIndex(0, 0, 0);
    const indexB = board.coordToIndex(1, 0, 0);
    const indexC = board.coordToIndex(0, 0, 1);
    const indexE = board.coordToIndex(0, 1, 0);

    assert.strictEqual(board.neighbor(indexA, "right"), indexB);
    assert.strictEqual(board.neighbor(indexA, "back"), indexC);
    assert.strictEqual(board.neighbor(indexA, "down"), indexE);
    assert.strictEqual(board.neighbor(indexB, "left"), indexA);
    assert.strictEqual(board.neighbor(indexC, "front"), indexA);
    assert.strictEqual(board.neighbor(indexE, "up"), indexA);
}

function testGetCellReturnsCopyAndSetCellOwnsMutation() {
    const runtime = makeRuntime(2, 1, 1, 2);
    const board = runtime.board;

    board.setCell(0, new Int32Array([10, 20]));
    const cell = board.getCell(0);
    cell[0] = 99;

    assert.deepStrictEqual(Array.from(board.getCell(0)), [10, 20]);

    board.setCell(0, cell);
    assert.deepStrictEqual(Array.from(board.getCell(0)), [99, 20]);
}

function testGetCellIntoCopiesIntoTargetLike2DLevel() {
    const runtime = makeRuntime(2, 1, 1, 2);
    const board = runtime.board;
    const target = { data: new Int32Array(2) };

    board.setCell(1, { data: new Int32Array([7, 8]) });

    assert.strictEqual(board.getCellInto(1, target), target);
    assert.deepStrictEqual(Array.from(target.data), [7, 8]);

    target.data[0] = 100;
    assert.deepStrictEqual(Array.from(board.getCell(1)), [7, 8]);
}

function testCloneCopiesCellsWithoutSharingMutation() {
    const runtime = makeRuntime(2, 1, 1, 2);
    const board = runtime.board;
    board.setCell(0, new Int32Array([1, 2]));

    const clone = board.clone();
    clone.setCell(0, new Int32Array([3, 4]));

    assert.deepStrictEqual(Array.from(board.getCell(0)), [1, 2]);
    assert.deepStrictEqual(Array.from(clone.getCell(0)), [3, 4]);

    const runtimeClone = runtime.clone();
    runtimeClone.board.setCell(0, new Int32Array([5, 6]));
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1, 2]);
    assert.deepStrictEqual(Array.from(runtimeClone.board.getCell(0)), [5, 6]);
}

function testMovementsMirror2DLevelCopyAndSetContract() {
    const runtime = makeRuntime(2, 1, 1, 1, { layerCount: 3 });
    const board = runtime.board;

    assert.strictEqual(board.movementBits, MOV_BITS_3D);
    assert.strictEqual(board.movementMask, MOV_MASK_3D);
    assert.strictEqual(board.strideMov, 1);

    board.setMovements(0, new Int32Array([0x102]));
    const movements = board.getMovements(0);
    movements[0] = 0x999;

    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0x102]);

    board.setMovements(0, movements);
    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0x999]);
}

function testGetMovementsIntoCopiesIntoTargetLike2DLevel() {
    const runtime = makeRuntime(2, 1, 1, 1, { layerCount: 5 });
    const board = runtime.board;
    const target = { data: new Int32Array(board.strideMov) };

    assert.strictEqual(board.strideMov, 2);
    board.setMovements(1, new Int32Array([7, 8]));

    assert.strictEqual(board.getMovementsInto(1, target), target);
    assert.deepStrictEqual(Array.from(target.data), [7, 8]);

    target.data[0] = 100;
    assert.deepStrictEqual(Array.from(board.getMovements(1)), [7, 8]);
}

function testCloneCopiesMovementsAndLayerMasksWithoutSharingMutation() {
    const runtime = makeRuntime(2, 1, 1, 1, {
        layerCount: 2,
        layerMasks: [new Int32Array([1]), new Int32Array([2])],
        objectLayers: [0, 1]
    });
    const board = runtime.board;

    board.setMovements(0, new Int32Array([0x08]));

    const clone = board.clone();
    clone.setMovements(0, new Int32Array([0x04]));
    clone.layerMasks[0][0] = 99;

    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0x08]);
    assert.deepStrictEqual(Array.from(clone.getMovements(0)), [0x04]);
    assert.strictEqual(board.layerMasks[0][0], 1);
    assert.deepStrictEqual(board.objectLayers, [0, 1]);
}

function testStartMovementSeedsLayerMovementMasksLike2DInput() {
    const runtime = makeRuntime(3, 1, 1, 1, {
        layerCount: 2,
        layerMasks: [new Int32Array([1]), new Int32Array([2])],
        objectLayers: [0, 1]
    });
    const board = runtime.board;
    board.setCell(1, new Int32Array([1]));

    assert.deepStrictEqual(board.startMovement(new Int32Array([1]), "right"), [1]);
    assert.deepStrictEqual(Array.from(board.getMovements(1)), [board.directionBits.right]);
}

function testActionInputUsesMovementFieldWithoutSpatialDisplacementLike2D() {
    const runtime = makeRuntime(2, 1, 1, 1, {
        layerCount: 1,
        layerMasks: [new Int32Array([1])],
        objectLayers: [0]
    });
    const board = runtime.board;
    board.movementTween.enabled = true;
    board.setCell(1, new Int32Array([1]));

    assert.deepStrictEqual(board.startMovement(new Int32Array([1]), "action"), [1]);
    assert.deepStrictEqual(Array.from(board.getMovements(1)), [board.directionBits.action]);
    assert.deepStrictEqual(board.resolveMovements(), {
        moved: true,
        rigidFailures: [],
        shouldUndo: false,
        movedEntities: { "p1-l0": board.directionBits.action }
    });
    assert.deepStrictEqual(Array.from(board.getCell(1)), [1]);
}

function testResolveMovementsMovesOnlyRequestedLayerAndClearsMovementMasks() {
    const runtime = makeRuntime(3, 1, 1, 1, {
        layerCount: 2,
        layerMasks: [new Int32Array([1]), new Int32Array([2])],
        objectLayers: [0, 1]
    });
    const board = runtime.board;
    board.setCell(0, new Int32Array([3]));
    board.moveEntitiesAtIndex(0, new Int32Array([1]), "right");

    assert.deepStrictEqual(board.resolveMovements(), {
        moved: true,
        rigidFailures: [],
        shouldUndo: false,
        movedEntities: {}
    });
    assert.deepStrictEqual(Array.from(board.getCell(0)), [2]);
    assert.deepStrictEqual(Array.from(board.getCell(1)), [1]);
    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0]);
}

function testResolveMovementsRecordsSpatialTweenDestinationByLayer() {
    const runtime = makeRuntime(3, 1, 1, 1, {
        layerCount: 2,
        layerMasks: [new Int32Array([1]), new Int32Array([2])],
        objectLayers: [0, 1]
    });
    const board = runtime.board;
    board.movementTween.enabled = true;
    board.setCell(0, new Int32Array([3]));
    board.moveEntitiesAtIndex(0, new Int32Array([1]), "right");

    assert.deepStrictEqual(board.resolveMovements(), {
        moved: true,
        rigidFailures: [],
        shouldUndo: false,
        movedEntities: { "p1-l0": board.directionBits.right }
    });
}

function testResolveMovementsRecordsMovementSfxArtifacts() {
    const runtime = makeRuntime(3, 1, 1, 1, {
        layerCount: 1,
        layerMasks: [new Int32Array([1])],
        objectLayers: [0],
        sfxMovementMasks: [[
            { objId: 0, directionMask: new Int32Array([8]), seed: "55" },
            { objId: 0, directionMask: new Int32Array([8]), seed: "afx:move" }
        ]]
    });
    const board = runtime.board;
    board.setCell(0, new Int32Array([1]));
    board.moveEntitiesAtIndex(0, new Int32Array([1]), "right");

    assert.deepStrictEqual(board.resolveMovements(), {
        moved: true,
        rigidFailures: [],
        shouldUndo: false,
        movedEntities: {}
    });
    assert.deepStrictEqual(board.sfxCanMoveSeeds, ["55"]);
    assert.deepStrictEqual(board.sfxAnimations, {
        "1,0": { kind: "move", seed: "afx:move", dir: 8 }
    });
}

function testResolveMovementsLeavesBlockedLayerInPlaceAndClearsFailedMovement() {
    const runtime = makeRuntime(3, 1, 1, 1, {
        layerCount: 1,
        layerMasks: [new Int32Array([3])],
        objectLayers: [0, 0]
    });
    const board = runtime.board;
    board.setCell(0, new Int32Array([1]));
    board.setCell(1, new Int32Array([2]));
    board.moveEntitiesAtIndex(0, new Int32Array([1]), "right");

    assert.deepStrictEqual(board.resolveMovements(), {
        moved: false,
        rigidFailures: [],
        shouldUndo: false,
        movedEntities: {}
    });
    assert.deepStrictEqual(Array.from(board.getCell(0)), [1]);
    assert.deepStrictEqual(Array.from(board.getCell(1)), [2]);
    assert.deepStrictEqual(Array.from(board.getMovements(0)), [0]);
}

function testResolveMovementsRecordsCantMoveSfxArtifacts() {
    const runtime = makeRuntime(3, 1, 1, 1, {
        layerCount: 1,
        layerMasks: [new Int32Array([3])],
        objectLayers: [0, 0],
        sfxMovementFailureMasks: [
            { objId: 0, directionMask: new Int32Array([8]), seed: "66" },
            { objId: 0, directionMask: new Int32Array([8]), seed: "afx:cant" }
        ]
    });
    const board = runtime.board;
    board.setCell(0, new Int32Array([1]));
    board.setCell(1, new Int32Array([2]));
    board.moveEntitiesAtIndex(0, new Int32Array([1]), "right");

    assert.deepStrictEqual(board.resolveMovements(), {
        moved: false,
        rigidFailures: [],
        shouldUndo: false,
        movedEntities: {}
    });
    assert.deepStrictEqual(board.sfxCantMoveSeeds, ["66"]);
    assert.deepStrictEqual(board.sfxAnimations, {
        "0,0": { kind: "cant", seed: "afx:cant", dir: 8 }
    });
}

function testBoardRejectsInvalidAccess() {
    const runtime = makeRuntime(2, 1, 1, 1);

    assert.throws(() => runtime.board.getCell(-1), /out of bounds/);
    assert.throws(() => runtime.board.indexToCoord(2), /out of bounds/);
    assert.throws(() => runtime.board.neighbor(0, "sideways"), /Unknown 3D direction/);
    assert.throws(() => runtime.board.setCell(0, new Int32Array([])), /smaller than strideObj/);
    assert.throws(() => runtime.board.setMovements(0, new Int32Array([])), /smaller than strideMov/);
}

function makeRuntime(width, height, depth, strideObj, options) {
    const opts = options || {};
    const cellCount = width * height * depth;
    const level = {
        is3d: true,
        width,
        height,
        depth,
        cellCount,
        n_tiles: cellCount,
        layerCount: opts.layerCount || 1,
        objects: new Int32Array(cellCount * strideObj)
    };
    if (opts.movements)
        level.movements = opts.movements;

    return runtimeApi.createRuntime3D(slots.buildSlots3D({
        metadata: {},
        default_metadata: {},
        levels: [level],
        layerMasks: opts.layerMasks,
        sfx_MovementMasks: opts.sfxMovementMasks || [],
        sfx_MovementFailureMasks: opts.sfxMovementFailureMasks || [],
        idDict: opts.objectLayers && opts.objectLayers.map((_, index) => `o${index}`),
        objects: makeObjects(opts.objectLayers)
    }));
}

function makeObjects(objectLayers) {
    const objects = {};
    (objectLayers || []).forEach((layer, index) => {
        objects[`o${index}`] = { id: index, layer };
    });
    return objects;
}

testBoardCoordinateRoundTripMatchesLevel3IndexOrder();
testNeighborUsesAbsolute3DDirectionsAndBounds();
testAsciiAxisContractNeighbors();
testGetCellReturnsCopyAndSetCellOwnsMutation();
testGetCellIntoCopiesIntoTargetLike2DLevel();
testCloneCopiesCellsWithoutSharingMutation();
testMovementsMirror2DLevelCopyAndSetContract();
testGetMovementsIntoCopiesIntoTargetLike2DLevel();
testCloneCopiesMovementsAndLayerMasksWithoutSharingMutation();
testStartMovementSeedsLayerMovementMasksLike2DInput();
testActionInputUsesMovementFieldWithoutSpatialDisplacementLike2D();
testResolveMovementsMovesOnlyRequestedLayerAndClearsMovementMasks();
testResolveMovementsRecordsSpatialTweenDestinationByLayer();
testResolveMovementsRecordsMovementSfxArtifacts();
testResolveMovementsLeavesBlockedLayerInPlaceAndClearsFailedMovement();
testResolveMovementsRecordsCantMoveSfxArtifacts();
testBoardRejectsInvalidAccess();

console.log("3d runtime tests passed");
