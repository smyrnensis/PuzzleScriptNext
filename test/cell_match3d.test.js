const assert = require("assert");

const match = require("../src/js/cell_match3d.js");

function testMatchesAllRequiredObjectBitsLike2DCellPattern() {
    const cell = match.bitMask(1, [1, 3, 5]);
    const pattern = {
        objectsPresent: match.bitMask(1, [1, 5]),
        objectsMissing: match.bitMask(1, []),
        anyObjectsPresent: []
    };

    assert.strictEqual(match.matchesCell(cell, pattern), true);
    pattern.objectsPresent = match.bitMask(1, [1, 2]);
    assert.strictEqual(match.matchesCell(cell, pattern), false);
}

function testRejectsCellsContainingMissingObjectBitsLikeNoObject() {
    const cell = match.bitMask(1, [1, 3]);
    const pattern = {
        objectsPresent: match.bitMask(1, [1]),
        objectsMissing: match.bitMask(1, [3]),
        anyObjectsPresent: []
    };

    assert.strictEqual(match.matchesCell(cell, pattern), false);
    pattern.objectsMissing = match.bitMask(1, [2]);
    assert.strictEqual(match.matchesCell(cell, pattern), true);
}

function testAcceptsPropertyMaskWhenAnyCandidateObjectIsPresent() {
    const cell = match.bitMask(1, [4]);
    const pattern = {
        objectsPresent: match.bitMask(1, []),
        objectsMissing: match.bitMask(1, []),
        anyObjectsPresent: [
            match.bitMask(1, [2, 4, 6])
        ]
    };

    assert.strictEqual(match.matchesCell(cell, pattern), true);
    pattern.anyObjectsPresent = [match.bitMask(1, [2, 6])];
    assert.strictEqual(match.matchesCell(cell, pattern), false);
}

function testRejectsNoPropertyWhenAnyCandidateObjectIsPresent() {
    const cell = match.bitMask(1, [4]);
    const pattern = {
        objectsPresent: match.bitMask(1, []),
        objectsMissing: match.bitMask(1, [2, 4, 6]),
        anyObjectsPresent: []
    };

    assert.strictEqual(match.matchesCell(cell, pattern), false);
    pattern.objectsMissing = match.bitMask(1, [2, 6]);
    assert.strictEqual(match.matchesCell(cell, pattern), true);
}

function testSupportsMultiWordObjectMasksLike2DStrideObj() {
    const cell = match.bitMask(2, [1, 33]);
    const pattern = {
        objectsPresent: match.bitMask(2, [33]),
        objectsMissing: match.bitMask(2, [34]),
        anyObjectsPresent: [match.bitMask(2, [1, 40])]
    };

    assert.strictEqual(match.matchesCell(cell, pattern), true);
    pattern.objectsMissing = match.bitMask(2, [33]);
    assert.strictEqual(match.matchesCell(cell, pattern), false);
}

function testAcceptsBitVecLikeObjectsWithoutImporting2DEngine() {
    const cell = { data: match.bitMask(1, [1]) };
    const pattern = {
        objectsPresent: { data: match.bitMask(1, [1]) },
        objectsMissing: { data: match.bitMask(1, [2]) },
        anyObjectsPresent: [{ data: match.bitMask(1, [1, 3]) }]
    };

    assert.strictEqual(match.matchesCell(cell, pattern), true);
}

function testMatchesMovementMasksLike2DCellPattern() {
    const cell = match.bitMask(1, [1]);
    const movements = new Int32Array([0x0104]);
    const pattern = {
        objectsPresent: match.bitMask(1, [1]),
        objectsMissing: match.bitMask(1, []),
        anyObjectsPresent: [],
        movementsPresent: new Int32Array([0x0100]),
        movementsMissing: new Int32Array([0x0002])
    };

    assert.strictEqual(match.matchesCell(cell, pattern, movements), true);
    pattern.movementsPresent = new Int32Array([0x0200]);
    assert.strictEqual(match.matchesCell(cell, pattern, movements), false);

    pattern.movementsPresent = new Int32Array([0x0100]);
    pattern.movementsMissing = new Int32Array([0x0004]);
    assert.strictEqual(match.matchesCell(cell, pattern, movements), false);
}

testMatchesAllRequiredObjectBitsLike2DCellPattern();
testRejectsCellsContainingMissingObjectBitsLikeNoObject();
testAcceptsPropertyMaskWhenAnyCandidateObjectIsPresent();
testRejectsNoPropertyWhenAnyCandidateObjectIsPresent();
testSupportsMultiWordObjectMasksLike2DStrideObj();
testAcceptsBitVecLikeObjectsWithoutImporting2DEngine();
testMatchesMovementMasksLike2DCellPattern();

console.log("3d cell match tests passed");
