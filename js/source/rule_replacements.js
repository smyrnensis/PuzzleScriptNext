(function(root) {
    "use strict";

    function applyCellReplacement(board, index, replacement, rule, hooks) {
        const api = hooks || {};
        if (!replacement)
            return false;

        const cell = api.getCell(board, index);
        const oldCell = api.cloneCell ? api.cloneCell(cell) : cell;
        const movements = api.getMovements ? api.getMovements(board, index) : null;
        const masksChanged = api.applyCellReplacementMasks(board, cell, movements, replacement);
        const rigidChanged = applyRigidReplacementMasks(board, index, replacement, rule, api);

        if (!masksChanged && !rigidChanged)
            return false;

        if (masksChanged) {
            if (api.recordCellReplacementSfx)
                api.recordCellReplacementSfx(board, index, oldCell, cell);
            if (api.setCell)
                api.setCell(board, index, cell);
            if (api.setMovements)
                api.setMovements(board, index, movements);
        }
        return true;
    }

    function applyRigidReplacementMasks(board, index, replacement, rule, hooks) {
        const api = hooks || {};
        if (!rule || !rule.rigid || !api.applyRigidReplacementMasks)
            return false;
        if (!api.getRigidGroupIndexMask || !api.getRigidMovementAppliedMask)
            return false;
        if (!api.setRigidGroupIndexMask || !api.setRigidMovementAppliedMask)
            return false;

        const groupMask = api.getRigidGroupIndexMask(board, index);
        const appliedMask = api.getRigidMovementAppliedMask(board, index);
        if (!groupMask || !appliedMask)
            return false;

        const rigidResult = api.applyRigidReplacementMasks(
            groupMask,
            appliedMask,
            replacement,
            {
                isRigid: true,
                rigidGroupIndex: api.rigidGroupIndexForRule ? api.rigidGroupIndexForRule(board, rule) : 0,
                layerCount: api.layerCount ? api.layerCount(board) : 0,
                movementBits: api.movementBits ? api.movementBits(board) : 0,
                strideMov: api.strideMov ? api.strideMov(board) : 0
            }
        );
        if (!rigidResult || !rigidResult.changed)
            return false;

        api.setRigidGroupIndexMask(board, index, rigidResult.groupMask);
        api.setRigidMovementAppliedMask(board, index, rigidResult.appliedMask);
        return true;
    }

    function applyMatchReplacements(board, match, rule, hooks) {
        const api = hooks || {};
        let changed = false;
        for (const cell of match.cells || []) {
            if (cell.pattern && cell.pattern.replacement)
                changed = applyCellReplacement(board, cell.index, cell.pattern.replacement, rule, api) || changed;
        }
        return changed;
    }

    function isMatchStillValid(board, match, hooks) {
        const api = hooks || {};
        if (!match || !Array.isArray(match.cells))
            return false;
        for (const cell of match.cells) {
            if (!api.matchesCell(board, cell))
                return false;
        }
        return true;
    }

    const RuleReplacements = {
        applyCellReplacement,
        applyRigidReplacementMasks,
        applyMatchReplacements,
        isMatchStillValid
    };

    root.RuleReplacements = RuleReplacements;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleReplacements;
})(typeof window !== "undefined" ? window : this);
