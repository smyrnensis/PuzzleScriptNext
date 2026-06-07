(function(root) {
    "use strict";

    const cellMasksApi = getCellMasksApi();

    const CellMatch3D = {
        matchesCell: cellMasksApi.matchesCell,
        applyCellReplacementMasks: cellMasksApi.applyCellReplacementMasks,
        applyRigidReplacementMasks: cellMasksApi.applyRigidReplacementMasks,
        bitsSetInArray: cellMasksApi.bitsSetInArray,
        bitsClearInArray: cellMasksApi.bitsClearInArray,
        anyBitsInCommon: cellMasksApi.anyBitsInCommon,
        bitMask: cellMasksApi.bitMask
    };

    function getCellMasksApi() {
        if (typeof require === "function") {
            try {
                return require("./cell_masks.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.CellMasks;
    }

    root.CellMatch3D = CellMatch3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = CellMatch3D;
})(typeof window !== "undefined" ? window : this);
