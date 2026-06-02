(function(root) {
    "use strict";

    function scanPatternOrigins(board, variant, options, hooks) {
        const opts = options || {};
        const api = hooks || {};
        const visitor = opts.visitor;
        if (!visitor)
            throw new Error("Rule scan requires a visitor.");

        const directionAxis = api.axisForDirection
            ? api.axisForDirection(opts.scanDirection || opts.direction)
            : null;
        const localRadius = parseLocalRadius(opts.localRadius);
        const playerPositions = opts.playerPositions || [];

        if (opts.isGlobal || localRadius === null || playerPositions.length === 0) {
            scanFullBoard(board, variant, directionAxis, visitor, api);
            return;
        }

        if (!api.indexToCoord || !api.localBoundsAround || !api.tightenBounds || !api.scanBounds)
            throw new Error("Local-radius rule scan requires spatial scan hooks.");

        const bounds = api.tightenBounds(board, api.localBoundsAround(board, api.indexToCoord(board, playerPositions[0]), localRadius), variant);
        api.scanBounds(board, bounds, directionAxis, visitor);
    }

    function scanFullBoard(board, variant, directionAxis, visitor, hooks) {
        const api = hooks || {};
        if (directionAxis && api.fullBounds && api.tightenBounds && api.scanBounds) {
            api.scanBounds(board, api.tightenBounds(board, api.fullBounds(board), variant), directionAxis, visitor);
            return;
        }

        const count = api.cellCount ? api.cellCount(board) : board.cellCount;
        for (let origin = 0; origin < count; origin++)
            visitor(origin);
    }

    function parseLocalRadius(value) {
        if (value === undefined || value === null)
            return null;
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
    }

    const RuleScan = {
        scanPatternOrigins,
        parseLocalRadius
    };

    root.RuleScan = RuleScan;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleScan;
})(typeof window !== "undefined" ? window : this);
