const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const runtime3d = require("../src/js/runtime3d.js");
const cellMasks = require("../src/js/cell_masks.js");
const sfxArtifacts = require("../src/js/sfx_artifacts.js");

function load2DResolveMovementsOracle() {
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
        RNG: function RNG() { this.uniform = function() { return 0; }; },
        document: {
            URL: "test://resolve-movements",
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
        curLevelNo: 0,
        curlevelTarget: null,
        solvedSections: [],
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        consolePrint: function() {},
        canvasResize: function() {},
        tryLoadCustomFont: function() {},
        isSitelocked: function() { return false; },
        fillRange: function(start, end) {
            const result = [];
            for (let i = start; i < end; i++)
                result.push(i);
            return result;
        },
        fillAndHighlight: function(screen) { return screen; },
        CellMasks: cellMasks,
        SfxArtifacts: sfxArtifacts
    };

    const hooks = `
module.exports.__resolveMovementsOracle = {
    run: function(options) {
        STRIDE_OBJ = options.strideObj || 1;
        STRIDE_MOV = options.strideMov || 1;
        MOV_BITS = options.movementBits || 5;
        MOV_MASK = options.movementMask || 0x1f;
        _o6 = new BitVec(STRIDE_OBJ);
        _o7 = new BitVec(STRIDE_OBJ);
        _o8 = new BitVec(STRIDE_OBJ);
        _movementVecs = [new BitVec(STRIDE_MOV), new BitVec(STRIDE_MOV), new BitVec(STRIDE_MOV)];
        _movementVecIndex = 0;

        curLevel = new Level(
            0,
            options.width,
            options.height,
            options.layerCount,
            new Int32Array(options.objects),
            null
        );
        curLevel.movements = new Int32Array(options.movements || []);
        curLevel.rigidGroupIndexMask = (options.rigidGroupIndexMasks || []).map(function(mask) {
            return new BitVec(new Int32Array(mask));
        });
        curLevel.rigidMovementAppliedMask = (options.rigidMovementAppliedMasks || []).map(function(mask) {
            return new BitVec(new Int32Array(mask));
        });
        curLevel.colCellContents = makeBitVecArray(options.width, STRIDE_OBJ);
        curLevel.rowCellContents = makeBitVecArray(options.height, STRIDE_OBJ);
        curLevel.mapCellContents = new BitVec(STRIDE_OBJ);
        curLevel.colCellContents_Movements = makeBitVecArray(options.width, STRIDE_MOV);
        curLevel.rowCellContents_Movements = makeBitVecArray(options.height, STRIDE_MOV);
        curLevel.mapCellContents_Movements = new BitVec(STRIDE_MOV);

        state = {
            metadata: options.metadata || {},
            layerMasks: (options.layerMasks || []).map(function(mask) {
                return new BitVec(new Int32Array(mask));
            }),
            rigidGroupIndex_to_GroupIndex: options.rigidGroupIndexToGroupIndex || [],
            sfx_MovementMasks: makeSfxMovementMasks(options.sfxMovementMasks || [], options.layerCount || 0),
            sfx_MovementFailureMasks: (options.sfxMovementFailureMasks || []).map(function(entry) {
                return Object.assign({}, entry, {
                    directionMask: new BitVec(new Int32Array(entry.directionMask))
                });
            }),
            idDict: options.idDict || {},
            objects: options.objectsByName || {}
        };
        seedsToPlay_CanMove = [];
        seedsToPlay_CantMove = [];
        seedsToAnimate = {};
        currentMovedEntities = {};
        newMovedEntities = {};
        verbose_logging = false;

        var bannedGroup = {};
        var shouldUndo = resolveMovements(curLevel, bannedGroup, false);

        return {
            objects: Array.prototype.slice.call(curLevel.objects),
            movements: Array.prototype.slice.call(curLevel.movements),
            rigidGroupIndexMasks: curLevel.rigidGroupIndexMask.map(maskToArray),
            rigidMovementAppliedMasks: curLevel.rigidMovementAppliedMask.map(maskToArray),
            shouldUndo: shouldUndo,
            bannedGroups: normalizeBannedGroups(bannedGroup),
            canMoveSeeds: JSON.parse(JSON.stringify(seedsToPlay_CanMove)),
            cantMoveSeeds: JSON.parse(JSON.stringify(seedsToPlay_CantMove)),
            animations: JSON.parse(JSON.stringify(seedsToAnimate)),
            movedEntities: JSON.parse(JSON.stringify(newMovedEntities))
        };
    }
};

function makeBitVecArray(count, length) {
    var result = [];
    for (var i = 0; i < count; i++)
        result.push(new BitVec(length));
    return result;
}

function makeSfxMovementMasks(groups, layerCount) {
    var result = [];
    for (var layer = 0; layer < layerCount; layer++) {
        var group = groups[layer] || [];
        result.push(group.map(function(entry) {
            return Object.assign({}, entry, {
                directionMask: new BitVec(new Int32Array(entry.directionMask))
            });
        }));
    }
    return result;
}

function maskToArray(mask) {
    return Array.prototype.slice.call(mask.data);
}

function normalizeBannedGroups(groups) {
    var result = {};
    Object.keys(groups).forEach(function(key) {
        result[key] = groups[key];
    });
    return result;
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__resolveMovementsOracle;
}

function run3DResolveMovements(scenario) {
    const board = runtime3d.createBoard({
        width: scenario.width,
        height: scenario.height,
        depth: 1,
        cellCount: scenario.width * scenario.height,
        layerCount: scenario.layerCount,
        strideObj: scenario.strideObj || 1,
        strideMov: scenario.strideMov || 1,
        movementBits: scenario.movementBits || 5,
        movementMask: scenario.movementMask || 0x1f,
        directionBits: {
            up: 1,
            down: 2,
            left: 4,
            right: 8,
            action: 16,
            front: 32,
            back: 64
        },
        cells: new Int32Array(scenario.objects),
        movements: new Int32Array(scenario.movements),
        rigidGroupIndexMasks: flattenMasks(scenario.rigidGroupIndexMasks),
        rigidMovementAppliedMasks: flattenMasks(scenario.rigidMovementAppliedMasks),
        layerMasks: scenario.layerMasks.map(mask => new Int32Array(mask)),
        objectLayers: scenario.objectLayers || [],
        sfxMovementMasks: cloneSfxEntries(scenario.sfxMovementMasks || []),
        sfxMovementFailureMasks: cloneSfxEntries(scenario.sfxMovementFailureMasks || []),
        movementTween: { enabled: !!(scenario.metadata && scenario.metadata.tween_length !== undefined) },
        rigidGroupIndexToGroupIndex: scenario.rigidGroupIndexToGroupIndex || []
    });

    const result = board.resolveMovements();
    return {
        objects: Array.from(board.cells),
        movements: Array.from(board.movements),
        rigidGroupIndexMasks: unflattenMasks(board.rigidGroupIndexMasks, board.cellCount, board.strideMov),
        rigidMovementAppliedMasks: unflattenMasks(board.rigidMovementAppliedMasks, board.cellCount, board.strideMov),
        shouldUndo: result.shouldUndo,
        bannedGroups: normalizeRigidFailures(result.rigidFailures),
        canMoveSeeds: JSON.parse(JSON.stringify(board.sfxCanMoveSeeds)),
        cantMoveSeeds: JSON.parse(JSON.stringify(board.sfxCantMoveSeeds)),
        animations: JSON.parse(JSON.stringify(board.sfxAnimations)),
        movedEntities: JSON.parse(JSON.stringify(result.movedEntities))
    };
}

function flattenMasks(masks) {
    return new Int32Array([].concat.apply([], masks || []));
}

function unflattenMasks(data, cellCount, stride) {
    const result = [];
    for (let index = 0; index < cellCount; index++)
        result.push(Array.from(data.subarray(index * stride, index * stride + stride)));
    return result;
}

function cloneSfxEntries(entries) {
    return entries.map(entry => {
        if (Array.isArray(entry))
            return cloneSfxEntries(entry);
        return Object.assign({}, entry, {
            directionMask: new Int32Array(entry.directionMask)
        });
    });
}

function normalizeRigidFailures(failures) {
    const result = {};
    failures.forEach(failure => {
        result[failure.groupIndex] = true;
    });
    return result;
}

function normalizeScenario(scenario) {
    const cellCount = scenario.width * scenario.height;
    const strideMov = scenario.strideMov || 1;
    return Object.assign({
        strideObj: 1,
        strideMov,
        movementBits: 5,
        movementMask: 0x1f,
        objectLayers: [],
        idDict: {},
        objectsByName: {},
        rigidGroupIndexToGroupIndex: [],
        rigidGroupIndexMasks: Array.from({ length: cellCount }, () => new Array(strideMov).fill(0)),
        rigidMovementAppliedMasks: Array.from({ length: cellCount }, () => new Array(strideMov).fill(0)),
        sfxMovementMasks: [],
        sfxMovementFailureMasks: []
    }, scenario);
}

function runParityScenario(oracle, scenario) {
    const normalized = normalizeScenario(scenario);
    const expected = JSON.parse(JSON.stringify(oracle.run(normalized)));
    const actual = run3DResolveMovements(normalized);
    assert.deepStrictEqual(actual, expected, normalized.name);
}

function testSimpleMovementMovesOnlyRequestedLayer(oracle) {
    runParityScenario(oracle, {
        name: "simple movement moves only the requested collision layer",
        width: 3,
        height: 1,
        layerCount: 2,
        layerMasks: [[1], [2]],
        objectLayers: [0, 1],
        objects: [
            3,
            0,
            0
        ],
        movements: [
            8,
            0,
            0
        ]
    });
}

function testBlockedMovementStaysInPlaceAndClearsMask(oracle) {
    runParityScenario(oracle, {
        name: "blocked movement stays in place and clears failed movement",
        width: 3,
        height: 1,
        layerCount: 1,
        layerMasks: [[3]],
        objectLayers: [0, 0],
        objects: [
            1,
            2,
            0
        ],
        movements: [
            8,
            0,
            0
        ]
    });
}

function testRepeatedScanAllowsVacatedTargetMovement(oracle) {
    runParityScenario(oracle, {
        name: "movement resolution repeats scan when a target is vacated later",
        width: 3,
        height: 1,
        layerCount: 1,
        layerMasks: [[3]],
        objectLayers: [0, 0],
        objects: [
            1,
            2,
            0
        ],
        movements: [
            8,
            8,
            0
        ]
    });
}

function testMovementAndCantMoveSfxAreRecordedAt2DPhaseTiming(oracle) {
    runParityScenario(oracle, {
        name: "movement and cantmove sfx match 2D resolve phase timing",
        width: 3,
        height: 1,
        layerCount: 1,
        layerMasks: [[3]],
        objectLayers: [0, 0],
        idDict: {
            0: "player",
            1: "wall"
        },
        objectsByName: {
            player: { id: 0, layer: 0 },
            wall: { id: 1, layer: 0 }
        },
        sfxMovementMasks: [[
            { objId: 0, directionMask: [8], seed: "can-right" }
        ]],
        sfxMovementFailureMasks: [
            { objId: 1, directionMask: [8], seed: "cant-right" }
        ],
        objects: [
            1,
            2,
            0
        ],
        movements: [
            8,
            8,
            0
        ]
    });
}

function testTweenMovedEntitiesUseTargetPositionLayerAndDirectionLike2D(oracle) {
    runParityScenario(oracle, {
        name: "tween moved entities use target position, layer, and movement direction like 2D",
        width: 3,
        height: 1,
        layerCount: 2,
        metadata: {
            tween_length: 0.05
        },
        layerMasks: [[1], [2]],
        objectLayers: [0, 1],
        objects: [
            3,
            0,
            0
        ],
        movements: [
            8 << 5,
            0,
            0
        ]
    });
}

function testActionMovementUses2DNonSpatialMovementSemantics(oracle) {
    runParityScenario(oracle, {
        name: "action movement stays in place and records tween fade like 2D",
        width: 2,
        height: 1,
        layerCount: 1,
        metadata: {
            tween_length: 0.05
        },
        layerMasks: [[1]],
        objectLayers: [0],
        objects: [
            0,
            1
        ],
        movements: [
            0,
            16
        ]
    });
}

function testRigidFailureBansSameGroupAs2D(oracle) {
    runParityScenario(oracle, {
        name: "rigid failure reports the same banned group as 2D",
        width: 2,
        height: 1,
        layerCount: 1,
        layerMasks: [[3]],
        objectLayers: [0, 0],
        rigidGroupIndexToGroupIndex: [7],
        rigidGroupIndexMasks: [
            [1],
            [0]
        ],
        rigidMovementAppliedMasks: [
            [0x1f],
            [0]
        ],
        objects: [
            1,
            2
        ],
        movements: [
            8,
            0
        ]
    });
}

const oracle = load2DResolveMovementsOracle();
testSimpleMovementMovesOnlyRequestedLayer(oracle);
testBlockedMovementStaysInPlaceAndClearsMask(oracle);
testRepeatedScanAllowsVacatedTargetMovement(oracle);
testMovementAndCantMoveSfxAreRecordedAt2DPhaseTiming(oracle);
testTweenMovedEntitiesUseTargetPositionLayerAndDirectionLike2D(oracle);
testActionMovementUses2DNonSpatialMovementSemantics(oracle);
testRigidFailureBansSameGroupAs2D(oracle);

console.log("resolve movements 2d parity tests passed");
