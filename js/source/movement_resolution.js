(function(root) {
    "use strict";

    function resolveMovements(board, hooks) {
        const api = hooks || {};
        requireHook(api, "cellCount");
        requireHook(api, "repositionEntitiesAtCell");
        requireHook(api, "findRigidFailures");
        requireHook(api, "clearAllMovementsAndRigidMasks");

        if (api.resetMovedEntities)
            api.resetMovedEntities(board);

        let movedAny = false;
        let moved = true;
        while (moved) {
            moved = false;
            for (let index = 0; index < api.cellCount(board); index++)
                moved = api.repositionEntitiesAtCell(board, index) || moved;
            movedAny = movedAny || moved;
        }

        const rigidFailures = api.findRigidFailures(board);
        api.clearAllMovementsAndRigidMasks(board);
        return {
            moved: movedAny,
            rigidFailures,
            shouldUndo: rigidFailures.length > 0,
            movedEntities: api.getMovedEntities ? api.getMovedEntities(board) : {}
        };
    }

    function repositionEntitiesAtCell(board, index, hooks) {
        const api = hooks || {};
        requireHook(api, "getMovements");
        requireHook(api, "isZeroMask");
        requireHook(api, "layerCount");
        requireHook(api, "layerMovement");
        requireHook(api, "repositionEntitiesOnLayer");
        requireHook(api, "clearLayerMovement");
        requireHook(api, "setMovements");

        const movement = api.getMovements(board, index);
        if (api.isZeroMask(movement))
            return false;

        let moved = false;
        for (let layer = 0; layer < api.layerCount(board); layer++) {
            const layerMovement = api.layerMovement(board, movement, layer);
            if (layerMovement === 0)
                continue;

            if (api.repositionEntitiesOnLayer(board, index, layer, layerMovement)) {
                api.clearLayerMovement(board, movement, layerMovement, layer);
                moved = true;
            }
        }

        if (moved)
            api.setMovements(board, index, movement);
        return moved;
    }

    function repositionEntitiesOnLayer(board, index, layer, layerMovement, hooks) {
        const api = hooks || {};
        requireHook(api, "directionForLayerMovement");
        requireHook(api, "targetIndex");
        requireHook(api, "layerMask");
        requireHook(api, "getCell");
        requireHook(api, "anyBitsInCommon");
        requireHook(api, "movingEntitiesOnLayer");
        requireHook(api, "isZeroMask");
        requireHook(api, "recordMovementSfx");
        requireHook(api, "clearLayerEntities");
        requireHook(api, "addEntities");
        requireHook(api, "setCell");

        const direction = api.directionForLayerMovement(board, layerMovement);
        if (!direction)
            return false;

        const targetIndex = api.targetIndex(board, index, direction);
        if (targetIndex == null)
            return false;

        const layerMask = api.layerMask(board, layer);
        if (!layerMask)
            return false;

        const target = api.getCell(board, targetIndex);
        const ignoresLayerCollision = api.ignoresLayerCollision
            ? api.ignoresLayerCollision(board, layerMovement, direction)
            : false;
        if (!ignoresLayerCollision && api.anyBitsInCommon(target, layerMask))
            return false;

        const source = api.getCell(board, index);
        const moving = api.movingEntitiesOnLayer(board, source, layerMask);
        if (api.isZeroMask(moving))
            return false;

        api.recordMovementSfx(board, index, targetIndex, layer, source);
        api.clearLayerEntities(board, source, layerMask);
        api.addEntities(board, target, moving);
        api.setCell(board, index, source);
        api.setCell(board, targetIndex, target);
        if (api.recordMovedEntity)
            api.recordMovedEntity(board, index, targetIndex, layer, layerMovement);
        return true;
    }

    function findRigidFailures(board, hooks) {
        const api = hooks || {};
        requireHook(api, "cellCount");
        requireHook(api, "getMovements");
        requireHook(api, "isZeroMask");
        requireHook(api, "recordCantMoveSfx");
        requireHook(api, "findRigidFailure");

        const failures = [];
        const seenGroups = {};
        for (let index = 0; index < api.cellCount(board); index++) {
            const movement = api.getMovements(board, index);
            if (api.isZeroMask(movement))
                continue;

            api.recordCantMoveSfx(board, index, movement);
            const failure = api.findRigidFailure(board, index, movement);
            if (failure && seenGroups[failure.groupIndex] !== true) {
                seenGroups[failure.groupIndex] = true;
                failures.push(Object.assign({ index }, failure));
            }
        }
        return failures;
    }

    function requireHook(hooks, name) {
        if (typeof hooks[name] !== "function")
            throw new Error("Movement resolution requires a " + name + " hook.");
    }

    const MovementResolution = {
        resolveMovements,
        repositionEntitiesAtCell,
        repositionEntitiesOnLayer,
        findRigidFailures
    };

    root.MovementResolution = MovementResolution;
    if (typeof module !== "undefined" && module.exports)
        module.exports = MovementResolution;
})(typeof window !== "undefined" ? window : this);
