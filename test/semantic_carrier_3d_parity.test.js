const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const slots3d = require("../src/js/slots3d.js");
const runtime3d = require("../src/js/runtime3d.js");

const TWO_D_PREFIX_DIRECTION_BITS = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    action: 16
};

const THREE_D_SPATIAL_APPEND_DIRECTION_BITS = {
    front: 32,
    back: 64
};

const THREE_D_DIRECTION_BITS = Object.assign(
    {},
    TWO_D_PREFIX_DIRECTION_BITS,
    THREE_D_SPATIAL_APPEND_DIRECTION_BITS
);

const THREE_D_MOVEMENT_BITS = 7;
const THREE_D_MOVEMENT_MASK = 0x7f;

function testCompilerDirectionBitsPreserve2DPrefix() {
    const source = readSource("../src/js/compiler3d.js");
    const helperSource = readSource("../src/js/compiler_3d.js");
    const directionBits = readCompilerConstObject(source, "directionBits3d");

    assertDirectionBitsPreserve2DPrefix("compiler.directionBits3d", directionBits);
    assert.strictEqual(directionBits.moving, THREE_D_MOVEMENT_MASK);
    assert.strictEqual(directionBits["^"], directionBits.front);
    assert.strictEqual(directionBits["v"], directionBits.back);
    assert.strictEqual(directionBits["<"], directionBits.left);
    assert.strictEqual(directionBits[">"], directionBits.right);
    assert.strictEqual(directionBits.o, directionBits.up);
    assert.strictEqual(directionBits.x, directionBits.down);
    assert.match(source, /MOV_BITS = 8/);
    assert.match(source, /MOV_MASK = 0xff/);
    assert.match(source, /if \(isThreeDimensionsEnabled\(state\)\) \{\s*MOV_BITS = 7;\s*MOV_MASK = 0x7f;/);
    assert.match(helperSource, /return state\.MOV_BITS \|\| 7/);
    assert.match(source, /_action_:\s*directionBits3d\.action/);
}

function testSlotsDirectionBitsPreserve2DPrefix() {
    const result = slots3d.buildSlots3D({
        metadata: {},
        default_metadata: {},
        collisionLayers: [["player"]],
        levels: [makeLevel()]
    });

    assert.strictEqual(result.core.board.movementBits, THREE_D_MOVEMENT_BITS);
    assert.strictEqual(result.core.board.movementMask, THREE_D_MOVEMENT_MASK);
    assertDirectionBitsPreserve2DPrefix("slots3d.core.board.directionBits", result.core.board.directionBits);
}

function testRuntimeDirectionBitsPreserve2DPrefix() {
    const board = runtime3d.createBoard({
        width: 1,
        height: 1,
        depth: 1,
        cellCount: 1,
        layerCount: 1,
        strideObj: 1,
        cells: new Int32Array([1]),
        movements: new Int32Array([0]),
        layerMasks: [new Int32Array([1])]
    });

    assert.strictEqual(board.movementBits, THREE_D_MOVEMENT_BITS);
    assert.strictEqual(board.movementMask, THREE_D_MOVEMENT_MASK);
    assertDirectionBitsPreserve2DPrefix("runtime3d.board.directionBits", board.directionBits);
}

function testStale3DRemappedMovementLayoutsAreNotReintroduced() {
    const carrierOwners = [
        "../src/js/compiler3d.js",
        "../src/js/compiler_3d.js",
        "../src/js/slots3d.js",
        "../src/js/runtime3d.js"
    ];

    carrierOwners.forEach(relativePath => {
        const source = readSource(relativePath);
        assertNoStaleRemapped3DLayout(relativePath, source);
    });
}

function test3DTestsDoNotFreezeStaleCarrierExpectations() {
    const testFiles = fs.readdirSync(__dirname)
        .filter(name => /(^|_)3d|3d(_|\.)/.test(name))
        .filter(name => name !== path.basename(__filename));

    testFiles.forEach(fileName => {
        const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");
        assertNoStaleRemapped3DLayout(`test/${fileName}`, source);
        assertNoStale3DMovementWidth(`test/${fileName}`, source);
    });
}

function testRandomDirCarrierUsesSpatialBitsWithoutAction() {
    const source = readSource("../src/js/rules3d.js");

    assert.match(
        source,
        /directionBitIndexes:\s*board\.directionBitIndexes\s*\|\|\s*\[0,\s*1,\s*2,\s*3,\s*5,\s*6\]/,
        "3D randomdir must choose the six spatial direction bit indexes while preserving action at index 4"
    );
}

function testBrowserProcessInputMaps2DVerticalIndexCarrierTo3DDepth() {
    const host = loadPlayHostForCarrierTest({
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"]
    });

    assert.strictEqual(host.normalizeProcessInputDirection(0), "front");
    assert.strictEqual(host.normalizeProcessInputDirection(1), "left");
    assert.strictEqual(host.normalizeProcessInputDirection(2), "back");
    assert.strictEqual(host.normalizeProcessInputDirection(3), "right");
    assert.strictEqual(host.normalizeProcessInputDirection(4), "action");
    assert.strictEqual(host.normalizeProcessInputDirection(-1), null);
    assert.strictEqual(host.normalizeProcessInputDirection("up"), "front");
    assert.strictEqual(host.normalizeProcessInputDirection("down"), "back");
    assert.strictEqual(host.normalizeProcessInputDirection("front"), "front");

    delete global.window;
}

function assertDirectionBitsPreserve2DPrefix(label, directionBits) {
    Object.keys(TWO_D_PREFIX_DIRECTION_BITS).forEach(name => {
        assert.strictEqual(
            directionBits[name],
            TWO_D_PREFIX_DIRECTION_BITS[name],
            `${label}.${name} must preserve the 2D raw movement bit`
        );
    });

    Object.keys(THREE_D_SPATIAL_APPEND_DIRECTION_BITS).forEach(name => {
        assert.strictEqual(
            directionBits[name],
            THREE_D_SPATIAL_APPEND_DIRECTION_BITS[name],
            `${label}.${name} must be appended after the 2D prefix`
        );
    });

    assert.deepStrictEqual(
        pick(directionBits, Object.keys(THREE_D_DIRECTION_BITS)),
        THREE_D_DIRECTION_BITS,
        `${label} must equal the canonical 3D movement carrier`
    );
    assertUniqueValues(label, pick(directionBits, Object.keys(THREE_D_DIRECTION_BITS)));
}

function assertUniqueValues(label, valuesByName) {
    const seen = {};
    Object.keys(valuesByName).forEach(name => {
        const value = valuesByName[name];
        assert.strictEqual(
            seen[value],
            undefined,
            `${label} reuses raw bit ${value} for ${seen[value]} and ${name}`
        );
        seen[value] = name;
    });
}

function assertNoStaleRemapped3DLayout(relativePath, source) {
    const staleLayout = /front:\s*4[\s\S]{0,120}back:\s*8[\s\S]{0,120}up:\s*16[\s\S]{0,120}down:\s*32/;
    assert(
        !staleLayout.test(source),
        `${relativePath} contains the stale remapped 3D movement layout`
    );
    assert(
        !/_action_:\s*0x40/.test(source),
        `${relativePath} moves the 2D action carrier away from raw bit 16`
    );
}

function assertNoStale3DMovementWidth(relativePath, source) {
    const staleWidthPatterns = [
        /\bMOV_BITS\s*:\s*8\b/,
        /\bMOV_BITS\s*=\s*8\b/,
        /\bmovementBits\s*:\s*8\b/,
        /\bassert\.strictEqual\([^,\n]+\.movementBits,\s*8\)/,
        /\bMOV_MASK\s*:\s*0xff\b/,
        /\bMOV_MASK\s*=\s*0xff\b/,
        /\bmovementMask\s*:\s*0xff\b/,
        /\bassert\.strictEqual\([^,\n]+\.movementMask,\s*0xff\)/,
        /directionBitIndexes:\s*[^;\n]*\[0,\s*1,\s*2,\s*3,\s*4,\s*5\]/
    ];

    staleWidthPatterns.forEach(pattern => {
        assert(
            !pattern.test(source),
            `${relativePath} freezes a stale 3D movement carrier width or randomdir domain`
        );
    });
}

function readCompilerConstObject(source, constName) {
    const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*({[\\s\\S]*?\\n});`));
    if (!match)
        throw new Error(`Could not find compiler const ${constName}.`);

    const context = { module: { exports: null } };
    vm.runInNewContext(`module.exports = ${match[1]};`, context);
    return context.module.exports;
}

function loadPlayHostForCarrierTest(windowObject) {
    global.window = windowObject;
    delete require.cache[require.resolve("../src/js/play_host3d.js")];
    return require("../src/js/play_host3d.js");
}

function pick(source, keys) {
    const result = {};
    keys.forEach(key => {
        result[key] = source[key];
    });
    return result;
}

function readSource(relativePath) {
    return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

function makeLevel() {
    return {
        is3d: true,
        width: 1,
        height: 1,
        depth: 1,
        cellCount: 1,
        n_tiles: 1,
        layerCount: 1,
        objects: new Int32Array([1])
    };
}

testCompilerDirectionBitsPreserve2DPrefix();
testSlotsDirectionBitsPreserve2DPrefix();
testRuntimeDirectionBitsPreserve2DPrefix();
testStale3DRemappedMovementLayoutsAreNotReintroduced();
test3DTestsDoNotFreezeStaleCarrierExpectations();
testRandomDirCarrierUsesSpatialBitsWithoutAction();
testBrowserProcessInputMaps2DVerticalIndexCarrierTo3DDepth();

console.log("3d semantic carrier parity tests passed");
