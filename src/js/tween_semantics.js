(function(root) {
    "use strict";

    function calculateMovementTweenAmount(options) {
        const opts = options || {};
        const lengthMs = opts.lengthMs || 0;
        if (lengthMs <= 0)
            return 0;
        const elapsedMs = numberOrDefault(opts.elapsedMs, 0);
        const snap = positiveInteger(opts.snap, 1);
        const easing = easingFunction(opts.easing || "linear");
        const raw = easing(1 - clamp(elapsedMs / lengthMs, 0, 1));
        return Math.floor(raw * snap) / snap;
    }

    function movementTweenTransform(movement, tween) {
        if (!tween || !tween.amount)
            return identityTweenTransform();
        if (movement === tween.actionMask) {
            return {
                offset: { x: 0, y: 0, z: 0 },
                alpha: 1 - tween.amount
            };
        }
        const delta = tween.directionDeltas && tween.directionDeltas[movement];
        if (!delta)
            return identityTweenTransform();
        return {
            offset: {
                x: -delta.x * tween.amount,
                y: delta.y * tween.amount,
                z: -delta.z * tween.amount
            },
            alpha: 1
        };
    }

    function identityTweenTransform() {
        return {
            offset: { x: 0, y: 0, z: 0 },
            alpha: 1
        };
    }

    function easingFunction(ease) {
        const key = ease in EASING_FUNCTIONS ? ease
            : Number(ease) in EASING_FUNCTIONS ? Number(ease)
            : "linear";
        return EASING_FUNCTIONS[key];
    }

    function positiveInteger(value, fallback) {
        return Number.isInteger(value) && value > 0 ? value : fallback;
    }

    function numberOrDefault(value, fallback) {
        return Number.isFinite(value) ? value : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    const EASING_FUNCTIONS = {
        linear: t => t,
        1: t => t,
        easeInQuad: t => t * t,
        2: t => t * t,
        easeOutQuad: t => t * (2 - t),
        3: t => t * (2 - t),
        easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        4: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        easeInCubic: t => t * t * t,
        5: t => t * t * t,
        easeOutCubic: t => (--t) * t * t + 1,
        6: t => (--t) * t * t + 1,
        easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
        7: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
        easeInQuart: t => t * t * t * t,
        8: t => t * t * t * t,
        easeOutQuart: t => 1 - (--t) * t * t * t,
        9: t => 1 - (--t) * t * t * t,
        easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
        10: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
        easeInQuint: t => t * t * t * t * t,
        11: t => t * t * t * t * t,
        easeOutQuint: t => 1 + (--t) * t * t * t * t,
        12: t => 1 + (--t) * t * t * t * t,
        easeInOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
        13: t => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t
    };

    const api = {
        calculateMovementTweenAmount,
        movementTweenTransform,
        identityTweenTransform,
        easingFunction,
        EASING_FUNCTIONS
    };

    root.PuzzleScriptTweenSemantics = api;
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
})(typeof window !== "undefined" ? window : this);
