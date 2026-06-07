const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sfxArtifacts = require("../src/js/sfx_artifacts.js");

function load2DSfxTailOracle() {
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
            URL: "test://sfx-tail",
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
        SfxArtifacts: sfxArtifacts
    };

    const hooks = `
module.exports.__sfxTailOracle = {
    run: function(options) {
        STRIDE_OBJ = options.strideObj || 1;
        state = {
            sfx_CreationMasks: options.creationMasks || [],
            sfx_DestructionMasks: options.destructionMasks || [],
            idDict: options.idDict || {}
        };
        sfxCreateMask = new BitVec(new Int32Array(options.createMask || [0]));
        sfxDestroyMask = new BitVec(new Int32Array(options.destroyMask || [0]));
        sfxCreateList = (options.createList || []).map(function(entry) {
            return Object.assign({}, entry);
        });
        sfxDestroyList = (options.destroyList || []).map(function(entry) {
            return Object.assign({}, entry);
        });
        seedsToPlay_CanMove = (options.canMoveSeeds || []).slice();
        seedsToPlay_CantMove = (options.cantMoveSeeds || []).slice();
        seedsToAnimate = Object.assign({}, options.animations || {});
        verbose_logging = !!options.verboseLogging;

        var played = [];
        var logs = [];
        playSeed = function(seed) {
            played.push(seed);
        };
        consolePrint = function(message) {
            logs.push(message);
        };

        var artifacts = runTurnSfxTailOracle();
        return {
            played: JSON.parse(JSON.stringify(played)),
            animations: JSON.parse(JSON.stringify(seedsToAnimate)),
            logs: JSON.parse(JSON.stringify(logs)),
            artifacts: JSON.parse(JSON.stringify(artifacts))
        };
    },
    movement: function(options) {
        STRIDE_OBJ = options.strideObj || 1;
        STRIDE_MOV = options.strideMov || 1;
        MOV_BITS = options.movementBits || 5;
        MOV_MASK = options.movementMaskValue || 0x1f;
        state = {
            sfx_MovementMasks: (options.movementMasks || [[]]).map(function(group) {
                return group.map(function(entry) {
                    return Object.assign({}, entry, {
                        directionMask: new BitVec(new Int32Array(entry.directionMask))
                    });
                });
            }),
            sfx_MovementFailureMasks: (options.movementFailureMasks || []).map(function(entry) {
                return Object.assign({}, entry, {
                    directionMask: new BitVec(new Int32Array(entry.directionMask))
                });
            }),
            idDict: options.idDict || {},
            objects: options.objects || {}
        };
        curLevel = {
            height: options.height || 3,
            depth: 1
        };
        seedsToPlay_CanMove = (options.canMoveSeeds || []).slice();
        seedsToPlay_CantMove = (options.cantMoveSeeds || []).slice();
        seedsToAnimate = Object.assign({}, options.animations || {});
        verbose_logging = !!options.verboseLogging;

        var logs = [];
        consolePrint = function(message) {
            logs.push(message);
        };

        var sourceMask = new BitVec(new Int32Array(options.sourceMask || [0]));
        var cellMask = new BitVec(new Int32Array(options.cellMask || options.sourceMask || [0]));
        var movementMask = new BitVec(new Int32Array(options.movementMask || [0]));
        if (options.kind === "cant")
            runCantMoveSfxOracle(options.positionIndex || 0, cellMask, movementMask);
        else
            runMovementSfxOracle(options.positionIndex || 0, options.layer || 0, sourceMask, movementMask);

        return {
            canMoveSeeds: JSON.parse(JSON.stringify(seedsToPlay_CanMove)),
            cantMoveSeeds: JSON.parse(JSON.stringify(seedsToPlay_CantMove)),
            animations: JSON.parse(JSON.stringify(seedsToAnimate)),
            logs: JSON.parse(JSON.stringify(logs))
        };
    }
};

function runTurnSfxTailOracle() {
    var playSeeds = [];
    var createSeeds = [];
    var destroySeeds = [];
    var objectEvents = [];

    for (var i = 0; i < seedsToPlay_CantMove.length; i++) {
        playSeed(seedsToPlay_CantMove[i]);
        playSeeds.push(seedsToPlay_CantMove[i]);
    }

    for (var j = 0; j < seedsToPlay_CanMove.length; j++) {
        playSeed(seedsToPlay_CanMove[j]);
        playSeeds.push(seedsToPlay_CanMove[j]);
    }

    for (const entry of state.sfx_CreationMasks) {
        if (sfxCreateMask.get(entry.objId)) {
            createSeeds.push(entry.seed);
            if (entry.seed.startsWith('afx')) {
                for (const fx of sfxCreateList) {
                    if (fx.objId == entry.objId) {
                        if (verbose_logging) consolePrint('Created object "' + state.idDict[entry.objId] + '", playing seed "' + entry.seed + '"');
                        seedsToAnimate[fx.posIndex + ',' + fx.objId] = { kind: 'create', seed: entry.seed };
                        objectEvents.push({ kind: 'create', seed: entry.seed, objId: entry.objId, posIndex: fx.posIndex });
                    }
                }
            } else {
                if (verbose_logging) consolePrint('Created object "' + state.idDict[entry.objId] + '", playing seed "' + entry.seed + '"');
                playSeed(entry.seed);
                playSeeds.push(entry.seed);
                objectEvents.push({ kind: 'create', seed: entry.seed, objId: entry.objId });
            }
        }
    }

    for (const entry of state.sfx_DestructionMasks) {
        if (sfxDestroyMask.get(entry.objId)) {
            destroySeeds.push(entry.seed);
            if (entry.seed.startsWith('afx')) {
                for (const fx of sfxDestroyList) {
                    if (fx.objId == entry.objId) {
                        if (verbose_logging) consolePrint('Destroyed object "' + state.idDict[entry.objId] + '", playing seed "' + entry.seed + '"');
                        seedsToAnimate[fx.posIndex + ',' + fx.objId] = { kind: 'destroy', seed: entry.seed };
                        objectEvents.push({ kind: 'destroy', seed: entry.seed, objId: entry.objId, posIndex: fx.posIndex });
                    }
                }
            } else {
                if (verbose_logging) consolePrint('Destroyed object "' + state.idDict[entry.objId] + '", playing seed "' + entry.seed + '"');
                playSeed(entry.seed);
                playSeeds.push(entry.seed);
                objectEvents.push({ kind: 'destroy', seed: entry.seed, objId: entry.objId });
            }
        }
    }

    return {
        playSeeds: playSeeds,
        canMoveSeeds: seedsToPlay_CanMove.slice(),
        cantMoveSeeds: seedsToPlay_CantMove.slice(),
        createSeeds: createSeeds,
        destroySeeds: destroySeeds,
        objectEvents: objectEvents,
        animations: seedsToAnimate
    };
}

function runMovementSfxOracle(positionIndex, layer, sourceMask, movementMask) {
    for (let i = 0; i < state.sfx_MovementMasks[layer].length; i++) {
        const fx = state.sfx_MovementMasks[layer][i];
        if (sourceMask.get(fx.objId)) {
            var directionMask = fx.directionMask;
            if (movementMask.anyBitsInCommon(directionMask)) {
                if (verbose_logging)
                    consolePrint('Object "' + state.idDict[fx.objId] + '" has moved, playing seed "' + fx.seed + '".')
                if (fx.seed.startsWith('afx')) {
                    const object = getObject(fx.objId);
                    const move = getLayerMovement(movementMask, object.layer);
                    const position = deltaPositionIndex(curLevel, positionIndex, dirMasksDelta[move][0], dirMasksDelta[move][1])
                    seedsToAnimate[position + ',' + fx.objId] = {
                        kind: 'move',
                        seed: fx.seed,
                        dir: move
                    };
                }
                else if (seedsToPlay_CanMove.indexOf(fx.seed) === -1)
                    seedsToPlay_CanMove.push(fx.seed);
            }
        }
    }
}

function runCantMoveSfxOracle(positionIndex, cellMask, movementMask) {
    for (const fx of state.sfx_MovementFailureMasks) {
        if (cellMask.get(fx.objId)) {
            if (movementMask.anyBitsInCommon(fx.directionMask)) {
                const object = getObject(fx.objId);
                if (verbose_logging)
                    consolePrint('Object "' + state.idDict[object] + '" can\\'t move, playing seed "' + seedsToPlay_CantMove[positionIndex] + '"')
                if (fx.seed.startsWith('afx')) {
                    const move = getLayerMovement(movementMask, object.layer);
                    seedsToAnimate[positionIndex + ',' + fx.objId] = {
                        kind: 'cant',
                        seed: fx.seed,
                        dir: move
                    };
                }
                else if (seedsToPlay_CantMove.indexOf(fx.seed) === -1)
                    seedsToPlay_CantMove.push(fx.seed);
            }
        }
    }
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__sfxTailOracle;
}

function testCollectsPlaybackSeedsIn2DOrder() {
    const result = sfxArtifacts.collectSfxArtifacts({
        cantMoveSeeds: ["11"],
        canMoveSeeds: ["22"],
        creationMasks: [{ objId: 2, seed: "33" }],
        destructionMasks: [{ objId: 1, seed: "44" }],
        createMask: new Int32Array([0b0100]),
        destroyMask: new Int32Array([0b0010]),
        createList: [{ posIndex: 5, objId: 2 }],
        destroyList: [{ posIndex: 6, objId: 1 }]
    });

    assert.deepStrictEqual(result.playSeeds, ["11", "22", "33", "44"]);
    assert.deepStrictEqual(result.canMoveSeeds, ["22"]);
    assert.deepStrictEqual(result.cantMoveSeeds, ["11"]);
    assert.deepStrictEqual(result.createSeeds, ["33"]);
    assert.deepStrictEqual(result.destroySeeds, ["44"]);
    assert.deepStrictEqual(result.objectEvents, [
        { kind: "create", seed: "33", objId: 2 },
        { kind: "destroy", seed: "44", objId: 1 }
    ]);
    assert.deepStrictEqual(result.animations, {});
}

function testCollectsAnimationSeedsWithoutPlayback() {
    const result = sfxArtifacts.collectSfxArtifacts({
        creationMasks: [{ objId: 2, seed: "afx:create" }],
        destructionMasks: [{ objId: 1, seed: "afx:destroy" }],
        createMask: new Int32Array([0b0100]),
        destroyMask: new Int32Array([0b0010]),
        createList: [{ posIndex: 5, objId: 2 }],
        destroyList: [{ posIndex: 6, objId: 1 }]
    });

    assert.deepStrictEqual(result.playSeeds, []);
    assert.deepStrictEqual(result.createSeeds, ["afx:create"]);
    assert.deepStrictEqual(result.destroySeeds, ["afx:destroy"]);
    assert.deepStrictEqual(result.objectEvents, [
        { kind: "create", seed: "afx:create", objId: 2, posIndex: 5 },
        { kind: "destroy", seed: "afx:destroy", objId: 1, posIndex: 6 }
    ]);
    assert.deepStrictEqual(result.animations, {
        "5,2": { kind: "create", seed: "afx:create" },
        "6,1": { kind: "destroy", seed: "afx:destroy" }
    });
}

function testIgnoresUnchangedObjectMasksLike2D() {
    const result = sfxArtifacts.collectSfxArtifacts({
        creationMasks: [{ objId: 2, seed: "33" }],
        destructionMasks: [{ objId: 1, seed: "44" }],
        createMask: new Int32Array([0]),
        destroyMask: new Int32Array([0]),
        createList: [{ posIndex: 5, objId: 2 }],
        destroyList: [{ posIndex: 6, objId: 1 }]
    });

    assert.deepStrictEqual(result.playSeeds, []);
    assert.deepStrictEqual(result.createSeeds, []);
    assert.deepStrictEqual(result.destroySeeds, []);
    assert.deepStrictEqual(result.animations, {});
}

function testSharedHelperMatches2DEngineTailPlaybackOracle() {
    const oracle = load2DSfxTailOracle();
    const scenario = {
        cantMoveSeeds: ["11"],
        canMoveSeeds: ["22"],
        creationMasks: [{ objId: 2, seed: "33" }],
        destructionMasks: [{ objId: 1, seed: "44" }],
        createMask: [0b0100],
        destroyMask: [0b0010],
        createList: [{ posIndex: 5, objId: 2 }],
        destroyList: [{ posIndex: 6, objId: 1 }],
        idDict: { 1: "player", 2: "wall" },
        verboseLogging: true
    };

    const shared = sfxArtifacts.collectSfxArtifacts({
        cantMoveSeeds: scenario.cantMoveSeeds,
        canMoveSeeds: scenario.canMoveSeeds,
        creationMasks: scenario.creationMasks,
        destructionMasks: scenario.destructionMasks,
        createMask: new Int32Array(scenario.createMask),
        destroyMask: new Int32Array(scenario.destroyMask),
        createList: scenario.createList,
        destroyList: scenario.destroyList
    });
    const actual2D = oracle.run(scenario);

    assert.deepStrictEqual(normalize(actual2D.played), shared.playSeeds);
    assert.deepStrictEqual(normalize(actual2D.animations), shared.animations);
    assert.deepStrictEqual(normalize(actual2D.artifacts), JSON.parse(JSON.stringify(shared)));
    assert.deepStrictEqual(normalize(actual2D.logs), [
        'Created object "wall", playing seed "33"',
        'Destroyed object "player", playing seed "44"'
    ]);
}

function testSharedHelperMatches2DEngineTailAnimationOracle() {
    const oracle = load2DSfxTailOracle();
    const scenario = {
        creationMasks: [{ objId: 2, seed: "afx:create" }],
        destructionMasks: [{ objId: 1, seed: "afx:destroy" }],
        createMask: [0b0100],
        destroyMask: [0b0010],
        createList: [{ posIndex: 5, objId: 2 }],
        destroyList: [{ posIndex: 6, objId: 1 }],
        idDict: { 1: "player", 2: "wall" }
    };

    const shared = sfxArtifacts.collectSfxArtifacts({
        creationMasks: scenario.creationMasks,
        destructionMasks: scenario.destructionMasks,
        createMask: new Int32Array(scenario.createMask),
        destroyMask: new Int32Array(scenario.destroyMask),
        createList: scenario.createList,
        destroyList: scenario.destroyList
    });
    const actual2D = oracle.run(scenario);

    assert.deepStrictEqual(normalize(actual2D.played), shared.playSeeds);
    assert.deepStrictEqual(normalize(actual2D.animations), shared.animations);
    assert.deepStrictEqual(normalize(actual2D.artifacts), JSON.parse(JSON.stringify(shared)));
}

function testSharedHelperMatches2DEngineMovementOracle() {
    const oracle = load2DSfxTailOracle();
    const scenario = {
        kind: "move",
        movementMasks: [[
            { objId: 1, directionMask: [8], seed: "55" },
            { objId: 1, directionMask: [8], seed: "afx:move" }
        ]],
        sourceMask: [0b0010],
        movementMask: [8],
        positionIndex: 1,
        layer: 0,
        height: 3,
        idDict: { 1: "player" },
        objects: { player: { layer: 0 } },
        verboseLogging: true
    };
    const sharedSeeds = [];
    const sharedAnimations = {};

    sfxArtifacts.recordMovementSfx({
        entries: [
            { objId: 1, directionMask: new Int32Array([8]), seed: "55" },
            { objId: 1, directionMask: new Int32Array([8]), seed: "afx:move" }
        ],
        sourceMask: new Int32Array(scenario.sourceMask),
        movementMask: new Int32Array(scenario.movementMask),
        canMoveSeeds: sharedSeeds,
        animations: sharedAnimations,
        movementBits: 5,
        movementMaskValue: 0x1f,
        objectLayers: { 1: 0 },
        animationPosition: function(_fx, move) {
            const delta = { 8: [1, 0] }[move];
            return scenario.positionIndex + delta[1] + delta[0] * scenario.height;
        }
    });
    const actual2D = oracle.movement(scenario);

    assert.deepStrictEqual(normalize(actual2D.canMoveSeeds), sharedSeeds);
    assert.deepStrictEqual(normalize(actual2D.animations), sharedAnimations);
    assert.deepStrictEqual(normalize(actual2D.logs), [
        'Object "player" has moved, playing seed "55".',
        'Object "player" has moved, playing seed "afx:move".'
    ]);
}

function testSharedHelperMatches2DEngineCantMoveOracle() {
    const oracle = load2DSfxTailOracle();
    const scenario = {
        kind: "cant",
        movementFailureMasks: [
            { objId: 1, directionMask: [8], seed: "66" },
            { objId: 1, directionMask: [8], seed: "afx:cant" }
        ],
        cellMask: [0b0010],
        movementMask: [8],
        positionIndex: 2,
        idDict: { 1: "player" },
        objects: { player: { layer: 0 } }
    };
    const sharedSeeds = [];
    const sharedAnimations = {};

    sfxArtifacts.recordCantMoveSfx({
        entries: [
            { objId: 1, directionMask: new Int32Array([8]), seed: "66" },
            { objId: 1, directionMask: new Int32Array([8]), seed: "afx:cant" }
        ],
        cellMask: new Int32Array(scenario.cellMask),
        movementMask: new Int32Array(scenario.movementMask),
        cantMoveSeeds: sharedSeeds,
        animations: sharedAnimations,
        positionIndex: scenario.positionIndex,
        movementBits: 5,
        movementMaskValue: 0x1f,
        objectLayers: { 1: 0 }
    });
    const actual2D = oracle.movement(scenario);

    assert.deepStrictEqual(normalize(actual2D.cantMoveSeeds), sharedSeeds);
    assert.deepStrictEqual(normalize(actual2D.animations), sharedAnimations);
}

function normalize(value) {
    return JSON.parse(JSON.stringify(value));
}

testCollectsPlaybackSeedsIn2DOrder();
testCollectsAnimationSeedsWithoutPlayback();
testIgnoresUnchangedObjectMasksLike2D();
testSharedHelperMatches2DEngineTailPlaybackOracle();
testSharedHelperMatches2DEngineTailAnimationOracle();
testSharedHelperMatches2DEngineMovementOracle();
testSharedHelperMatches2DEngineCantMoveOracle();

console.log("sfx artifact 2d parity tests passed");
