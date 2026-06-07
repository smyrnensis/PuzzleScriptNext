(function(root) {
    "use strict";

    function collectSfxArtifacts(options) {
        const opts = options || {};
        const animations = cloneAnimationMap(opts.animations);
        const playSeeds = [];
        const canMoveSeeds = (opts.canMoveSeeds || []).slice();
        const cantMoveSeeds = (opts.cantMoveSeeds || []).slice();
        const createSeeds = [];
        const destroySeeds = [];
        const objectEvents = [];

        for (const seed of cantMoveSeeds)
            appendSeed(playSeeds, seed);
        for (const seed of canMoveSeeds)
            appendSeed(playSeeds, seed);

        collectObjectChangeArtifacts({
            entries: opts.creationMasks || [],
            changedMask: opts.createMask,
            changeList: opts.createList || [],
            kind: "create",
            animations,
            playSeeds,
            bucket: createSeeds,
            events: objectEvents
        });

        collectObjectChangeArtifacts({
            entries: opts.destructionMasks || [],
            changedMask: opts.destroyMask,
            changeList: opts.destroyList || [],
            kind: "destroy",
            animations,
            playSeeds,
            bucket: destroySeeds,
            events: objectEvents
        });

        return {
            playSeeds,
            canMoveSeeds,
            cantMoveSeeds,
            createSeeds,
            destroySeeds,
            objectEvents,
            animations
        };
    }

    function recordMovementSfx(options) {
        const opts = options || {};
        const entries = opts.entries || [];
        const sourceMask = opts.sourceMask;
        const movementMask = opts.movementMask;
        const canMoveSeeds = opts.canMoveSeeds || [];
        const animations = opts.animations || {};

        for (const fx of entries) {
            if (!maskHasBit(sourceMask, fx.objId))
                continue;
            if (!anyBitsInCommon(movementMask, fx.directionMask))
                continue;

            if (opts.onLog)
                opts.onLog(fx);

            if (isAnimationSeed(fx.seed)) {
                const move = layerMovement(movementMask, objectLayerForId(fx.objId, opts), opts);
                const position = opts.animationPosition
                    ? opts.animationPosition(fx, move)
                    : opts.positionIndex;
                animations[position + "," + fx.objId] = {
                    kind: "move",
                    seed: fx.seed,
                    dir: move
                };
            } else if (canMoveSeeds.indexOf(fx.seed) === -1) {
                canMoveSeeds.push(fx.seed);
            }
        }

        return {
            canMoveSeeds,
            animations
        };
    }

    function recordCantMoveSfx(options) {
        const opts = options || {};
        const entries = opts.entries || [];
        const cellMask = opts.cellMask;
        const movementMask = opts.movementMask;
        const cantMoveSeeds = opts.cantMoveSeeds || [];
        const animations = opts.animations || {};

        for (const fx of entries) {
            if (!maskHasBit(cellMask, fx.objId))
                continue;
            if (!anyBitsInCommon(movementMask, fx.directionMask))
                continue;

            if (opts.onLog)
                opts.onLog(fx);

            if (isAnimationSeed(fx.seed)) {
                const move = layerMovement(movementMask, objectLayerForId(fx.objId, opts), opts);
                animations[opts.positionIndex + "," + fx.objId] = {
                    kind: "cant",
                    seed: fx.seed,
                    dir: move
                };
            } else if (cantMoveSeeds.indexOf(fx.seed) === -1) {
                cantMoveSeeds.push(fx.seed);
            }
        }

        return {
            cantMoveSeeds,
            animations
        };
    }

    function collectObjectChangeArtifacts(options) {
        const opts = options || {};
        for (const entry of opts.entries || []) {
            if (!maskHasBit(opts.changedMask, entry.objId))
                continue;

            if (isAnimationSeed(entry.seed)) {
                for (const fx of opts.changeList || []) {
                    if (fx.objId === entry.objId) {
                        opts.animations[fx.posIndex + "," + fx.objId] = {
                            kind: opts.kind,
                            seed: entry.seed
                        };
                        opts.events.push({
                            kind: opts.kind,
                            seed: entry.seed,
                            objId: entry.objId,
                            posIndex: fx.posIndex
                        });
                    }
                }
            } else {
                opts.playSeeds.push(entry.seed);
                opts.events.push({
                    kind: opts.kind,
                    seed: entry.seed,
                    objId: entry.objId
                });
            }
            opts.bucket.push(entry.seed);
        }
    }

    function isAnimationSeed(seed) {
        return typeof seed === "string" && seed.startsWith("afx");
    }

    function appendSeed(target, seed) {
        target.push(seed);
    }

    function maskHasBit(mask, bit) {
        if (!mask || bit === undefined || bit === null)
            return false;
        if (typeof mask.get === "function")
            return mask.get(bit);
        const data = mask.data || mask;
        const word = bit >> 5;
        const shift = bit & 31;
        return !!(data[word] & (1 << shift));
    }

    function anyBitsInCommon(mask, other) {
        if (!mask || !other)
            return false;
        if (typeof mask.anyBitsInCommon === "function")
            return mask.anyBitsInCommon(other);
        const left = mask.data || mask;
        const right = other.data || other;
        for (let i = 0; i < left.length; i++) {
            if (left[i] & (right[i] || 0))
                return true;
        }
        return false;
    }

    function layerMovement(movementMask, layer, options) {
        const opts = options || {};
        if (movementMask && typeof movementMask.getshiftor === "function")
            return movementMask.getshiftor(opts.movementMaskValue, opts.movementBits * layer);
        const data = movementMask.data || movementMask || [];
        const shift = opts.movementBits * layer;
        const word = shift >> 5;
        const offset = shift & 31;
        let value = data[word] >>> offset;
        if (offset && word + 1 < data.length)
            value |= data[word + 1] << (32 - offset);
        return value & opts.movementMaskValue;
    }

    function objectLayerForId(objId, options) {
        const opts = options || {};
        if (opts.objectLayers && opts.objectLayers[objId] !== undefined && opts.objectLayers[objId] !== null)
            return opts.objectLayers[objId];
        if (opts.objectLayerForId)
            return opts.objectLayerForId(objId);
        return 0;
    }

    function cloneAnimationMap(source) {
        const result = {};
        for (const key of Object.keys(source || {}))
            result[key] = Object.assign({}, source[key]);
        return result;
    }

    const SfxArtifacts = {
        collectSfxArtifacts,
        recordMovementSfx,
        recordCantMoveSfx
    };

    root.SfxArtifacts = SfxArtifacts;
    if (typeof module !== "undefined" && module.exports)
        module.exports = SfxArtifacts;
})(typeof window !== "undefined" ? window : this);
