(function(root) {
    "use strict";

    const MODEL = "psnext-grid3";
    const SCHEMA_VERSION = 1;
    const TOP_LEVEL_KEYS = [
        "model",
        "schemaVersion",
        "levelName",
        "size",
        "spriteGrid",
        "objects",
        "drawPlan",
        "cells",
        "session",
        "effects",
        "view"
    ];
    const VIEW_KEYS = [
        "projection",
        "yaw",
        "pitch",
        "cameraZoom",
        "cameraViewAngle",
        "backgroundColor",
        "shade",
        "visibility",
        "slice",
        "visibleRegion"
    ];

    function validateRenderFrame3D(frame) {
        assertObject(frame, "3D render frame");
        assertKnownKeys(frame, TOP_LEVEL_KEYS, "3D render frame");
        if (frame.model !== MODEL)
            throw new Error("3D render frame contract violation: model must be psnext-grid3.");
        if (frame.schemaVersion !== SCHEMA_VERSION)
            throw new Error("3D render frame contract violation: schemaVersion must be 1.");

        validateSize(frame.size);
        validateSpriteGrid(frame.spriteGrid);
        validateObjects(frame.objects);
        validateDrawPlan(frame.drawPlan, frame.objects, frame.size);
        validateCells(frame.cells, frame.size, frame.objects);
        assertObject(frame.session, "3D render frame session");
        validateEffects(frame.effects);
        validateView(frame.view);
        return frame;
    }

    function validateSize(size) {
        assertObject(size, "3D render frame size");
        assertPositiveInteger(size.width, "size.width");
        assertPositiveInteger(size.height, "size.height");
        assertPositiveInteger(size.depth, "size.depth");
        assertNonNegativeInteger(size.layerCount, "size.layerCount");
    }

    function validateSpriteGrid(spriteGrid) {
        assertObject(spriteGrid, "3D render frame spriteGrid");
        assertPositiveInteger(spriteGrid.width, "spriteGrid.width");
        assertPositiveInteger(spriteGrid.height, "spriteGrid.height");
        assertPositiveInteger(spriteGrid.depth, "spriteGrid.depth");
    }

    function validateObjects(objects) {
        if (!Array.isArray(objects))
            throw new Error("3D render frame contract violation: objects must be an array.");
        for (let index = 0; index < objects.length; index++) {
            const object = objects[index];
            if (object == null)
                throw new Error("3D render frame contract violation: objects must not contain empty entries.");
            assertObject(object, `3D render frame object ${index}`);
            if (object.id !== index)
                throw new Error("3D render frame contract violation: object.id must match its array index.");
            if (typeof object.name !== "string")
                throw new Error("3D render frame contract violation: object.name must be a string.");
            assertNonNegativeInteger(object.layer, "object.layer");
            assertObject(object.visual, "3D render frame object visual");
        }
    }

    function validateDrawPlan(drawPlan, objects, size) {
        assertObject(drawPlan, "3D render frame drawPlan");
        if (!Array.isArray(drawPlan.objectGroups))
            throw new Error("3D render frame contract violation: drawPlan.objectGroups must be an array.");
        if (!Array.isArray(drawPlan.cellOrder))
            throw new Error("3D render frame contract violation: drawPlan.cellOrder must be an array.");

        for (const group of drawPlan.objectGroups) {
            assertObject(group, "3D render frame drawPlan object group");
            assertNonNegativeInteger(group.firstObjectId, "drawPlan.objectGroups.firstObjectId");
            assertNonNegativeInteger(group.objectCount, "drawPlan.objectGroups.objectCount");
            if (group.firstObjectId + group.objectCount > objects.length)
                throw new Error("3D render frame contract violation: drawPlan object group exceeds objects length.");
            for (let objectId = group.firstObjectId; objectId < group.firstObjectId + group.objectCount; objectId++) {
                if (!objects[objectId])
                    throw new Error("3D render frame contract violation: drawPlan object group references a missing object.");
            }
        }

        const cellCount = size.width * size.height * size.depth;
        if (drawPlan.cellOrder.length !== cellCount)
            throw new Error("3D render frame contract violation: drawPlan.cellOrder must cover every cell.");
        const seen = new Set();
        for (const cellIndex of drawPlan.cellOrder) {
            assertNonNegativeInteger(cellIndex, "drawPlan.cellOrder entry");
            if (cellIndex >= cellCount)
                throw new Error("3D render frame contract violation: drawPlan.cellOrder entry is outside cells.");
            if (seen.has(cellIndex))
                throw new Error("3D render frame contract violation: drawPlan.cellOrder must not contain duplicates.");
            seen.add(cellIndex);
        }
    }

    function validateCells(cells, size, objects) {
        if (!Array.isArray(cells))
            throw new Error("3D render frame contract violation: cells must be an array.");
        const expected = size.width * size.height * size.depth;
        if (cells.length !== expected)
            throw new Error("3D render frame contract violation: cells length must equal width * height * depth.");

        for (let index = 0; index < cells.length; index++) {
            const cell = cells[index];
            assertObject(cell, `3D render frame cell ${index}`);
            if (cell.index !== index)
                throw new Error("3D render frame contract violation: cell.index must match its array index.");
            assertNonNegativeInteger(cell.x, "cell.x");
            assertNonNegativeInteger(cell.y, "cell.y");
            assertNonNegativeInteger(cell.z, "cell.z");
            if (!Array.isArray(cell.objectIds))
                throw new Error("3D render frame contract violation: cell.objectIds must be an array.");
            for (const objectId of cell.objectIds) {
                assertNonNegativeInteger(objectId, "cell.objectIds entry");
                if (objectId >= objects.length || !objects[objectId])
                    throw new Error("3D render frame contract violation: cell.objectIds entry is outside objects.");
            }
        }
    }

    function validateEffects(effects) {
        assertObject(effects, "3D render frame effects");
        if (!effects.message || typeof effects.message.requested !== "boolean")
            throw new Error("3D render frame contract violation: effects.message must be normalized.");
        if (!effects.status || typeof effects.status.requested !== "boolean")
            throw new Error("3D render frame contract violation: effects.status must be normalized.");
        if (!effects.sfx || !Array.isArray(effects.sfx.playSeeds))
            throw new Error("3D render frame contract violation: effects.sfx must be normalized.");
        validateTween(effects.tween);
    }

    function validateTween(tween) {
        assertObject(tween, "3D render frame effects.tween");
        if (typeof tween.enabled !== "boolean")
            throw new Error("3D render frame contract violation: effects.tween.enabled must be a boolean.");
        assertNonNegativeNumber(tween.lengthMs, "effects.tween.lengthMs");
        if (typeof tween.easing !== "string")
            throw new Error("3D render frame contract violation: effects.tween.easing must be a string.");
        assertPositiveInteger(tween.snap, "effects.tween.snap");
        assertNonNegativeNumber(tween.elapsedMs, "effects.tween.elapsedMs");
        assertNonNegativeInteger(tween.actionMask, "effects.tween.actionMask");
        assertObject(tween.movedEntities, "3D render frame effects.tween.movedEntities");
        assertObject(tween.directionDeltas, "3D render frame effects.tween.directionDeltas");
        for (const key of Object.keys(tween.movedEntities)) {
            if (!/^p\d+-l\d+$/.test(key))
                throw new Error("3D render frame contract violation: effects.tween.movedEntities keys must use p<index>-l<layer>.");
            assertNonNegativeInteger(tween.movedEntities[key], "effects.tween.movedEntities entry");
        }
        for (const key of Object.keys(tween.directionDeltas)) {
            assertNonNegativeInteger(Number(key), "effects.tween.directionDeltas key");
            const delta = tween.directionDeltas[key];
            assertObject(delta, "3D render frame effects.tween.directionDeltas entry");
            assertNumber(delta.x, "effects.tween.directionDeltas.x");
            assertNumber(delta.y, "effects.tween.directionDeltas.y");
            assertNumber(delta.z, "effects.tween.directionDeltas.z");
        }
    }

    function validateView(view) {
        assertObject(view, "3D render frame view");
        assertKnownKeys(view, VIEW_KEYS, "3D render frame view");
        if (view.projection !== "orthographic" && view.projection !== "perspective")
            throw new Error("3D render frame contract violation: view.projection must be orthographic or perspective.");
        assertNumber(view.yaw, "view.yaw");
        assertNumber(view.pitch, "view.pitch");
        assertPositiveNumber(view.cameraZoom, "view.cameraZoom");
        assertPositiveNumber(view.cameraViewAngle, "view.cameraViewAngle");
        if (typeof view.backgroundColor !== "string" || view.backgroundColor.length === 0)
            throw new Error("3D render frame contract violation: view.backgroundColor must be a string.");
        if (typeof view.shade !== "boolean")
            throw new Error("3D render frame contract violation: view.shade must be a boolean.");
        if (view.visibility !== "all" && view.visibility !== "slice")
            throw new Error("3D render frame contract violation: view.visibility must be all or slice.");
        if (view.visibility === "all" && view.slice !== null)
            throw new Error("3D render frame contract violation: view.slice must be null when visibility is all.");
        if (view.visibility === "slice")
            validateSlice(view.slice);
        validateVisibleRegion(view.visibleRegion);
    }

    function validateSlice(slice) {
        assertObject(slice, "3D render frame view.slice");
        if (slice.axis !== "x" && slice.axis !== "y" && slice.axis !== "z")
            throw new Error("3D render frame contract violation: view.slice.axis must be x, y, or z.");
        assertNonNegativeInteger(slice.index, "view.slice.index");
    }

    function validateVisibleRegion(value) {
        if (value === null)
            return;
        assertObject(value, "3D render frame view.visibleRegion");
        assertKnownKeys(value, ["x", "z", "width", "depth"], "3D render frame view.visibleRegion");
        assertNonNegativeInteger(value.x, "view.visibleRegion.x");
        assertNonNegativeInteger(value.z, "view.visibleRegion.z");
        assertPositiveInteger(value.width, "view.visibleRegion.width");
        assertPositiveInteger(value.depth, "view.visibleRegion.depth");
    }

    function assertKnownKeys(object, keys, label) {
        const allowed = new Set(keys);
        for (const key of Object.keys(object)) {
            if (!allowed.has(key))
                throw new Error(`${label} contract violation: unexpected field ${key}.`);
        }
    }

    function assertObject(value, label) {
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error(`${label} contract violation: expected object.`);
    }

    function assertPositiveInteger(value, label) {
        if (!Number.isInteger(value) || value <= 0)
            throw new Error(`3D render frame contract violation: ${label} must be a positive integer.`);
    }

    function assertNonNegativeInteger(value, label) {
        if (!Number.isInteger(value) || value < 0)
            throw new Error(`3D render frame contract violation: ${label} must be a non-negative integer.`);
    }

    function assertNumber(value, label) {
        if (!Number.isFinite(value))
            throw new Error(`3D render frame contract violation: ${label} must be a number.`);
    }

    function assertNonNegativeNumber(value, label) {
        if (!Number.isFinite(value) || value < 0)
            throw new Error(`3D render frame contract violation: ${label} must be a non-negative number.`);
    }

    function assertPositiveNumber(value, label) {
        if (!Number.isFinite(value) || value <= 0)
            throw new Error(`3D render frame contract violation: ${label} must be a positive number.`);
    }

    const api = {
        MODEL,
        SCHEMA_VERSION,
        validateRenderFrame3D
    };

    root.Puzzle3DRenderFrameContract = api;
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
})(typeof window !== "undefined" ? window : this);
