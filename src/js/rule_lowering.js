(function(root) {
    "use strict";

    function lowerCellPatternMasks(state, rule, cell, context, options) {
        const ctx = context || {};
        const opts = options || {};
        const layerCount = state.collisionLayers.length;
        const layersUsed = [];
        for (let i = 0; i < layerCount; i++)
            layersUsed.push(null);

        const objectsPresent = makeMask(opts, opts.strideObj);
        const objectsMissing = makeMask(opts, opts.strideObj);
        const anyObjectsPresent = [];
        const movementsPresent = makeMask(opts, opts.strideMov);
        const movementsMissing = makeMask(opts, opts.strideMov);
        const objectLayersMask = makeMask(opts, opts.strideMov);
        const movementBits = opts.movementBits;
        const movementMask = opts.movementMask;
        const directionMask = opts.directionMask || function() { return 0; };

        validateRhsEllipsis(rule, cell, ctx.rhsCell, ctx.hasRhs, opts);

        for (let i = 0; i < cell.length; i += 2) {
            const objectDir = cell[i];
            if (objectDir === "...") {
                validateLhsEllipsis(rule, cell, ctx, opts);
                return { ellipsis: true };
            }
            if (objectDir === "random") {
                reportError(opts, "RANDOM cannot be matched on the left-hand side, it can only appear on the right", rule.lineNumber);
                continue;
            }

            const objectName = cell[i + 1];
            const object = state.objects[objectName];
            const objectMask = state.objectMasks[objectName];
            const layerIndex = object ? object.layer | 0 : state.propertiesSingleLayer[objectName];

            if (typeof(layerIndex) === "undefined")
                reportError(opts, "Oops!  " + objectName.toUpperCase() + " not assigned to a layer.", rule.lineNumber);

            if (objectDir === "no") {
                orMask(objectsMissing, objectMask);
                continue;
            }

            const existingName = layersUsed[layerIndex];
            if (existingName !== null)
                rule.discard = [objectName.toUpperCase(), existingName.toUpperCase()];

            layersUsed[layerIndex] = objectName;

            if (object) {
                orMask(objectsPresent, objectMask);
                shiftOrMask(objectLayersMask, movementMask, movementBits * layerIndex);
            } else {
                anyObjectsPresent.push(objectMask);
            }

            if (objectDir === "stationary")
                shiftOrMask(movementsMissing, movementMask, movementBits * layerIndex);
            else
                shiftOrMask(movementsPresent, directionMask(objectDir), movementBits * layerIndex);
        }

        return {
            ellipsis: false,
            objectsPresent,
            objectsMissing,
            anyObjectsPresent,
            movementsPresent,
            movementsMissing,
            objectlayers_l: objectLayersMask,
            layersUsed_l: layersUsed
        };
    }

    function lowerCellReplacementMasks(state, rule, lhsCell, rhsCell, lhs, options) {
        const opts = options || {};
        const layerCount = state.collisionLayers.length;
        const layerTemplate = [];
        for (let i = 0; i < layerCount; i++)
            layerTemplate.push(null);

        const objectsPresent = lhs.objectsPresent;
        const movementsPresent = lhs.movementsPresent;
        const objectLayersL = cloneMask(lhs.objectlayers_l, opts.strideMov, opts);
        const layersUsedL = lhs.layersUsed_l;
        const layersUsedR = layerTemplate.concat([]);
        const layersUsedRandomR = layerTemplate.concat([]);

        const objectsClear = makeMask(opts, opts.strideObj);
        const objectsSet = makeMask(opts, opts.strideObj);
        const movementsClear = makeMask(opts, opts.strideMov);
        const movementsSet = makeMask(opts, opts.strideMov);
        const objectLayersR = makeMask(opts, opts.strideMov);
        const randomEntityMask = makeMask(opts, opts.strideObj);
        const movementsLayerMask = makeMask(opts, opts.strideMov);
        const randomDirMask = makeMask(opts, opts.strideMov);
        const movementBits = opts.movementBits;
        const movementMask = opts.movementMask;
        const directionMask = opts.directionMask || function() { return 0; };

        for (let i = 0; i < rhsCell.length; i += 2) {
            const objectDir = rhsCell[i];
            const objectName = rhsCell[i + 1];

            if (objectDir === "...") {
                break;
            }
            if (objectDir === "random") {
                lowerRandomEntityReplacement(state, rule, objectName, randomEntityMask, layersUsedR, layersUsedRandomR, opts);
                continue;
            }

            const object = state.objects[objectName];
            const objectMask = state.objectMasks[objectName];
            const layerIndex = object ? object.layer | 0 : state.propertiesSingleLayer[objectName];

            if (objectDir === "no") {
                orMask(objectsClear, objectMask);
                continue;
            }

            let existingName = layersUsedR[layerIndex];
            if (existingName === null)
                existingName = layersUsedRandomR[layerIndex];
            if (existingName !== null && !rule.hasOwnProperty("discard"))
                reportError(opts, 'Rule matches object types that can\'t overlap: "' + objectName.toUpperCase() + '" and "' + existingName.toUpperCase() + '".', rule.lineNumber);

            layersUsedR[layerIndex] = objectName;

            if (objectDir.length > 0)
                shiftOrMask(movementsLayerMask, movementMask, movementBits * layerIndex);

            const layerMask = state.layerMasks[layerIndex];
            if (object) {
                bitSet(objectsSet, object.id);
                orMask(objectsClear, layerMask);
                shiftOrMask(objectLayersR, movementMask, movementBits * layerIndex);
            }

            if (objectDir === "stationary") {
                shiftOrMask(movementsClear, movementMask, movementBits * layerIndex);
            } else if (objectDir === "randomdir") {
                shiftOrMask(randomDirMask, directionMask(objectDir), movementBits * layerIndex);
            } else {
                shiftOrMask(movementsSet, directionMask(objectDir), movementBits * layerIndex);
            }
        }

        if (!bitsSetInArray(objectsPresent, maskData(objectsSet)))
            orMask(objectsClear, objectsPresent);
        if (!bitsSetInArray(movementsPresent, maskData(movementsSet)))
            orMask(movementsClear, movementsPresent);

        for (let layer = 0; layer < layerCount; layer++) {
            if (layersUsedL[layer] !== null && layersUsedR[layer] === null) {
                orMask(objectsClear, state.layerMasks[layer]);
                shiftOrMask(movementsLayerMask, movementMask, movementBits * layer);
            }
        }

        clearMask(objectLayersL, objectLayersR);
        orMask(movementsLayerMask, objectLayersL);

        if (isZero(objectsClear) && isZero(objectsSet) && isZero(movementsClear)
            && isZero(movementsSet) && isZero(movementsLayerMask)
            && isZero(randomEntityMask) && isZero(randomDirMask))
            return null;

        return {
            objectsClear,
            objectsSet,
            movementsClear,
            movementsSet,
            movementsLayerMask,
            randomEntityMask,
            randomDirMask
        };
    }

    function lowerRandomEntityReplacement(state, rule, objectName, randomEntityMask, layersUsedR, layersUsedRandomR, options) {
        const opts = options || {};
        if (!(objectName in state.objectMasks)) {
            reportError(opts, 'You want to spawn a random "' + objectName.toUpperCase() + '", but I don\'t know how to do that', rule.lineNumber);
            return;
        }

        orMask(randomEntityMask, state.objectMasks[objectName]);
        let values;
        if (state.propertiesDict.hasOwnProperty(objectName)) {
            values = state.propertiesDict[objectName];
        } else {
            reportWarning(opts, `In this rule you're asking me to spawn a random ${objectName.toUpperCase()} for you, but that's already a concrete single object.  You wanna be using random with properties (things defined in terms of OR in the legend) so there's some things to select between.`, rule.lineNumber);
            values = [objectName];
        }

        for (const subobject of values) {
            const layerIndex = state.objects[subobject].layer | 0;
            const existingName = layersUsedR[layerIndex];
            if (existingName !== null) {
                const left = subobject.toUpperCase();
                const right = existingName.toUpperCase();
                if (left !== right)
                    reportWarning(opts, "This rule may try to spawn a " + left + " with random, but also requires a " + right + " be here, which is on the same layer - they shouldn't be able to coexist!", rule.lineNumber);
            }
            layersUsedRandomR[layerIndex] = subobject;
        }
    }

    function validateLhsEllipsis(rule, lhsCell, context, options) {
        const ctx = context || {};
        if (lhsCell.length !== 2) {
            reportError(options, "You can't have anything in with an ellipsis. Sorry.", rule.lineNumber);
        } else if (ctx.cellIndex === 0 || ctx.cellIndex === ctx.rowLength - 1) {
            reportError(options, "There's no point in putting an ellipsis at the very start or the end of a rule", rule.lineNumber);
        } else if (ctx.hasRhs) {
            const rhsCell = ctx.rhsCell;
            if (!rhsCell || rhsCell.length !== 2 || rhsCell[0] !== "...")
                reportError(options, "An ellipsis on the left must be matched by one in the corresponding place on the right.", rule.lineNumber);
        }
    }

    function validateRhsEllipsis(rule, lhsCell, rhsCell, hasRhs, options) {
        if (!hasRhs || !rhsCell)
            return;
        if (rhsCell[0] === "..." && lhsCell[0] !== "...")
            reportError(options, "An ellipsis on the right must be matched by one in the corresponding place on the left.", rule.lineNumber);
        for (let i = 0; i < rhsCell.length; i += 2) {
            if (rhsCell[i] === "..." && rhsCell.length !== 2)
                reportError(options, "You can't have anything in with an ellipsis. Sorry.", rule.lineNumber);
        }
    }

    function makeMask(options, size) {
        if (options && options.makeMask)
            return options.makeMask(size);
        return new Int32Array(size || 1);
    }

    function cloneMask(source, size, options) {
        if (options && options.cloneMask)
            return options.cloneMask(source, size);
        const clone = makeMask(options, size);
        orMask(clone, source);
        return clone;
    }

    function maskData(mask) {
        return mask && mask.data ? mask.data : mask;
    }

    function orMask(target, source) {
        if (target && target.ior) {
            target.ior(source);
            return;
        }
        const targetData = maskData(target);
        const sourceData = maskData(source);
        if (!sourceData)
            return;
        for (let i = 0; i < targetData.length; i++)
            targetData[i] |= sourceData[i] || 0;
    }

    function shiftOrMask(target, mask, shift) {
        if (target && target.ishiftor) {
            target.ishiftor(mask, shift);
            return;
        }
        const data = maskData(target);
        const word = shift >> 5;
        const offset = shift & 31;
        data[word] |= mask << offset;
        if (offset && word + 1 < data.length)
            data[word + 1] |= mask >>> (32 - offset);
    }

    function bitSet(target, bit) {
        if (target && target.ibitset) {
            target.ibitset(bit);
            return;
        }
        maskData(target)[bit >> 5] |= 1 << (bit & 31);
    }

    function bitsSetInArray(mask, arr) {
        if (mask && mask.bitsSetInArray)
            return mask.bitsSetInArray(arr);
        const data = maskData(mask);
        for (let i = 0; i < data.length; i++) {
            if ((data[i] & arr[i]) !== data[i])
                return false;
        }
        return true;
    }

    function clearMask(target, source) {
        if (target && target.iclear) {
            target.iclear(source);
            return;
        }
        const targetData = maskData(target);
        const sourceData = maskData(source);
        for (let i = 0; i < targetData.length; i++)
            targetData[i] &= ~(sourceData[i] || 0);
    }

    function isZero(mask) {
        if (mask && mask.iszero)
            return mask.iszero();
        const data = maskData(mask);
        for (let i = 0; i < data.length; i++) {
            if (data[i])
                return false;
        }
        return true;
    }

    function reportError(options, message, lineNumber) {
        if (options && options.onError)
            options.onError(message, lineNumber);
    }

    function reportWarning(options, message, lineNumber) {
        if (options && options.onWarning)
            options.onWarning(message, lineNumber);
    }

    const RuleLowering = {
        lowerCellPatternMasks,
        lowerCellReplacementMasks
    };

    root.RuleLowering = RuleLowering;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleLowering;
})(typeof window !== "undefined" ? window : this);
