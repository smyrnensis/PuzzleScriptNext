(function(root) {
    "use strict";

    const DIRECTIONS = Object.freeze({
        left: Object.freeze([-1, 0, 0]),
        right: Object.freeze([1, 0, 0]),
        front: Object.freeze([0, 0, -1]),
        back: Object.freeze([0, 0, 1]),
        up: Object.freeze([0, -1, 0]),
        down: Object.freeze([0, 1, 0])
    });

    const RELATIVE_MARKERS = Object.freeze({
        ">": "screenRight",
        "<": "screenLeft",
        "^": "screenUp",
        "v": "screenDown",
        "o": "screenOut",
        "x": "screenIn"
    });

    const STANDARD_RULE_FRAME = makeFrame(
        "standard",
        DIRECTIONS.right,
        DIRECTIONS.front,
        DIRECTIONS.up
    );

    const STANDARD_DETERMINANT = determinant(
        STANDARD_RULE_FRAME.screenRight,
        STANDARD_RULE_FRAME.screenUp,
        STANDARD_RULE_FRAME.screenOut
    );

    function makeFrame(id, screenRight, screenUp, screenOut) {
        const frame = {
            id,
            screenRight: freezeVector(screenRight),
            screenLeft: freezeVector(negate(screenRight)),
            screenUp: freezeVector(screenUp),
            screenDown: freezeVector(negate(screenUp)),
            screenOut: freezeVector(screenOut),
            screenIn: freezeVector(negate(screenOut))
        };

        frame.markerDeltas = Object.freeze({
            ">": frame.screenRight,
            "<": frame.screenLeft,
            "^": frame.screenUp,
            "v": frame.screenDown,
            "o": frame.screenOut,
            "x": frame.screenIn
        });
        frame.markerDirections = Object.freeze({
            ">": directionNameForDelta(frame.screenRight),
            "<": directionNameForDelta(frame.screenLeft),
            "^": directionNameForDelta(frame.screenUp),
            "v": directionNameForDelta(frame.screenDown),
            "o": directionNameForDelta(frame.screenOut),
            "x": directionNameForDelta(frame.screenIn)
        });
        return Object.freeze(frame);
    }

    function generateRuleFrames() {
        const vectors = Object.keys(DIRECTIONS).map(name => DIRECTIONS[name]);
        const frames = [];

        for (const screenRight of vectors) {
            for (const screenUp of vectors) {
                if (dot(screenRight, screenUp) !== 0)
                    continue;

                for (const screenOut of vectors) {
                    if (dot(screenRight, screenOut) !== 0 || dot(screenUp, screenOut) !== 0)
                        continue;
                    if (determinant(screenRight, screenUp, screenOut) !== STANDARD_DETERMINANT)
                        continue;

                    frames.push(makeFrame(
                        `frame_${frames.length}`,
                        screenRight,
                        screenUp,
                        screenOut
                    ));
                }
            }
        }

        return Object.freeze(frames);
    }

    function resolveMarker(frame, marker) {
        if (!frame || !frame.markerDeltas)
            throw new Error("A 3D rule frame is required.");
        if (!Object.prototype.hasOwnProperty.call(frame.markerDeltas, marker))
            throw new Error(`Unknown 3D relative marker: ${marker}`);
        return frame.markerDeltas[marker];
    }

    function resolveMarkerDirection(frame, marker) {
        if (!frame || !frame.markerDirections)
            throw new Error("A 3D rule frame is required.");
        if (!Object.prototype.hasOwnProperty.call(frame.markerDirections, marker))
            throw new Error(`Unknown 3D relative marker: ${marker}`);
        return frame.markerDirections[marker];
    }

    function directionNameForDelta(delta) {
        for (const name of Object.keys(DIRECTIONS)) {
            if (sameVector(DIRECTIONS[name], delta))
                return name;
        }
        return null;
    }

    function freezeVector(vector) {
        return Object.freeze([vector[0], vector[1], vector[2]]);
    }

    function negate(vector) {
        return [-vector[0], -vector[1], -vector[2]];
    }

    function dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function determinant(a, b, c) {
        return a[0] * (b[1] * c[2] - b[2] * c[1])
            - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }

    function sameVector(a, b) {
        return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    }

    const RULE_FRAMES = generateRuleFrames();

    const RuleFrames3D = {
        DIRECTIONS,
        RELATIVE_MARKERS,
        STANDARD_RULE_FRAME,
        STANDARD_DETERMINANT,
        RULE_FRAMES,
        generateRuleFrames,
        resolveMarker,
        resolveMarkerDirection,
        directionNameForDelta,
        determinant,
        sameVector
    };

    root.RuleFrames3D = RuleFrames3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleFrames3D;
})(typeof window !== "undefined" ? window : this);
