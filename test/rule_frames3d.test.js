const assert = require("assert");

const frames = require("../src/js/rule_frames3d.js");

function testStandardFrameMatchesAuthorFacingMarkers() {
    const frame = frames.STANDARD_RULE_FRAME;

    assert.deepStrictEqual(frame.markerDirections, {
        ">": "right",
        "<": "left",
        "^": "front",
        "v": "back",
        "o": "up",
        "x": "down"
    });
    assert.deepStrictEqual(frames.resolveMarker(frame, ">"), [1, 0, 0]);
    assert.deepStrictEqual(frames.resolveMarker(frame, "^"), [0, 0, -1]);
    assert.deepStrictEqual(frames.resolveMarker(frame, "o"), [0, -1, 0]);
}

function testGenerates24ProperRuleFramesWithoutMirrors() {
    assert.strictEqual(frames.RULE_FRAMES.length, 24);

    const seen = new Set();
    for (const frame of frames.RULE_FRAMES) {
        const key = [
            frame.screenRight.join(","),
            frame.screenUp.join(","),
            frame.screenOut.join(",")
        ].join("|");
        seen.add(key);

        assert.strictEqual(
            frames.determinant(frame.screenRight, frame.screenUp, frame.screenOut),
            frames.STANDARD_DETERMINANT
        );
    }

    assert.strictEqual(seen.size, 24);
}

function testEveryRelativeMarkerResolvesToAbsoluteDirection() {
    for (const frame of frames.RULE_FRAMES) {
        for (const marker of Object.keys(frames.RELATIVE_MARKERS)) {
            const delta = frames.resolveMarker(frame, marker);
            const direction = frames.resolveMarkerDirection(frame, marker);

            assert.strictEqual(frames.directionNameForDelta(delta), direction);
            assert(Object.prototype.hasOwnProperty.call(frames.DIRECTIONS, direction));
        }
    }
}

testStandardFrameMatchesAuthorFacingMarkers();
testGenerates24ProperRuleFramesWithoutMirrors();
testEveryRelativeMarkerResolvesToAbsoluteDirection();

console.log("3d rule frame tests passed");
