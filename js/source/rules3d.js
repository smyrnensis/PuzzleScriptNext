(function(root) {
    "use strict";

    const cellMatchApi = getCellMatchApi();
    const ruleFramesApi = getRuleFramesApi();
    const ruleScanApi = getRuleScanApi();
    const ruleReplacementsApi = getRuleReplacementsApi();

    function makeCellPattern(options) {
        const opts = options || {};
        return {
            objectsPresent: opts.objectsPresent || emptyMask(opts.strideObj),
            objectsMissing: opts.objectsMissing || emptyMask(opts.strideObj),
            anyObjectsPresent: opts.anyObjectsPresent || [],
            movementsPresent: opts.movementsPresent || emptyMask(opts.strideMov),
            movementsMissing: opts.movementsMissing || emptyMask(opts.strideMov),
            replacement: opts.replacement || null
        };
    }

    function makeCellReplacement(options) {
        const opts = options || {};
        return {
            objectsClear: opts.objectsClear || emptyMask(opts.strideObj),
            objectsSet: opts.objectsSet || emptyMask(opts.strideObj),
            movementsClear: opts.movementsClear || emptyMask(opts.strideMov),
            movementsSet: opts.movementsSet || emptyMask(opts.strideMov),
            movementsLayerMask: opts.movementsLayerMask || emptyMask(opts.strideMov),
            randomEntityMask: opts.randomEntityMask || emptyMask(opts.strideObj),
            randomDirMask: opts.randomDirMask || emptyMask(opts.strideMov)
        };
    }

    function makePattern(cells, options) {
        const opts = options || {};
        return {
            cells: (cells || []).map(cell => cell.ellipsis ? {
                ellipsis: true,
                rowIndex: cell.rowIndex
            } : {
                offset: normalisePatternOffset(cell.offset),
                rowIndex: cell.rowIndex,
                pattern: cell.pattern || makeCellPattern(opts)
            }),
            ellipsisCount: opts.ellipsisCount || 0,
            frameExpansion: opts.frameExpansion || "none"
        };
    }

    function expandPatternFrames(pattern, frameOptions) {
        const opts = frameOptions || {};
        const frames = opts.frames || ruleFramesApi.RULE_FRAMES;

        if (pattern.frameExpansion === "none") {
            return [{
                frame: null,
                ellipsisCount: pattern.ellipsisCount || 0,
                cells: pattern.cells.map(cell => cell.ellipsis ? {
                    ellipsis: true,
                    rowIndex: cell.rowIndex
                } : {
                    offset: normaliseOffset(cell.offset),
                    rowIndex: cell.rowIndex,
                    pattern: cell.pattern
                })
            }];
        }

        if (pattern.frameExpansion !== "proper-orthogonal-frames")
            throw new Error(`Unsupported 3D frame expansion: ${pattern.frameExpansion}`);

        return frames.map(frame => ({
            frame,
            ellipsisCount: pattern.ellipsisCount || 0,
            cells: pattern.cells.map(cell => cell.ellipsis ? {
                ellipsis: true,
                rowIndex: cell.rowIndex
            } : {
                offset: resolveRelativeOffset(cell.offset, frame),
                rowIndex: cell.rowIndex,
                pattern: cell.pattern
            })
        }));
    }

    function findPatternMatches(board, pattern, options) {
        const opts = options || {};
        const variants = opts.variants || expandPatternFrames(pattern, opts);
        const matches = [];

        for (const variant of variants) {
            if (variant.ellipsisCount > 0) {
                findWildcardPatternMatches(board, variant, opts, matches);
            } else {
                scanPatternOrigins(board, variant, opts, function(origin) {
                    const placement = matchPatternAt(board, variant, origin);
                    if (placement)
                        matches.push(placement);
                });
            }
        }

        return matches;
    }

    function findWildcardPatternMatches(board, variant, options, matches) {
        const direction = directionInfo((options || {}).scanDirection || (options || {}).direction);
        if (!direction.axis || variant.ellipsisCount > 2)
            return;

        const compactLength = countConcreteCells(variant);
        const bounds = wildcardOriginBounds(board, direction, compactLength);
        scanBoundsByAxis(board, bounds, direction.axis, function(origin) {
            const originCoord = board.indexToCoord(origin);
            const kmax = wildcardKMax(board, originCoord, direction, compactLength);
            if (variant.ellipsisCount === 1) {
                for (let k = 0; k < kmax; k++) {
                    const placement = matchWildcardPatternAt(board, variant, origin, direction, [k]);
                    if (placement)
                        matches.push(placement);
                }
            } else {
                for (let k1 = 0; k1 < kmax; k1++) {
                    for (let k2 = 0; k1 + k2 < kmax && k2 < kmax; k2++) {
                        const placement = matchWildcardPatternAt(board, variant, origin, direction, [k1, k2]);
                        if (placement)
                            matches.push(placement);
                    }
                }
            }
        });
    }

    function matchWildcardPatternAt(board, variant, originIndex, direction, gaps) {
        const origin = board.indexToCoord(originIndex);
        const matchedCells = [];
        let ellipsesBefore = 0;
        let gapSum = 0;

        for (const cell of variant.cells) {
            if (cell.ellipsis) {
                gapSum += gaps[ellipsesBefore] || 0;
                ellipsesBefore++;
                continue;
            }

            const rowIndex = cell.rowIndex === undefined ? matchedCells.length + ellipsesBefore : cell.rowIndex;
            const compactIndex = rowIndex - ellipsesBefore;
            const step = compactIndex + gapSum;
            const coord = {
                x: origin.x + direction.delta.x * step,
                y: origin.y + direction.delta.y * step,
                z: origin.z + direction.delta.z * step
            };

            if (!board.containsCoord(coord))
                return null;

            const index = board.coordToIndex(coord);
            const movements = board.getMovements ? board.getMovements(index) : null;
            if (!cellMatchApi.matchesCell(board.getCell(index), cell.pattern, movements))
                return null;

            matchedCells.push({ index, coord, pattern: cell.pattern });
        }

        return {
            origin: originIndex,
            frame: variant.frame,
            gaps: gaps.slice(),
            cells: matchedCells
        };
    }

    function scanPatternOrigins(board, variant, options, visitor) {
        ruleScanApi.scanPatternOrigins(board, variant, Object.assign({}, options || {}, {
            visitor
        }), buildScanHooks3D());
    }

    function buildScanHooks3D() {
        return {
            axisForDirection,
            fullBounds: fullBoardBounds,
            localBoundsAround: localBoundsAround3D,
            tightenBounds: function(_board, bounds, variant) {
                return tightenBoundsForVariant(bounds, variant);
            },
            scanBounds: scanBoundsByAxis,
            indexToCoord: function(board, index) {
                return board.indexToCoord(index);
            },
            cellCount: function(board) {
                return board.cellCount;
            }
        };
    }

    function localBoundsAround3D(board, coord, radius) {
        return {
            xmin: Math.max(0, coord.x - radius),
            xmax: Math.min(board.width, coord.x + radius + 1),
            ymin: Math.max(0, coord.y - radius),
            ymax: Math.min(board.height, coord.y + radius + 1),
            zmin: Math.max(0, coord.z - radius),
            zmax: Math.min(board.depth, coord.z + radius + 1)
        };
    }

    function fullBoardBounds(board) {
        return {
            xmin: 0,
            xmax: board.width,
            ymin: 0,
            ymax: board.height,
            zmin: 0,
            zmax: board.depth
        };
    }

    function scanBoundsByAxis(board, bounds, axis, visitor) {
        if (axis === "x") {
            for (let y = bounds.ymin; y < bounds.ymax; y++) {
                for (let z = bounds.zmin; z < bounds.zmax; z++) {
                    for (let x = bounds.xmin; x < bounds.xmax; x++)
                        visitor(board.coordToIndex(x, y, z));
                }
            }
            return;
        }

        if (axis === "y") {
            for (let x = bounds.xmin; x < bounds.xmax; x++) {
                for (let z = bounds.zmin; z < bounds.zmax; z++) {
                    for (let y = bounds.ymin; y < bounds.ymax; y++)
                        visitor(board.coordToIndex(x, y, z));
                }
            }
            return;
        }

        if (axis === "z") {
            for (let x = bounds.xmin; x < bounds.xmax; x++) {
                for (let y = bounds.ymin; y < bounds.ymax; y++) {
                    for (let z = bounds.zmin; z < bounds.zmax; z++)
                        visitor(board.coordToIndex(x, y, z));
                }
            }
            return;
        }

        for (let x = bounds.xmin; x < bounds.xmax; x++) {
            for (let y = bounds.ymin; y < bounds.ymax; y++) {
                for (let z = bounds.zmin; z < bounds.zmax; z++)
                    visitor(board.coordToIndex(x, y, z));
            }
        }
    }

    function wildcardOriginBounds(board, direction, compactLength) {
        const bounds = fullBoardBounds(board);
        const axis = direction.axis;
        const minKey = axis + "min";
        const maxKey = axis + "max";
        const size = axisSize(board, axis);
        if (direction.sign > 0) {
            bounds[minKey] = 0;
            bounds[maxKey] = Math.max(0, size - compactLength + 1);
        } else {
            bounds[minKey] = Math.max(0, compactLength - 1);
            bounds[maxKey] = size;
        }
        return bounds;
    }

    function wildcardKMax(board, origin, direction, compactLength) {
        const size = axisSize(board, direction.axis);
        const value = origin[direction.axis];
        if (direction.sign > 0)
            return size - (value + compactLength) + 1;
        return value - compactLength + 2;
    }

    function countConcreteCells(variant) {
        let count = 0;
        for (const cell of variant.cells || []) {
            if (!cell.ellipsis)
                count++;
        }
        return count;
    }

    function axisSize(board, axis) {
        return axis === "x" ? board.width : axis === "y" ? board.height : board.depth;
    }

    function tightenBoundsForVariant(bounds, variant) {
        const result = Object.assign({}, bounds);
        for (const cell of variant.cells || []) {
            const offset = normaliseOffset(cell.offset);
            result.xmin = Math.max(result.xmin, bounds.xmin - offset.x);
            result.xmax = Math.min(result.xmax, bounds.xmax - offset.x);
            result.ymin = Math.max(result.ymin, bounds.ymin - offset.y);
            result.ymax = Math.min(result.ymax, bounds.ymax - offset.y);
            result.zmin = Math.max(result.zmin, bounds.zmin - offset.z);
            result.zmax = Math.min(result.zmax, bounds.zmax - offset.z);
        }
        return result;
    }

    function axisForDirection(direction) {
        return directionInfo(direction).axis;
    }

    function directionInfo(direction) {
        if (direction === "left" || direction === 4)
            return { axis: "x", sign: -1, delta: { x: -1, y: 0, z: 0 } };
        if (direction === "right" || direction === 8)
            return { axis: "x", sign: 1, delta: { x: 1, y: 0, z: 0 } };
        if (direction === "up" || direction === 1)
            return { axis: "y", sign: -1, delta: { x: 0, y: -1, z: 0 } };
        if (direction === "down" || direction === 2)
            return { axis: "y", sign: 1, delta: { x: 0, y: 1, z: 0 } };
        if (direction === "front")
            return { axis: "z", sign: -1, delta: { x: 0, y: 0, z: -1 } };
        if (direction === "back")
            return { axis: "z", sign: 1, delta: { x: 0, y: 0, z: 1 } };
        return { axis: null, sign: 0, delta: { x: 0, y: 0, z: 0 } };
    }

    function matchPatternAt(board, variant, originIndex) {
        const origin = board.indexToCoord(originIndex);
        const matchedCells = [];

        for (const cell of variant.cells) {
            if (cell.ellipsis)
                continue;
            const coord = {
                x: origin.x + cell.offset.x,
                y: origin.y + cell.offset.y,
                z: origin.z + cell.offset.z
            };

            if (!board.containsCoord(coord))
                return null;

            const index = board.coordToIndex(coord);
            const movements = board.getMovements ? board.getMovements(index) : null;
            if (!cellMatchApi.matchesCell(board.getCell(index), cell.pattern, movements))
                return null;

            matchedCells.push({ index, coord, pattern: cell.pattern });
        }

        return {
            origin: originIndex,
            frame: variant.frame,
            cells: matchedCells
        };
    }

    function applyCellReplacement(board, index, replacement, rule) {
        return ruleReplacementsApi.applyCellReplacement(board, index, replacement, rule, buildReplacementHooks3D());
    }

    function applyMatchReplacements(board, match, rule) {
        return ruleReplacementsApi.applyMatchReplacements(board, match, rule, buildReplacementHooks3D());
    }

    function isMatchStillValid(board, match) {
        return ruleReplacementsApi.isMatchStillValid(board, match, buildReplacementHooks3D());
    }

    function buildReplacementHooks3D() {
        return {
            getCell: function(board, index) {
                return board.getCell(index);
            },
            cloneCell: function(cell) {
                return new Int32Array(cell);
            },
            getMovements: function(board, index) {
                return board.getMovements(index);
            },
            setCell: function(board, index, cell) {
                board.setCell(index, cell);
            },
            setMovements: function(board, index, movements) {
                board.setMovements(index, movements);
            },
            applyCellReplacementMasks: applyCellReplacementMasks3D,
            applyRigidReplacementMasks: cellMatchApi.applyRigidReplacementMasks,
            getRigidGroupIndexMask: function(board, index) {
                return board.getRigidGroupIndexMask ? board.getRigidGroupIndexMask(index) : null;
            },
            getRigidMovementAppliedMask: function(board, index) {
                return board.getRigidMovementAppliedMask ? board.getRigidMovementAppliedMask(index) : null;
            },
            setRigidGroupIndexMask: function(board, index, mask) {
                if (board.setRigidGroupIndexMask)
                    board.setRigidGroupIndexMask(index, mask);
            },
            setRigidMovementAppliedMask: function(board, index, mask) {
                if (board.setRigidMovementAppliedMask)
                    board.setRigidMovementAppliedMask(index, mask);
            },
            rigidGroupIndexForRule: function(board, rule) {
                return board.groupNumberToRigidGroupIndex && board.groupNumberToRigidGroupIndex[rule.groupNumber] || 0;
            },
            layerCount: function(board) {
                return board.layerCount;
            },
            movementBits: function(board) {
                return board.movementBits;
            },
            strideMov: function(board) {
                return board.strideMov;
            },
            recordCellReplacementSfx: function(board, index, oldCell, cell) {
                if (board.recordCellReplacementSfx)
                    board.recordCellReplacementSfx(index, oldCell, cell);
            },
            matchesCell: function(board, cell) {
                const movements = board.getMovements ? board.getMovements(cell.index) : null;
                return cellMatchApi.matchesCell(board.getCell(cell.index), cell.pattern, movements);
            }
        };
    }

    function applyCellReplacementMasks3D(board, cell, movements, replacement) {
        return cellMatchApi.applyCellReplacementMasks(cell, movements, replacement, {
            strideObj: board.strideObj,
            layerCount: board.layerCount,
            movementBits: board.movementBits,
            movementMask: board.movementMask,
            directionCount: board.directionCount || 6,
            directionBitIndexes: board.directionBitIndexes || [0, 1, 2, 3, 5, 6],
            uniform: board.uniform || Math.random,
            objectLayers: board.objectLayers,
            layerMasks: board.layerMasks
        });
    }

    function resolveRelativeOffset(offset, frame) {
        const relative = offset && offset.relative || {};
        const absolute = normaliseOffset(offset && offset.absolute || offset);

        let result = absolute;
        for (const marker of Object.keys(relative)) {
            const amount = relative[marker];
            if (!amount)
                continue;
            const delta = ruleFramesApi.resolveMarker(frame, marker);
            result = {
                x: result.x + delta[0] * amount,
                y: result.y + delta[1] * amount,
                z: result.z + delta[2] * amount
            };
        }
        return result;
    }

    function normalisePatternOffset(offset) {
        if (!offset || !offset.relative)
            return normaliseOffset(offset);
        return {
            absolute: normaliseOffset(offset.absolute),
            relative: Object.assign({}, offset.relative)
        };
    }

    function normaliseOffset(offset) {
        if (!offset)
            return { x: 0, y: 0, z: 0 };
        return {
            x: offset.x || 0,
            y: offset.y || 0,
            z: offset.z || 0
        };
    }

    function emptyMask(strideObj) {
        return new Int32Array(strideObj || 1);
    }

    function getCellMatchApi() {
        if (typeof require === "function") {
            try {
                return require("./cell_match3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.CellMatch3D;
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

    function getRuleScanApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_scan.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleScan;
    }

    function getRuleReplacementsApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_replacements.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleReplacements;
    }

    const Rules3D = {
        makeCellPattern,
        makeCellReplacement,
        makePattern,
        expandPatternFrames,
        findPatternMatches,
        scanPatternOrigins,
        matchPatternAt,
        isMatchStillValid,
        applyCellReplacement,
        applyMatchReplacements,
        resolveRelativeOffset
    };

    root.Rules3D = Rules3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = Rules3D;
})(typeof window !== "undefined" ? window : this);
