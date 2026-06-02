(function(root) {
    "use strict";

    function evaluateWinConditions(board, winConditions) {
        const conditions = winConditions || [];
        if (!board || conditions.length === 0)
            return false;

        let passed = true;
        for (const condition of conditions) {
            if (!evaluateWinCondition(board, condition))
                passed = false;
        }
        return passed;
    }

    function evaluateWinCondition(board, condition) {
        const type = condition[0];
        const filter1 = maskData(condition[1]);
        const filter2 = maskData(condition[2]);
        const aggregate1 = !!condition[4];
        const aggregate2 = !!condition[5];

        if (type === -1) {
            for (let index = 0; index < cellCount(board); index++) {
                const cell = cellDataAt(board, index);
                if (matchesFilter(filter1, aggregate1, cell) && matchesFilter(filter2, aggregate2, cell))
                    return false;
            }
            return true;
        }

        if (type === 0) {
            for (let index = 0; index < cellCount(board); index++) {
                const cell = cellDataAt(board, index);
                if (matchesFilter(filter1, aggregate1, cell) && matchesFilter(filter2, aggregate2, cell))
                    return true;
            }
            return false;
        }

        if (type === 1) {
            for (let index = 0; index < cellCount(board); index++) {
                const cell = cellDataAt(board, index);
                if (matchesFilter(filter1, aggregate1, cell) && !matchesFilter(filter2, aggregate2, cell))
                    return false;
            }
            return true;
        }

        return false;
    }

    function matchesFilter(mask, aggregate, cell) {
        return aggregate
            ? bitsSetInArray(mask, cell)
            : !bitsClearInArray(mask, cell);
    }

    function cellCount(board) {
        return board.cellCount || board.n_tiles || 0;
    }

    function cellDataAt(board, index) {
        if (board.getCell)
            return maskData(board.getCell(index));
        if (board.getCellInto) {
            const target = reusableCell(board);
            const cell = board.getCellInto(index, target);
            return maskData(cell);
        }
        return maskData(board.getCell(index));
    }

    function reusableCell(board) {
        if (!board.__winConditionCell) {
            if (typeof root.BitVec === "function")
                board.__winConditionCell = new root.BitVec(board.strideObj || board.STRIDE_OBJ || 1);
            else
                board.__winConditionCell = new Int32Array(board.strideObj || board.STRIDE_OBJ || 1);
        }
        return board.__winConditionCell;
    }

    function maskData(mask) {
        return mask && mask.data || mask || [];
    }

    function bitsSetInArray(mask, cellData) {
        for (let i = 0; i < mask.length; i++) {
            if ((mask[i] & cellData[i]) !== mask[i])
                return false;
        }
        return true;
    }

    function bitsClearInArray(mask, cellData) {
        for (let i = 0; i < mask.length; i++) {
            if (mask[i] & cellData[i])
                return false;
        }
        return true;
    }

    const WinConditions = {
        evaluateWinConditions,
        evaluateWinCondition
    };

    root.WinConditions = WinConditions;
    if (typeof module !== "undefined" && module.exports)
        module.exports = WinConditions;
})(typeof window !== "undefined" ? window : this);
