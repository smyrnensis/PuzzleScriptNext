(function(root) {
    "use strict";

    const ruleFramesApi = getRuleFramesApi();
    const cellMasksApi = getCellMasksApi();
    const sfxArtifactsApi = getSfxArtifactsApi();
    const movementResolutionApi = getMovementResolutionApi();

    function createRuntime3D(slots, options) {
        if (!slots || !slots.core || !slots.core.board)
            throw new Error("3D runtime requires core board slots.");

        const board = createBoard(slots.core.board, options);

        return {
            slots,
            board,
            input: slots.input,
            frame: slots.core.frame,
            directions: slots.core.directions,
            rules: slots.core.rules,
            clone() {
                const clonedSlots = cloneSlotsWithBoard(slots, board.cloneSource());
                return createRuntime3D(clonedSlots, options);
            }
        };
    }

    function createBoard(boardSlot, options) {
        const opts = options || {};
        const width = boardSlot.width;
        const height = boardSlot.height;
        const depth = boardSlot.depth;
        const cellCount = boardSlot.cellCount || width * height * depth;
        const sourceCells = boardSlot.cells || boardSlot.objects;
        const strideObj = boardSlot.strideObj || inferStrideObj(sourceCells, cellCount);
        const layerCount = boardSlot.layerCount || 0;
        const movementBits = boardSlot.movementBits || boardSlot.MOV_BITS || 7;
        const movementMask = boardSlot.movementMask || boardSlot.MOV_MASK || ((1 << movementBits) - 1);
        const strideMov = boardSlot.strideMov || boardSlot.STRIDE_MOV || Math.ceil(layerCount * movementBits / 32);
        const sourceMovements = boardSlot.movements || new Int32Array(cellCount * strideMov);
        const cells = opts.shareCells ? sourceCells : new Int32Array(sourceCells);
        const movements = opts.shareMovements ? sourceMovements : new Int32Array(sourceMovements);
        const sourceRigidGroupIndexMasks = boardSlot.rigidGroupIndexMasks || new Int32Array(cellCount * strideMov);
        const sourceRigidMovementAppliedMasks = boardSlot.rigidMovementAppliedMasks || new Int32Array(cellCount * strideMov);
        const rigidGroupIndexMasks = opts.shareRigidMasks ? sourceRigidGroupIndexMasks : new Int32Array(sourceRigidGroupIndexMasks);
        const rigidMovementAppliedMasks = opts.shareRigidMasks ? sourceRigidMovementAppliedMasks : new Int32Array(sourceRigidMovementAppliedMasks);
        const deltas = Object.assign({ action: [0, 0, 0] }, boardSlot.deltas || ruleFramesApi.DIRECTIONS);
        const directionBits = Object.assign({}, defaultDirectionBits(), boardSlot.directionBits || {});
        const directionsByBit = invertDirectionBits(directionBits);
        const layerMasks = cloneMasks(boardSlot.layerMasks || []);
        const objectLayers = (boardSlot.objectLayers || []).slice();
        const objectCount = boardSlot.objectCount || strideObj * 32;
        const sfxCreationMasks = cloneEntries(boardSlot.sfxCreationMasks || []);
        const sfxDestructionMasks = cloneEntries(boardSlot.sfxDestructionMasks || []);
        const sfxMovementMasks = cloneNestedEntries(boardSlot.sfxMovementMasks || []);
        const sfxMovementFailureMasks = cloneEntries(boardSlot.sfxMovementFailureMasks || []);
        const sfxCreateMask = boardSlot.sfxCreateMask ? new Int32Array(boardSlot.sfxCreateMask) : new Int32Array(strideObj);
        const sfxDestroyMask = boardSlot.sfxDestroyMask ? new Int32Array(boardSlot.sfxDestroyMask) : new Int32Array(strideObj);
        const sfxCreateList = boardSlot.sfxCreateList ? cloneEntries(boardSlot.sfxCreateList) : [];
        const sfxDestroyList = boardSlot.sfxDestroyList ? cloneEntries(boardSlot.sfxDestroyList) : [];
        const sfxCanMoveSeeds = boardSlot.sfxCanMoveSeeds ? boardSlot.sfxCanMoveSeeds.slice() : [];
        const sfxCantMoveSeeds = boardSlot.sfxCantMoveSeeds ? boardSlot.sfxCantMoveSeeds.slice() : [];
        const sfxAnimations = boardSlot.sfxAnimations ? cloneAnimationMap(boardSlot.sfxAnimations) : {};
        const movementTween = Object.assign({ enabled: false }, boardSlot.movementTween || {});
        const movedEntities = cloneMovedEntities(boardSlot.movedEntities || {});
        const rigidGroupIndexToGroupIndex = (boardSlot.rigidGroupIndexToGroupIndex || []).slice();
        const groupNumberToRigidGroupIndex = Object.assign({}, boardSlot.groupNumberToRigidGroupIndex || {});
        const playerMask = boardSlot.playerMask ? new Int32Array(boardSlot.playerMask.data || boardSlot.playerMask) : null;

        validateBoardShape(width, height, depth, cellCount, strideObj, cells);
        validateMovementShape(cellCount, layerCount, strideMov, movementBits, movementMask, movements);
        validateLayerMasks(layerMasks, layerCount, strideObj);
        const movementBoard = boardApi();
        const movementHooks = buildMovementResolutionHooks3D(movementBoard);

        return {
            width,
            height,
            depth,
            cellCount,
            layerCount,
            strideObj,
            strideMov,
            movementBits,
            movementMask,
            directionBits,
            cells,
            movements,
            rigidGroupIndexMasks,
            rigidMovementAppliedMasks,
            layerMasks,
            objectLayers,
            objectCount,
            sfxCreationMasks,
            sfxDestructionMasks,
            sfxMovementMasks,
            sfxMovementFailureMasks,
            sfxCreateMask,
            sfxDestroyMask,
            sfxCreateList,
            sfxDestroyList,
            sfxCanMoveSeeds,
            sfxCantMoveSeeds,
            sfxAnimations,
            movementTween,
            movedEntities,
            rigidGroupIndexToGroupIndex,
            groupNumberToRigidGroupIndex,
            playerMask,
            background: boardSlot.background,
            coordToIndex,
            indexToCoord,
            containsCoord,
            neighbor,
            getCell,
            getCellInto,
            setCell,
            getMovements,
            getMovementsInto,
            setMovements,
            getRigidGroupIndexMask,
            setRigidGroupIndexMask,
            getRigidMovementAppliedMask,
            setRigidMovementAppliedMask,
            recordCellReplacementSfx,
            resetSfxState,
            moveEntitiesAtIndex,
            startMovement,
            resolveMovements,
            clone,
            cloneSource
        };

        function coordToIndex(x, y, z) {
            if (typeof x === "object") {
                z = x.z;
                y = x.y;
                x = x.x;
            }
            return x * height * depth + y * depth + z;
        }

        function indexToCoord(index) {
            validateIndex(index);
            const yz = height * depth;
            const x = Math.floor(index / yz);
            const rest = index - x * yz;
            const y = Math.floor(rest / depth);
            const z = rest - y * depth;
            return { x, y, z };
        }

        function containsCoord(x, y, z) {
            if (typeof x === "object") {
                z = x.z;
                y = x.y;
                x = x.x;
            }
            return Number.isInteger(x)
                && Number.isInteger(y)
                && Number.isInteger(z)
                && x >= 0
                && y >= 0
                && z >= 0
                && x < width
                && y < height
                && z < depth;
        }

        function neighbor(index, direction) {
            const coord = indexToCoord(index);
            const delta = resolveDirectionDelta(direction, deltas);
            const next = {
                x: coord.x + delta[0],
                y: coord.y + delta[1],
                z: coord.z + delta[2]
            };

            if (!containsCoord(next))
                return null;
            return coordToIndex(next);
        }

        function getCell(index) {
            validateIndex(index);
            const start = index * strideObj;
            return new Int32Array(cells.subarray(start, start + strideObj));
        }

        function getCellInto(index, target) {
            validateIndex(index);
            if (!target)
                throw new Error("3D getCellInto requires a target cell.");

            const targetData = target.data || target;
            if (targetData.length < strideObj)
                throw new Error("3D getCellInto target is smaller than strideObj.");

            const start = index * strideObj;
            for (let i = 0; i < strideObj; i++)
                targetData[i] = cells[start + i];
            return target;
        }

        function setCell(index, cell) {
            validateIndex(index);
            if (!cell)
                throw new Error("3D setCell requires a source cell.");

            const source = cell.data || cell;
            if (source.length < strideObj)
                throw new Error("3D setCell source is smaller than strideObj.");

            const start = index * strideObj;
            for (let i = 0; i < strideObj; i++)
                cells[start + i] = source[i];
        }

        function getMovements(index) {
            validateIndex(index);
            const start = index * strideMov;
            return new Int32Array(movements.subarray(start, start + strideMov));
        }

        function getMovementsInto(index, target) {
            validateIndex(index);
            if (!target)
                throw new Error("3D getMovementsInto requires a target movement mask.");

            const targetData = target.data || target;
            if (targetData.length < strideMov)
                throw new Error("3D getMovementsInto target is smaller than strideMov.");

            const start = index * strideMov;
            for (let i = 0; i < strideMov; i++)
                targetData[i] = movements[start + i];
            return target;
        }

        function setMovements(index, movement) {
            validateIndex(index);
            if (!movement)
                throw new Error("3D setMovements requires a source movement mask.");

            const source = movement.data || movement;
            if (source.length < strideMov)
                throw new Error("3D setMovements source is smaller than strideMov.");

            const start = index * strideMov;
            for (let i = 0; i < strideMov; i++)
                movements[start + i] = source[i];
        }

        function getRigidGroupIndexMask(index) {
            validateIndex(index);
            const start = index * strideMov;
            return new Int32Array(rigidGroupIndexMasks.subarray(start, start + strideMov));
        }

        function setRigidGroupIndexMask(index, mask) {
            validateIndex(index);
            rigidGroupIndexMasks.set(maskDataOf(mask), index * strideMov);
        }

        function getRigidMovementAppliedMask(index) {
            validateIndex(index);
            const start = index * strideMov;
            return new Int32Array(rigidMovementAppliedMasks.subarray(start, start + strideMov));
        }

        function setRigidMovementAppliedMask(index, mask) {
            validateIndex(index);
            rigidMovementAppliedMasks.set(maskDataOf(mask), index * strideMov);
        }

        function recordCellReplacementSfx(index, oldCell, newCell) {
            const created = andNotMasks(maskDataOf(newCell), maskDataOf(oldCell));
            const destroyed = andNotMasks(maskDataOf(oldCell), maskDataOf(newCell));
            orMask(sfxCreateMask, created);
            orMask(sfxDestroyMask, destroyed);

            for (let objId = 0; objId < objectCount; objId++) {
                if (bitIsSet(created, objId))
                    sfxCreateList.push({ posIndex: index, objId });
                if (bitIsSet(destroyed, objId))
                    sfxDestroyList.push({ posIndex: index, objId });
            }
        }

        function resetSfxState() {
            sfxCreateMask.fill(0);
            sfxDestroyMask.fill(0);
            sfxCreateList.length = 0;
            sfxDestroyList.length = 0;
            sfxCanMoveSeeds.length = 0;
            sfxCantMoveSeeds.length = 0;
            for (const key of Object.keys(sfxAnimations))
                delete sfxAnimations[key];
        }

        function moveEntitiesAtIndex(index, entityMask, direction) {
            validateIndex(index);
            const directionMask = resolveDirectionMask(direction, directionBits);
            const cell = getCell(index);
            const entity = maskDataOf(entityMask);
            const layers = layersOfMask(andMasks(cell, entity), objectLayers, layerMasks);

            if (layers.length === 0)
                return false;

            const movement = getMovements(index);
            for (const layer of layers)
                shiftOrMovement(movement, directionMask, movementBits * layer);
            setMovements(index, movement);
            return true;
        }

        function startMovement(entityMask, direction) {
            const positions = [];
            for (let index = 0; index < cellCount; index++) {
                if (anyBitsInCommon(getCell(index), maskDataOf(entityMask))) {
                    moveEntitiesAtIndex(index, entityMask, direction);
                    positions.push(index);
                }
            }
            return positions;
        }

        function resolveMovements() {
            return movementResolutionApi.resolveMovements(movementBoard, movementHooks);
        }

        function repositionEntitiesAtCell(index) {
            return movementResolutionApi.repositionEntitiesAtCell(movementBoard, index, movementHooks);
        }

        function repositionEntitiesOnLayer(index, layer, layerMovement) {
            return movementResolutionApi.repositionEntitiesOnLayer(movementBoard, index, layer, layerMovement, movementHooks);
        }

        function findRigidFailures() {
            return movementResolutionApi.findRigidFailures(movementBoard, movementHooks);
        }

        function boardApi() {
            return {
                cellCount,
                layerCount
            };
        }

        function buildMovementResolutionHooks3D(board) {
            return {
                cellCount: function() {
                    return cellCount;
                },
                layerCount: function() {
                    return layerCount;
                },
                getMovements: function(_board, index) {
                    return getMovements(index);
                },
                setMovements: function(_board, index, movement) {
                    setMovements(index, movement);
                },
                isZeroMask,
                layerMovement: function(_board, movement, layer) {
                    return getShiftedMovement(movement, movementMask, movementBits * layer);
                },
                clearLayerMovement: function(_board, movement, layerMovement, layer) {
                    shiftClearMovement(movement, layerMovement, movementBits * layer);
                },
                repositionEntitiesAtCell: function(_board, index) {
                    return movementResolutionApi.repositionEntitiesAtCell(board, index, movementHooks);
                },
                repositionEntitiesOnLayer: function(_board, index, layer, layerMovement) {
                    return movementResolutionApi.repositionEntitiesOnLayer(board, index, layer, layerMovement, movementHooks);
                },
                directionForLayerMovement: function(_board, layerMovement) {
                    return directionForMask(layerMovement, directionsByBit);
                },
                targetIndex: function(_board, index, direction) {
                    return neighbor(index, direction);
                },
                ignoresLayerCollision: function(_board, layerMovement) {
                    return layerMovement === directionBits.action;
                },
                layerMask: function(_board, layer) {
                    return layerMasks[layer];
                },
                getCell: function(_board, index) {
                    return getCell(index);
                },
                setCell: function(_board, index, cell) {
                    setCell(index, cell);
                },
                anyBitsInCommon,
                movingEntitiesOnLayer: function(_board, source, layerMask) {
                    return andMasks(source, layerMask);
                },
                clearLayerEntities: function(_board, source, layerMask) {
                    clearMask(source, layerMask);
                },
                addEntities: function(_board, target, moving) {
                    orMask(target, moving);
                },
                recordMovementSfx: function(_board, index, targetIndex, layer, source) {
                    recordMovementSfx(index, targetIndex, layer, source, getMovements(index));
                },
                resetMovedEntities: function() {
                    clearObject(movedEntities);
                },
                recordMovedEntity: function(_board, _index, targetIndex, layer, layerMovement) {
                    recordMovedEntity(targetIndex, layer, layerMovement);
                },
                getMovedEntities: function() {
                    return cloneMovedEntities(movedEntities);
                },
                recordCantMoveSfx: function(_board, index, movement) {
                    recordCantMoveSfx(index, getCell(index), movement);
                },
                findRigidFailures: function(_board) {
                    return movementResolutionApi.findRigidFailures(board, movementHooks);
                },
                findRigidFailure: function(_board, index, movement) {
                    return cellMasksApi.findRigidMovementFailure(
                        movement,
                        getRigidMovementAppliedMask(index),
                        getRigidGroupIndexMask(index),
                        {
                            layerCount,
                            movementBits,
                            movementMask,
                            rigidGroupIndexToGroupIndex
                        }
                    );
                },
                clearAllMovementsAndRigidMasks
            };
        }

        function recordMovementSfx(index, targetIndex, layer, source, movement) {
            return sfxArtifactsApi.recordMovementSfx({
                entries: sfxMovementMasks[layer] || [],
                sourceMask: source,
                movementMask: movement,
                canMoveSeeds: sfxCanMoveSeeds,
                animations: sfxAnimations,
                movementMaskValue: movementMask,
                movementBits,
                objectLayers,
                animationPosition: function() {
                    return targetIndex;
                }
            });
        }

        function recordMovedEntity(targetIndex, layer, layerMovement) {
            if (!movementTween.enabled)
                return;
            movedEntities["p" + targetIndex + "-l" + layer] = layerMovement;
        }

        function recordCantMoveSfx(index, cell, movement) {
            return sfxArtifactsApi.recordCantMoveSfx({
                entries: sfxMovementFailureMasks,
                cellMask: cell,
                movementMask: movement,
                cantMoveSeeds: sfxCantMoveSeeds,
                animations: sfxAnimations,
                positionIndex: index,
                movementMaskValue: movementMask,
                movementBits,
                objectLayers
            });
        }

        function clearAllMovementsAndRigidMasks() {
            movements.fill(0);
            rigidGroupIndexMasks.fill(0);
            rigidMovementAppliedMasks.fill(0);
        }

        function clone() {
            return createBoard(cloneSource(), { shareCells: true, shareMovements: true, shareRigidMasks: true });
        }

        function cloneSource() {
            return {
                width,
                height,
                depth,
                cellCount,
                layerCount,
                strideObj,
                strideMov,
                movementBits,
                movementMask,
                directionBits,
                cells: new Int32Array(cells),
                movements: new Int32Array(movements),
                rigidGroupIndexMasks: new Int32Array(rigidGroupIndexMasks),
                rigidMovementAppliedMasks: new Int32Array(rigidMovementAppliedMasks),
                layerMasks: cloneMasks(layerMasks),
                objectLayers: objectLayers.slice(),
                objectCount,
                sfxCreationMasks: cloneEntries(sfxCreationMasks),
                sfxDestructionMasks: cloneEntries(sfxDestructionMasks),
                sfxMovementMasks: cloneNestedEntries(sfxMovementMasks),
                sfxMovementFailureMasks: cloneEntries(sfxMovementFailureMasks),
                sfxCreateMask: new Int32Array(sfxCreateMask),
                sfxDestroyMask: new Int32Array(sfxDestroyMask),
                sfxCreateList: cloneEntries(sfxCreateList),
                sfxDestroyList: cloneEntries(sfxDestroyList),
                sfxCanMoveSeeds: sfxCanMoveSeeds.slice(),
                sfxCantMoveSeeds: sfxCantMoveSeeds.slice(),
                sfxAnimations: cloneAnimationMap(sfxAnimations),
                movementTween: Object.assign({}, movementTween),
                movedEntities: cloneMovedEntities(movedEntities),
                rigidGroupIndexToGroupIndex: rigidGroupIndexToGroupIndex.slice(),
                groupNumberToRigidGroupIndex: Object.assign({}, groupNumberToRigidGroupIndex),
                playerMask: playerMask ? new Int32Array(playerMask) : null,
                background: boardSlot.background
            };
        }

        function validateIndex(index) {
            if (!Number.isInteger(index) || index < 0 || index >= cellCount)
                throw new Error(`3D board index out of bounds: ${index}`);
        }
    }

    function cloneSlotsWithBoard(slots, boardSlot) {
        return Object.assign({}, slots, {
            core: Object.assign({}, slots.core, {
                board: boardSlot
            })
        });
    }

    function resolveDirectionDelta(direction, deltas) {
        if (Array.isArray(direction))
            return direction;
        if (deltas && deltas[direction])
            return deltas[direction];
        throw new Error(`Unknown 3D direction: ${direction}`);
    }

    function defaultDirectionBits() {
        return {
            up: 1,
            down: 2,
            left: 4,
            right: 8,
            action: 16,
            front: 32,
            back: 64
        };
    }

    function invertDirectionBits(directionBits) {
        const result = {};
        for (const name of Object.keys(directionBits))
            result[directionBits[name]] = name;
        return result;
    }

    function resolveDirectionMask(direction, directionBits) {
        if (typeof direction === "number")
            return direction;
        if (directionBits && directionBits[direction])
            return directionBits[direction];
        throw new Error(`Unknown 3D movement direction: ${direction}`);
    }

    function inferStrideObj(cells, cellCount) {
        if (!cells || !cellCount)
            throw new Error("3D board requires cells and cellCount.");
        return Math.floor(cells.length / cellCount);
    }

    function validateBoardShape(width, height, depth, cellCount, strideObj, cells) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(depth))
            throw new Error("3D board dimensions must be integers.");
        if (width <= 0 || height <= 0 || depth <= 0)
            throw new Error("3D board dimensions must be positive.");
        if (cellCount !== width * height * depth)
            throw new Error("3D board cellCount does not match dimensions.");
        if (!Number.isInteger(strideObj) || strideObj <= 0)
            throw new Error("3D board strideObj must be positive.");
        if (!cells || cells.length !== cellCount * strideObj)
            throw new Error("3D board cells length does not match cellCount * strideObj.");
    }

    function validateMovementShape(cellCount, layerCount, strideMov, movementBits, movementMask, movements) {
        if (!Number.isInteger(layerCount) || layerCount < 0)
            throw new Error("3D board layerCount must be a non-negative integer.");
        if (!Number.isInteger(movementBits) || movementBits <= 0 || movementBits > 30)
            throw new Error("3D board movementBits must be a positive integer.");
        if (!Number.isInteger(movementMask) || movementMask <= 0)
            throw new Error("3D board movementMask must be positive.");
        if (!Number.isInteger(strideMov) || strideMov < Math.ceil(layerCount * movementBits / 32))
            throw new Error("3D board strideMov is too small for layer movement masks.");
        if (!movements || movements.length !== cellCount * strideMov)
            throw new Error("3D board movements length does not match cellCount * strideMov.");
    }

    function validateLayerMasks(layerMasks, layerCount, strideObj) {
        if (layerMasks.length === 0)
            return;
        if (layerMasks.length !== layerCount)
            throw new Error("3D board layerMasks length does not match layerCount.");
        for (const mask of layerMasks) {
            if (!mask || mask.length < strideObj)
                throw new Error("3D board layer mask is smaller than strideObj.");
        }
    }

    function maskDataOf(mask) {
        if (!mask)
            return [];
        return mask.data || mask;
    }

    function andMasks(left, right) {
        const result = new Int32Array(left.length);
        for (let i = 0; i < left.length; i++)
            result[i] = left[i] & (right[i] || 0);
        return result;
    }

    function andNotMasks(left, right) {
        const result = new Int32Array(left.length);
        for (let i = 0; i < left.length; i++)
            result[i] = left[i] & ~(right[i] || 0);
        return result;
    }

    function bitIsSet(mask, bit) {
        const word = bit >> 5;
        const shift = bit & 31;
        return !!(mask[word] & (1 << shift));
    }

    function orMask(target, source) {
        for (let i = 0; i < target.length; i++)
            target[i] |= source[i] || 0;
    }

    function clearMask(target, mask) {
        for (let i = 0; i < target.length; i++)
            target[i] &= ~(mask[i] || 0);
    }

    function anyBitsInCommon(left, right) {
        for (let i = 0; i < left.length; i++) {
            if (left[i] & (right[i] || 0))
                return true;
        }
        return false;
    }

    function isZeroMask(mask) {
        for (let i = 0; i < mask.length; i++) {
            if (mask[i])
                return false;
        }
        return true;
    }

    function layersOfMask(mask, objectLayers, layerMasks) {
        const result = [];
        for (let bit = 0; bit < mask.length * 32; bit++) {
            const word = bit >> 5;
            const shift = bit & 31;
            if (!(mask[word] & (1 << shift)))
                continue;

            const layer = objectLayers[bit];
            if (layer != null && result.indexOf(layer) === -1)
                result.push(layer);
        }

        if (result.length > 0)
            return result;

        for (let layer = 0; layer < layerMasks.length; layer++) {
            if (anyBitsInCommon(mask, layerMasks[layer]))
                result.push(layer);
        }
        return result;
    }

    function shiftOrMovement(target, mask, shift) {
        const word = shift >> 5;
        const offset = shift & 31;
        target[word] |= mask << offset;
        if (offset && word + 1 < target.length)
            target[word + 1] |= mask >>> (32 - offset);
    }

    function shiftClearMovement(target, mask, shift) {
        const word = shift >> 5;
        const offset = shift & 31;
        target[word] &= ~(mask << offset);
        if (offset && word + 1 < target.length)
            target[word + 1] &= ~(mask >>> (32 - offset));
    }

    function getShiftedMovement(source, mask, shift) {
        const word = shift >> 5;
        const offset = shift & 31;
        let value = source[word] >>> offset;
        if (offset && word + 1 < source.length)
            value |= source[word + 1] << (32 - offset);
        return value & mask;
    }

    function directionForMask(mask, directionsByBit) {
        if (directionsByBit[mask])
            return directionsByBit[mask];

        for (const bit of Object.keys(directionsByBit)) {
            const bitValue = Number(bit);
            if (mask & bitValue)
                return directionsByBit[bitValue];
        }
        return null;
    }

    function cloneMasks(masks) {
        return (masks || []).map(mask => new Int32Array(mask.data || mask));
    }

    function cloneEntries(entries) {
        return (entries || []).map(entry => Object.assign({}, entry));
    }

    function cloneNestedEntries(entries) {
        return (entries || []).map(group => cloneEntries(group));
    }

    function cloneAnimationMap(source) {
        const result = {};
        for (const key of Object.keys(source || {}))
            result[key] = Object.assign({}, source[key]);
        return result;
    }

    function cloneMovedEntities(source) {
        const result = {};
        for (const key of Object.keys(source || {}))
            result[key] = source[key];
        return result;
    }

    function clearObject(object) {
        for (const key of Object.keys(object || {}))
            delete object[key];
    }

    function getRuleFramesApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_frames3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleFrames3D;
    }

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

    function getSfxArtifactsApi() {
        if (typeof require === "function") {
            try {
                return require("./sfx_artifacts.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.SfxArtifacts;
    }

    function getMovementResolutionApi() {
        if (typeof require === "function") {
            try {
                return require("./movement_resolution.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.MovementResolution;
    }

    const Runtime3D = {
        createRuntime3D,
        createBoard
    };

    root.Runtime3D = Runtime3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = Runtime3D;
})(typeof window !== "undefined" ? window : this);
