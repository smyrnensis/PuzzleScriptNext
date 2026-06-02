(function(root) {
    "use strict";

    function matchesCell(cell, pattern, movements) {
        return matchesCellData(
            cellDataOf(cell),
            pattern,
            movementDataOf(movements)
        );
    }

    function matchesCellAt(index, objects, movements, pattern, options) {
        const opts = options || {};
        const strideObj = opts.strideObj || dataLengthOf(pattern.objectsPresent);
        const strideMov = opts.strideMov || dataLengthOf(pattern.movementsPresent);
        const objectOffset = index * strideObj;
        const movementOffset = index * strideMov;

        return matchesCellDataAt(
            objects,
            objectOffset,
            movements,
            movementOffset,
            pattern,
            strideObj,
            strideMov
        );
    }

    function matchesCellData(cellData, pattern, movementData) {
        const objectsPresent = maskDataOf(pattern.objectsPresent);
        const objectsMissing = maskDataOf(pattern.objectsMissing);
        const anyObjectsPresent = pattern.anyObjectsPresent || [];
        const movementsPresent = maskDataOf(pattern.movementsPresent);
        const movementsMissing = maskDataOf(pattern.movementsMissing);
        const movements = movementData || [];

        return bitsSetInArray(objectsPresent, cellData)
            && bitsClearInArray(objectsMissing, cellData)
            && anyObjectsPresent.every(mask => anyBitsInCommon(maskDataOf(mask), cellData))
            && bitsSetInArray(movementsPresent, movements)
            && bitsClearInArray(movementsMissing, movements);
    }

    function matchesCellDataAt(objects, objectOffset, movements, movementOffset, pattern, strideObj, strideMov) {
        const objectsPresent = maskDataOf(pattern.objectsPresent);
        const objectsMissing = maskDataOf(pattern.objectsMissing);
        const anyObjectsPresent = pattern.anyObjectsPresent || [];
        const movementsPresent = maskDataOf(pattern.movementsPresent);
        const movementsMissing = maskDataOf(pattern.movementsMissing);

        return bitsSetAt(objectsPresent, objects, objectOffset, strideObj)
            && bitsClearAt(objectsMissing, objects, objectOffset, strideObj)
            && anyObjectsPresent.every(mask => anyBitsAt(maskDataOf(mask), objects, objectOffset, strideObj))
            && bitsSetAt(movementsPresent, movements, movementOffset, strideMov)
            && bitsClearAt(movementsMissing, movements, movementOffset, strideMov);
    }

    function applyCellReplacementMasks(cell, movements, replacement, options) {
        if (!replacement)
            return false;

        const cellData = cellDataOf(cell);
        const movementData = movementDataOf(movements);
        const oldCell = new Int32Array(cellData);
        const oldMovements = new Int32Array(movementData);
        const effective = prepareCellReplacementMasks(replacement, options);

        clearMask(cellData, effective.objectsClear);
        orMask(cellData, effective.objectsSet);

        clearMask(movementData, effective.movementsClear);
        orMask(movementData, effective.movementsSet);

        return !sameMask(cellData, oldCell) || !sameMask(movementData, oldMovements);
    }

    function prepareCellReplacementMasks(replacement, options) {
        const opts = options || {};
        const objectsSet = cloneMaskData(replacement.objectsSet);
        const objectsClear = cloneMaskData(replacement.objectsClear);
        const movementsSet = cloneMaskData(replacement.movementsSet);
        const movementsClear = cloneMaskData(replacement.movementsClear);

        orMask(movementsClear, maskDataOf(replacement.movementsLayerMask));
        applyRandomEntityMask(objectsSet, objectsClear, movementsClear, replacement, opts);
        applyRandomDirMask(movementsSet, replacement, opts);

        return {
            objectsClear,
            objectsSet,
            movementsClear,
            movementsSet
        };
    }

    function applyRandomEntityMask(objectsSet, objectsClear, movementsClear, replacement, options) {
        const randomEntityMask = maskDataOf(replacement.randomEntityMask);
        if (isZeroMask(randomEntityMask))
            return;

        const choices = maskBitIndices(randomEntityMask, options.strideObj || randomEntityMask.length);
        if (choices.length === 0)
            return;

        const uniform = options.uniform || Math.random;
        const objectId = choices[Math.floor(uniform() * choices.length)];
        const layer = objectLayerForId(objectId, options);
        if (layer === undefined)
            throw new Error(`Random entity replacement missing layer for object ${objectId}.`);

        bitSet(objectsSet, objectId);
        orMask(objectsClear, maskDataOf((options.layerMasks || [])[layer]));
        shiftOr(movementsClear, options.movementMask, (options.movementBits || 0) * layer);
    }

    function applyRandomDirMask(movementsSet, replacement, options) {
        const randomDirMask = maskDataOf(replacement.randomDirMask);
        if (isZeroMask(randomDirMask))
            return;

        const movementBits = options.movementBits || 0;
        const directionBitIndexes = options.directionBitIndexes || null;
        const directionCount = directionBitIndexes ? directionBitIndexes.length : options.directionCount || 4;
        const layerCount = options.layerCount || Math.floor((randomDirMask.length * 32) / movementBits);
        const uniform = options.uniform || Math.random;

        for (let layer = 0; layer < layerCount; layer++) {
            if (randomDirMaskHasLayer(randomDirMask, movementBits * layer)) {
                const randomDir = Math.floor(uniform() * directionCount);
                const bitIndex = directionBitIndexes ? directionBitIndexes[randomDir] : randomDir;
                bitSet(movementsSet, bitIndex + movementBits * layer);
            }
        }
    }

    function applyRigidReplacementMasks(currentGroupMask, currentAppliedMask, replacement, options) {
        const opts = options || {};
        if (!opts.isRigid)
            return {
                changed: false,
                groupMask: currentGroupMask,
                appliedMask: currentAppliedMask
            };

        const movementBits = opts.movementBits || 0;
        const layerCount = opts.layerCount || 0;
        const rigidGroupIndex = (opts.rigidGroupIndex || 0) + 1;
        const movementsLayerMask = maskDataOf(replacement.movementsLayerMask);
        const groupMask = currentGroupMask ? cloneMaskData(currentGroupMask) : new Int32Array(opts.strideMov || movementsLayerMask.length);
        const appliedMask = currentAppliedMask ? cloneMaskData(currentAppliedMask) : new Int32Array(opts.strideMov || movementsLayerMask.length);
        const rigidMask = new Int32Array(groupMask.length);

        for (let layer = 0; layer < layerCount; layer++)
            shiftOr(rigidMask, rigidGroupIndex, movementBits * layer);
        andMask(rigidMask, movementsLayerMask);

        if (!bitsSetInArray(rigidMask, groupMask)
            && !bitsSetInArray(movementsLayerMask, appliedMask)) {
            orMask(groupMask, rigidMask);
            orMask(appliedMask, movementsLayerMask);
            return {
                changed: true,
                groupMask,
                appliedMask
            };
        }

        return {
            changed: false,
            groupMask,
            appliedMask
        };
    }

    function findRigidMovementFailure(movement, rigidAppliedMask, rigidGroupMask, options) {
        const opts = options || {};
        const movementData = cloneMaskData(movement);
        const appliedData = maskDataOf(rigidAppliedMask);
        const groupData = maskDataOf(rigidGroupMask);
        if (isZeroMask(appliedData))
            return null;

        andMask(movementData, appliedData);
        if (isZeroMask(movementData))
            return null;

        const movementBits = opts.movementBits || 0;
        const movementMask = opts.movementMask || 0;
        const layerCount = opts.layerCount || 0;
        const rigidGroupIndexToGroupIndex = opts.rigidGroupIndexToGroupIndex || [];

        for (let layer = 0; layer < layerCount; layer++) {
            const layerMovement = getShiftedMask(movementData, movementMask, movementBits * layer);
            if (layerMovement === 0)
                continue;

            const storedRigidGroupIndex = getShiftedMask(groupData, movementMask, movementBits * layer);
            const rigidGroupIndex = storedRigidGroupIndex - 1;
            return {
                layer,
                layerMovement,
                rigidGroupIndex,
                groupIndex: rigidGroupIndexToGroupIndex[rigidGroupIndex]
            };
        }

        return null;
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

    function anyBitsInCommon(mask, cellData) {
        return !bitsClearInArray(mask, cellData);
    }

    function bitsSetAt(mask, data, offset, length) {
        for (let i = 0; i < length; i++) {
            const maskWord = mask[i] || 0;
            if ((maskWord & data[offset + i]) !== maskWord)
                return false;
        }
        return true;
    }

    function bitsClearAt(mask, data, offset, length) {
        for (let i = 0; i < length; i++) {
            if ((mask[i] || 0) & data[offset + i])
                return false;
        }
        return true;
    }

    function anyBitsAt(mask, data, offset, length) {
        return !bitsClearAt(mask, data, offset, length);
    }

    function cloneMaskData(mask) {
        return new Int32Array(maskDataOf(mask));
    }

    function isZeroMask(mask) {
        for (let i = 0; i < mask.length; i++) {
            if (mask[i])
                return false;
        }
        return true;
    }

    function maskBitIndices(mask, stride) {
        const choices = [];
        for (let bit = 0; bit < 32 * stride; bit++) {
            if (mask[bit >> 5] & (1 << (bit & 31)))
                choices.push(bit);
        }
        return choices;
    }

    function objectLayerForId(objectId, options) {
        if (options.objectLayers)
            return options.objectLayers[objectId];
        if (options.idDict && options.objects) {
            const objectName = options.idDict[objectId];
            const object = options.objects[objectName];
            return object && object.layer;
        }
        return undefined;
    }

    function bitSet(target, bit) {
        target[bit >> 5] |= 1 << (bit & 31);
    }

    function randomDirMaskHasLayer(mask, shift) {
        return !!(mask[shift >> 5] & (1 << (shift & 31)));
    }

    function shiftOr(target, mask, shift) {
        const toshift = shift & 31;
        const word = shift >> 5;
        target[word] |= mask << toshift;
        if (toshift)
            target[word + 1] |= mask >> (32 - toshift);
    }

    function getShiftedMask(data, mask, shift) {
        const toshift = shift & 31;
        let result = data[shift >> 5] >>> toshift;
        if (toshift)
            result |= data[(shift >> 5) + 1] << (32 - toshift);
        return result & mask;
    }

    function clearMask(target, mask) {
        for (let i = 0; i < target.length; i++)
            target[i] &= ~(mask[i] || 0);
    }

    function andMask(target, mask) {
        for (let i = 0; i < target.length; i++)
            target[i] &= mask[i] || 0;
    }

    function orMask(target, mask) {
        for (let i = 0; i < target.length; i++)
            target[i] |= mask[i] || 0;
    }

    function sameMask(left, right) {
        if (left.length !== right.length)
            return false;
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i])
                return false;
        }
        return true;
    }

    function cellDataOf(cell) {
        if (!cell)
            throw new Error("Cell mask matching requires a cell.");
        return cell.data || cell;
    }

    function maskDataOf(mask) {
        if (!mask)
            return [];
        return mask.data || mask;
    }

    function movementDataOf(movements) {
        if (!movements)
            return [];
        return movements.data || movements;
    }

    function dataLengthOf(mask) {
        return maskDataOf(mask).length;
    }

    function bitMask(strideObj, bits) {
        const data = new Int32Array(strideObj);
        for (const bit of bits || []) {
            const word = bit >> 5;
            const shift = bit & 31;
            data[word] |= 1 << shift;
        }
        return data;
    }

    const CellMasks = {
        matchesCell,
        matchesCellAt,
        matchesCellData,
        matchesCellDataAt,
        applyCellReplacementMasks,
        applyRigidReplacementMasks,
        findRigidMovementFailure,
        prepareCellReplacementMasks,
        bitsSetInArray,
        bitsClearInArray,
        anyBitsInCommon,
        clearMask,
        andMask,
        orMask,
        sameMask,
        bitMask
    };

    root.CellMasks = CellMasks;
    if (typeof module !== "undefined" && module.exports)
        module.exports = CellMasks;
})(typeof window !== "undefined" ? window : this);
