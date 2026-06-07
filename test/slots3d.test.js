const assert = require("assert");

const frames = require("../src/js/rule_frames3d.js");
const slots = require("../src/js/slots3d.js");

const MOV_BITS_3D = 7;
const MOV_MASK_3D = 0x7f;
const DIRECTION_BITS_3D = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    action: 16,
    front: 32,
    back: 64
};

function testBuildsSlotsFromCompiledLevel3() {
    const level = makeLevel();
    const state = {
        case_sensitive: true,
        metadata: {
            title: "Slot Test",
            key_repeat_interval: 0.25,
            throttle_movement: true
        },
        default_metadata: {},
        STRIDE_MOV: 1,
        playerMask: new Int32Array([1]),
        layerMasks: [new Int32Array([1]), new Int32Array([2])],
        idDict: ["player", "wall"],
        objects: {
            player: { id: 0, layer: 0 },
            wall: { id: 1, layer: 1 }
        },
        levels: [level]
    };

    const result = slots.buildSlots3D(state);

    assert.strictEqual(result.compiler.caseSensitive, true);
    assert.strictEqual(result.core.board.width, 2);
    assert.strictEqual(result.core.board.height, 3);
    assert.strictEqual(result.core.board.depth, 4);
    assert.strictEqual(result.core.board.cellCount, 24);
    assert.strictEqual(result.core.board.cells, level.objects);
    assert.strictEqual(result.core.board.strideMov, 1);
    assert.strictEqual(result.core.board.movementBits, MOV_BITS_3D);
    assert.strictEqual(result.core.board.movementMask, MOV_MASK_3D);
    assert.deepStrictEqual(Array.from(result.core.board.playerMask), [1]);
    assert.deepStrictEqual(result.core.board.directionBits, DIRECTION_BITS_3D);
    assert.deepStrictEqual(result.core.board.deltas, Object.assign({ action: [0, 0, 0] }, frames.DIRECTIONS));
    assert.deepStrictEqual(result.core.board.layerMasks.map(mask => Array.from(mask)), [[1], [2]]);
    assert.deepStrictEqual(result.core.board.objectLayers, [0, 1]);
    assert.strictEqual(result.core.frame.indexOrder, "z-fastest");
    assert.strictEqual(result.core.frame.ruleFrames.count, 24);
    assert.strictEqual(result.core.frame.ruleFrames.includeReflections, false);
    assert.strictEqual(result.core.frame.ruleFrames.frames, frames.RULE_FRAMES);
    assert.deepStrictEqual(result.core.directions.absolute, ["left", "right", "front", "back", "up", "down"]);
    assert.deepStrictEqual(result.input.bindings.keyboard.keyToIntent, {
        w: "front",
        a: "left",
        s: "back",
        d: "right"
    });
    assert.deepStrictEqual(result.input.bindings.keyboard.unboundIntents, ["up", "down"]);
    assert.strictEqual(result.input.repeat.throttle, true);
    assert.strictEqual(result.input.repeat.repeatMs, 250);
    assert.deepStrictEqual(result.core.timers.again.commandLoop, {
        owner: "engine.processInput.again",
        implemented: true
    });
    assert.deepStrictEqual(result.core.timers.again.timer, {
        owner: "inputoutput.again_interval",
        implemented: false,
        reason: "browser-loop-not-connected"
    });
    assert.deepStrictEqual(result.session.checkpoint.semantic, {
        owner: "engine.processInput.checkpoint",
        implemented: true
    });
    assert.deepStrictEqual(result.session.levelSelect.semantic, {
        owner: "engine.titleFlow.level_select",
        implemented: false,
        reason: "browser-title-flow-not-connected"
    });
    assert.deepStrictEqual(result.input.sources.mouse.semantic, {
        owner: "inputoutput.mouseInput",
        implemented: false,
        reason: "3d-picking-and-input-adapter-not-connected"
    });
    assert.deepStrictEqual(result.renderer.tween.semantic, {
        owner: "graphics.tween",
        implemented: true
    });
    assert.deepStrictEqual(result.mutation.semantic, {
        owner: "engine.runtime_metadata_twiddling",
        implemented: true
    });
    assert.strictEqual(result.upper.title, "Slot Test");
}

function testRejectsMissingOrNon3DLevels() {
    assert.throws(
        () => slots.buildSlots3D({ levels: [] }),
        /compiled 3D level/
    );
    assert.throws(
        () => slots.buildSlots3D({ levels: [{ width: 2, height: 2, depth: 1 }] }),
        /3D level shape/
    );
}

function testAllowsHostToAddUpDownBindingsWithoutChangingCoreDirections() {
    const result = slots.buildSlots3D({
        metadata: {},
        default_metadata: {},
        levels: [makeLevel()]
    }, {
        input: {
            keyToIntent: {
                q: "up",
                e: "down"
            },
            unboundIntents: []
        }
    });

    assert.strictEqual(result.input.bindings.keyboard.keyToIntent.q, "up");
    assert.strictEqual(result.input.bindings.keyboard.keyToIntent.e, "down");
    assert.deepStrictEqual(result.input.bindings.keyboard.unboundIntents, []);
    assert(result.core.directions.absolute.includes("up"));
    assert(result.core.directions.absolute.includes("down"));
}

function testBuildsLayerMasksFromObjectLayerMetadataWhenMissingStateMasks() {
    const result = slots.buildSlots3D({
        metadata: {},
        default_metadata: {},
        idDict: ["player", "box", "wall"],
        objects: {
            player: { id: 0, layer: 0 },
            box: { id: 1, layer: 1 },
            wall: { id: 2, layer: 1 }
        },
        levels: [makeLevel()]
    });

    assert.deepStrictEqual(result.core.board.layerMasks.map(mask => Array.from(mask)), [[1, 0], [6, 0]]);
    assert.deepStrictEqual(result.core.board.objectLayers, [0, 1, 1]);
}

function testBuildsRulesSlotFromCompilerLowered3DRules() {
    const rules3d = {
        groups: [{ lineNumber: 1 }],
        lateGroups: [{ lineNumber: 2 }],
        winConditions: [{ kind: "some" }]
    };
    const result = slots.buildSlots3D({
        metadata: {},
        default_metadata: {},
        rules3d,
        levels: [makeLevel()]
    });

    assert.strictEqual(result.core.rules.groups, rules3d.groups);
    assert.strictEqual(result.core.rules.lateGroups, rules3d.lateGroups);
    assert.strictEqual(result.core.rules.winConditions, rules3d.winConditions);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.core.rules, "unsupportedFeatures"), false);
}

function makeLevel() {
    return {
        is3d: true,
        width: 2,
        height: 3,
        depth: 4,
        cellCount: 24,
        n_tiles: 24,
        layerCount: 2,
        objects: new Int32Array(48)
    };
}

testBuildsSlotsFromCompiledLevel3();
testRejectsMissingOrNon3DLevels();
testAllowsHostToAddUpDownBindingsWithoutChangingCoreDirections();
testBuildsLayerMasksFromObjectLayerMetadataWhenMissingStateMasks();
testBuildsRulesSlotFromCompilerLowered3DRules();

console.log("3d slot tests passed");
