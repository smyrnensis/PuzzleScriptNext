(function(root, factory) {
    const api = factory(root);
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
    root.Compiler3D = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(root) {
    const directionBits3d = {
        up: 1,
        down: 2,
        left: 4,
        right: 8,
        action: 16,
        front: 32,
        back: 64,
        randomdir: 1,
        "^": 32,
        "v": 64,
        "<": 4,
        ">": 8,
        o: 1,
        x: 2,
        moving: 127,
        stationary: 0,
        "": 0
    };

    const directionDeltas3d = {
        left: { x: -1, y: 0, z: 0 },
        right: { x: 1, y: 0, z: 0 },
        front: { x: 0, y: 0, z: -1 },
        back: { x: 0, y: 0, z: 1 },
        up: { x: 0, y: -1, z: 0 },
        down: { x: 0, y: 1, z: 0 },
        action: { x: 0, y: 0, z: 0 }
    };

    function requireDep(deps, key) {
        if (deps && deps[key])
            return deps[key];
        throw new Error("Compiler3D requires dependency: " + key);
    }

    function lowerThreeDimensionLevels(state, deps) {
        const rawLevels = state.threeDimensionLevels || [];
        const threeDimensionLevels = getThreeDimensionLevelApi();
        const isThreeDimensionsEnabled = requireDep(deps, "isThreeDimensionsEnabled");
        const levelEntriesToArray = requireDep(deps, "levelEntriesToArray");
        const logErrorNoLine = requireDep(deps, "logErrorNoLine");

        if (rawLevels.length > 0 && rawLevels.at(-1).length == 0)
            rawLevels.pop();

        if (rawLevels.length == 0) {
            delete state.threeDimensionLevels;
            if (isThreeDimensionsEnabled(state))
                state.levels = [];
            return;
        }

        if (!threeDimensionLevels) {
            logErrorNoLine("3D level support is not loaded.");
            delete state.threeDimensionLevels;
            if (isThreeDimensionsEnabled(state))
                state.levels = [];
            return;
        }

        const result = levelEntriesToArray(state, rawLevels, rawLevel => {
            return levelFromThreeDimensionRawLevel(state, rawLevel, deps, threeDimensionLevels);
        });

        state.levels = result.levels;
        state.links = result.links;
        delete state.threeDimensionLevels;
    }

    function levelFromThreeDimensionRawLevel(state, rawLevel, deps, threeDimensionLevels) {
        const logError = requireDep(deps, "logError");
        const lineNumber = rawLevel[0];
        const lines = rawLevel.slice(2).map((text, index) => ({
            text,
            lineNumber: lineNumber + index
        }));
        const result = threeDimensionLevels.parseThreeDimensionLevel(lines);

        result.errors.forEach(error => {
            logError(`3D level ${error.code}: ${error.message}`, error.lineNumber || lineNumber);
        });
        if (result.errors.length == 0)
            return levelFromThreeDimensionParsedSource(state, result.level, deps);
        return result.level;
    }

    function levelFromThreeDimensionParsedSource(state, parsedLevel, deps) {
        const threeDimensionLevels = getThreeDimensionLevelApi();
        const BitVec = requireDep(deps, "BitVec");
        const logError = requireDep(deps, "logError");
        const strideObj = getStrideObj(state, deps);
        const width = parsedLevel.width;
        const height = parsedLevel.height;
        const depth = parsedLevel.depth;
        const cellCount = width * height * depth;
        const level = {
            is3d: true,
            lineNumber: parsedLevel.lineNumber,
            width,
            height,
            depth,
            n_tiles: cellCount,
            cellCount,
            layerCount: state.collisionLayers.length,
            objects: new Int32Array(cellCount * strideObj),
            slices: parsedLevel.slices,
            rowLineNumbers: parsedLevel.rowLineNumbers
        };

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                for (let z = 0; z < depth; z++) {
                    const row = parsedLevel.slices[y][z];
                    const ch = row.charAt(x);
                    const mask = state.glyphDict[ch];
                    const lineNumber = getLevel3RowLineNumber(parsedLevel, y, z);

                    if (mask == undefined) {
                        if (state.propertiesDict[ch] === undefined) {
                            logError('Error, symbol "' + ch + '", used in map, not found.', lineNumber);
                        } else {
                            logError('Error, symbol "' + ch + '" is defined using OR, and therefore ambiguous - it cannot be used in a map. Did you mean to define it in terms of AND?', lineNumber);
                        }
                        return level;
                    }

                    const index = threeDimensionLevels.coordToIndex3(x, y, z, { width, height, depth });
                    const maskint = glyphMaskToBitVec(mask, level.layerCount, strideObj, BitVec);
                    setLevel3Cell(level, index, maskint, strideObj);
                }
            }
        }

        applyLevel3Background(state, level, strideObj, BitVec);
        return level;
    }

    function getThreeDimensionLevelApi() {
        if (typeof root.ThreeDimensionLevels !== "undefined")
            return root.ThreeDimensionLevels;
        return null;
    }

    function getStrideObj(state, deps) {
        if (state.STRIDE_OBJ !== undefined)
            return state.STRIDE_OBJ;
        if (deps && typeof deps.getStrideObj === "function")
            return deps.getStrideObj(state);
        return deps && deps.STRIDE_OBJ || 1;
    }

    function getLevel3RowLineNumber(parsedLevel, y, z) {
        if (parsedLevel.rowLineNumbers && parsedLevel.rowLineNumbers[y])
            return parsedLevel.rowLineNumbers[y][z];
        return parsedLevel.lineNumber + z;
    }

    function glyphMaskToBitVec(mask, layerCount, strideObj, BitVec) {
        const maskint = new BitVec(strideObj);
        mask = mask.concat([]);
        for (let layer = 0; layer < layerCount; layer++) {
            if (mask[layer] >= 0)
                maskint.ibitset(mask[layer]);
        }
        return maskint;
    }

    function getLevel3Cell(level, index, strideObj, BitVec) {
        return new BitVec(level.objects.subarray(index * strideObj, index * strideObj + strideObj));
    }

    function setLevel3Cell(level, index, vec, strideObj) {
        for (let i = 0; i < vec.data.length; i++)
            level.objects[index * strideObj + i] = vec.data[i];
    }

    function applyLevel3Background(state, level, strideObj, BitVec) {
        const backgroundLayerMask = state.layerMasks[state.backgroundlayer];
        const levelBackgroundMask = calcLevel3BackgroundMask(state, level, strideObj, BitVec);

        for (let i = 0; i < level.cellCount; i++) {
            const cell = getLevel3Cell(level, i, strideObj, BitVec);
            if (!backgroundLayerMask.anyBitsInCommon(cell)) {
                cell.ior(levelBackgroundMask);
                setLevel3Cell(level, i, cell, strideObj);
            }
        }
    }

    function calcLevel3BackgroundMask(state, level, strideObj, BitVec) {
        const backgroundMask = state.layerMasks[state.backgroundlayer];

        for (let i = 0; i < level.cellCount; i++) {
            const cell = getLevel3Cell(level, i, strideObj, BitVec);
            cell.iand(backgroundMask);
            if (!cell.iszero())
                return cell;
        }

        const cell = new BitVec(strideObj);
        cell.ibitset(state.backgroundid);
        return cell;
    }

    function hasThreeDimensionLevels(state) {
        return !!(state
            && Array.isArray(state.levels)
            && state.levels.some(level => level && level.is3d));
    }

    function rulesToMask3D(state, rules, deps) {
        const lowered = {
            groups: [],
            lateGroups: [],
            winConditions: []
        };
        const sourceRules = rules || state.rules || [];

        for (const rule of sourceRules) {
            const loweredRule = lowerRule3D(state, rule, deps);
            if (loweredRule.late)
                lowered.lateGroups.push(loweredRule);
            else
                lowered.groups.push(loweredRule);
        }

        state.rules3d = lowered;
        return lowered;
    }

    function lowerCellPatternMasksShared(state, rule, cell, context, options, deps) {
        const opts = options || {};
        return requireDep(deps, "getRuleLoweringApi")().lowerCellPatternMasks(state, rule, cell, context, Object.assign({}, opts, {
            makeMask: size => new (requireDep(deps, "BitVec"))(size),
            cloneMask: function(source, size) {
                const BitVec = requireDep(deps, "BitVec");
                const clone = new BitVec(size);
                clone.ior(source);
                return clone;
            },
            onError: function(message, lineNumber) {
                requireDep(deps, "logError")(message, lineNumber);
            },
            onWarning: function(message, lineNumber) {
                requireDep(deps, "logWarning")(message, lineNumber);
            }
        }));
    }

    function lowerCellReplacementMasksShared(state, rule, lhsCell, rhsCell, lhs, options, deps) {
        const opts = options || {};
        return requireDep(deps, "getRuleLoweringApi")().lowerCellReplacementMasks(state, rule, lhsCell, rhsCell, lhs, Object.assign({}, opts, {
            makeMask: size => new (requireDep(deps, "BitVec"))(size),
            cloneMask: function(source, size) {
                const BitVec = requireDep(deps, "BitVec");
                const clone = new BitVec(size);
                clone.ior(source);
                return clone;
            },
            onError: function(message, lineNumber) {
                requireDep(deps, "logError")(message, lineNumber);
            },
            onWarning: function(message, lineNumber) {
                requireDep(deps, "logWarning")(message, lineNumber);
            }
        }));
    }

    function lowerRule3D(state, rule, deps) {
        const patterns = [];

        for (let rowIndex = 0; rowIndex < rule.lhs.length; rowIndex++) {
            patterns.push(lowerPatternRow3D(
                state,
                rule,
                rule.lhs[rowIndex],
                rule.rhs && rule.rhs[rowIndex],
                rule.direction,
                deps
            ));
        }

        return {
            lineNumber: rule.lineNumber,
            direction: rule.direction,
            groupNumber: rule.groupNumber,
            late: !!rule.late,
            rigid: !!rule.rigid,
            commands: rule.commands || [],
            randomRule: !!rule.randomRule,
            globalRule: !!rule.globalRule,
            isOnce: !!rule.isOnce,
            discard: rule.discard ? rule.discard.slice() : undefined,
            patterns
        };
    }

    function lowerPatternRow3D(state, rule, lhsRow, rhsRow, direction, deps) {
        const delta = ruleDirectionDelta3d(direction);
        const cells = [];
        let ellipsisCount = 0;

        for (let cellIndex = 0; cellIndex < lhsRow.length; cellIndex++) {
            const lhsLowering = lowerCellPattern3D(state, rule, lhsRow[cellIndex], {
                cellIndex,
                rowLength: lhsRow.length,
                rhsCell: rhsRow && rhsRow[cellIndex],
                hasRhs: !!(rhsRow && rhsRow.length > 0)
            }, deps);

            if (lhsLowering.ellipsis) {
                ellipsisCount++;
                if (ellipsisCount > 2)
                    requireDep(deps, "logError")("You can't use more than two ellipses in a single cell match pattern.", rule.lineNumber);
                if (cellIndex > 0 && lhsRow[cellIndex - 1] && lhsRow[cellIndex - 1][0] === "...")
                    requireDep(deps, "logWarning")("Why would you go and have two ellipses in a row like that? It's exactly the same as just having a single ellipsis, right?", rule.lineNumber);
                cells.push({
                    ellipsis: true,
                    rowIndex: cellIndex
                });
                continue;
            }

            const lhsPattern = lhsLowering.pattern;
            if (rhsRow && rhsRow[cellIndex])
                lhsPattern.replacement = lowerCellReplacement3D(state, rule, lhsRow[cellIndex], rhsRow[cellIndex], lhsLowering, deps);

            cells.push({
                offset: {
                    x: offsetComponent3d(delta.x, cellIndex),
                    y: offsetComponent3d(delta.y, cellIndex),
                    z: offsetComponent3d(delta.z, cellIndex)
                },
                rowIndex: cellIndex,
                pattern: lhsPattern
            });
        }

        return {
            frameExpansion: "none",
            ellipsisCount,
            cells
        };
    }

    function lowerCellPattern3D(state, rule, cell, context, deps) {
        const lowering = lowerCellPatternMasksShared(state, rule, cell, context, {
            strideObj: getStrideObj(state, deps),
            strideMov: getStrideMov3D(state),
            movementBits: movementBits3d(state),
            movementMask: movementMask3d(state),
            directionMask: directionMask3d
        }, deps);
        if (lowering.ellipsis)
            return lowering;
        const pattern = {
            objectsPresent: maskToInt32Array(lowering.objectsPresent),
            objectsMissing: maskToInt32Array(lowering.objectsMissing),
            anyObjectsPresent: lowering.anyObjectsPresent.map(maskToInt32Array),
            movementsPresent: maskToInt32Array(lowering.movementsPresent),
            movementsMissing: maskToInt32Array(lowering.movementsMissing),
            replacement: null
        };
        return {
            ellipsis: false,
            pattern,
            objectsPresent: lowering.objectsPresent,
            movementsPresent: lowering.movementsPresent,
            objectlayers_l: lowering.objectlayers_l,
            layersUsed_l: lowering.layersUsed_l
        };
    }

    function lowerCellReplacement3D(state, rule, lhsCell, rhsCell, lhsLowering, deps) {
        const masks = lowerCellReplacementMasksShared(state, rule, lhsCell, rhsCell, lhsLowering, {
            strideObj: getStrideObj(state, deps),
            strideMov: getStrideMov3D(state),
            movementBits: movementBits3d(state),
            movementMask: movementMask3d(state),
            directionMask: directionMask3d
        }, deps);
        if (masks === null)
            return null;
        return {
            objectsClear: maskToInt32Array(masks.objectsClear),
            objectsSet: maskToInt32Array(masks.objectsSet),
            movementsClear: maskToInt32Array(masks.movementsClear),
            movementsSet: maskToInt32Array(masks.movementsSet),
            movementsLayerMask: maskToInt32Array(masks.movementsLayerMask),
            randomEntityMask: maskToInt32Array(masks.randomEntityMask),
            randomDirMask: maskToInt32Array(masks.randomDirMask)
        };
    }

    function ruleDirectionDelta3d(direction) {
        if (directionDeltas3d[direction])
            return directionDeltas3d[direction];
        return { x: 0, y: 0, z: 0 };
    }

    function offsetComponent3d(delta, cellIndex) {
        const value = delta * cellIndex;
        return Object.is(value, -0) ? 0 : value;
    }

    function directionMask3d(direction) {
        return directionBits3d[direction] || 0;
    }

    function movementBits3d(state) {
        return state.MOV_BITS || 7;
    }

    function movementMask3d(state) {
        return state.MOV_MASK || ((1 << movementBits3d(state)) - 1);
    }

    function getStrideMov3D(state) {
        if (state.STRIDE_MOV !== undefined)
            return state.STRIDE_MOV;
        return Math.ceil(state.collisionLayers.length * movementBits3d(state) / 32);
    }

    function maskData(mask) {
        return mask && mask.data ? mask.data : mask;
    }

    function maskToInt32Array(mask) {
        const data = maskData(mask);
        return new Int32Array(data || []);
    }

    function finalizeRulesFor3D(state, deps) {
        rulesToMask3D(state, undefined, deps);
        const finalized = requireDep(deps, "getRuleFinalizationApi")().finalizeRuleRuntime({
            normalRules: state.rules3d.groups || [],
            lateRules: state.rules3d.lateGroups || [],
            loops: state.loops || [],
            subroutines: state.subroutines || [],
            ruleContract: "state.rules3d",
            isRigid: function(rule) {
                return !!(rule && rule.rigid);
            },
            fixUpGosubs: requireDep(deps, "fixUpGosubs"),
            onError: function(message, lineNumber) {
                requireDep(deps, "logError")(message, lineNumber);
            },
            onWarning: function(message, lineNumber) {
                requireDep(deps, "logWarning")(message, lineNumber);
            }
        });
        applyFinalizedRules3D(state, finalized, deps);
    }

    function applyFinalizedRules3D(state, finalized, deps) {
        const projection = requireDep(deps, "getRuleFinalizationApi")().projectFinalizedRuntime(finalized, {
            ruleContract: "state.rules3d"
        });
        state.rules3d.groups = projection.runtimeRules.groups;
        state.rules3d.lateGroups = projection.runtimeRules.lateGroups;
        state.rules3d.loopPoint = projection.runtimeRules.loopPoint;
        state.rules3d.lateLoopPoint = projection.runtimeRules.lateLoopPoint;
        state.rules3d.subroutines = projection.runtimeRules.subroutines;
        state.rules3d.finalization = projection.runtimeRules.finalization;

        state.rigidGroups3d = projection.rigidState.rigidGroups;
        state.rigidGroupIndex_to_GroupIndex = projection.rigidState.rigidGroupIndexToGroupIndex;
        state.groupNumber_to_RigidGroupIndex = projection.rigidState.groupNumberToRigidGroupIndex;
        state.groupIndex_to_RigidGroupIndex = projection.rigidState.groupIndexToRigidGroupIndex;

        const inactive2D = projection.inactive2DRuntimeProjection;
        state.rules = inactive2D.rules;
        state.lateRules = inactive2D.lateRules;
        state.rigidGroups = inactive2D.rigidGroups;
        state.loopPoint = inactive2D.loopPoint;
        state.lateLoopPoint = inactive2D.lateLoopPoint;
    }

    return {
        lowerThreeDimensionLevels,
        levelFromThreeDimensionParsedSource,
        rulesToMask3D,
        finalizeRulesFor3D,
        hasThreeDimensionLevels
    };
});
