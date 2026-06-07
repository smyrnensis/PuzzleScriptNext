(function(root) {
    "use strict";

    const contract = root.Puzzle3DRenderFrameContract
        || (typeof require === "function" ? require("./render_frame_contract3d.js") : null);

    function buildRenderFrame3D(runtime, state, options) {
        if (!runtime || !runtime.board)
            throw new Error("3D render frame requires a runtime with a board.");
        if (!state)
            throw new Error("3D render frame requires compiled PuzzleScript state.");

        const opts = options || {};
        const board = runtime.board;
        const view = normalizeView(state, opts.view || opts, board);
        const objects = buildRenderObjects3D(state);
        const cells = buildRenderCells3D(board, view.renderRegion);

        const frame = {
            model: contract ? contract.MODEL : "psnext-grid3",
            schemaVersion: contract ? contract.SCHEMA_VERSION : 1,
            levelName: state.levelName || board.title || null,
            size: {
                width: board.width,
                height: board.height,
                depth: board.depth,
                layerCount: board.layerCount,
                renderCellCount: cells.length
            },
            spriteGrid: buildSpriteGrid3D(state, objects, opts),
            objects,
            drawPlan: buildDrawPlan3D(state, board, view, cells),
            cells,
            session: normalizeSessionState(opts.sessionState),
            effects: normalizeRenderEffects(opts.effects, state, runtime),
            view
        };
        return validateRenderFrame3D(frame);
    }

    function buildSpriteGrid3D(state, objects, opts) {
        const sourceObjects = objects || [];
        let width = positiveInteger(state && state.sprite_size, 5);
        let height = positiveInteger(state && state.cell_height, width);
        let depth = positiveInteger(opts && opts.spriteDepth, positiveInteger(state && state.sprite_depth, width));

        for (const object of sourceObjects) {
            const size = object && object.visual && object.visual.voxels && object.visual.voxels.size;
            if (!size)
                continue;
            width = Math.max(width, positiveInteger(size.width, 1));
            height = Math.max(height, positiveInteger(size.height, 1));
            depth = Math.max(depth, positiveInteger(size.depth, 1));
        }

        return { width, height, depth };
    }

    function buildSessionRenderFrame3D(session, options) {
        if (!session || !session.runtime)
            throw new Error("3D session render frame requires a session with a runtime.");
        const opts = options || {};
        const view = Object.assign({}, opts.view || {});
        if (view.visibleRegion === undefined)
            view.visibleRegion = visibleRegionFromOldFlickScreenDat(session.oldflickscreendat, session.runtime && session.runtime.board);
        return buildRenderFrame3D(session.runtime, opts.state || session.state, Object.assign({}, opts, {
            view,
            sessionState: opts.sessionState || snapshotSessionState(session),
            effects: opts.effects || (session.lastTurn
                ? effectsFromTurn(session.lastTurn, session.history ? [session.lastTurn].filter(Boolean) : [])
                : null)
        }));
    }

    function buildSessionTurnRenderFrame3D(result, options) {
        if (!result || !result.session)
            throw new Error("3D session turn render frame requires a processSessionTurn3D result.");
        const opts = options || {};
        const view = Object.assign({}, opts.view || {});
        if (view.visibleRegion === undefined)
            view.visibleRegion = visibleRegionFromOldFlickScreenDat(result.session.oldflickscreendat, result.session.runtime && result.session.runtime.board);
        return buildRenderFrame3D(result.session.runtime, opts.state || result.session.state, Object.assign({}, opts, {
            view,
            sessionState: result.sessionState || snapshotSessionState(result.session),
            effects: opts.effects || effectsFromTurn(result.turn, result.turns || [])
        }));
    }

    function effectsFromTurn(turn, turns) {
        const activeTurn = turn || {};
        const sessionArtifacts = activeTurn.sessionArtifacts || {};
        const commandArtifacts = activeTurn.commandArtifacts || {};
        const sfxArtifacts = activeTurn.sfxArtifacts || { playSeeds: [], animations: {} };
        return {
            source: "turn",
            changed: !!activeTurn.changed,
            boardChanged: !!activeTurn.boardChanged,
            moved: !!activeTurn.moved,
            inputDirection: activeTurn.inputDirection,
            turns: (turns || []).filter(Boolean).length,
            commands: (activeTurn.commandQueue || commandArtifacts.queue || sessionArtifacts.queue || []).slice(),
            message: {
                requested: !!sessionArtifacts.messageRequested,
                text: sessionArtifacts.messageText || commandArtifacts.messageText || ""
            },
            status: {
                requested: !!sessionArtifacts.statusRequested,
                text: sessionArtifacts.statusText || commandArtifacts.statusText || ""
            },
            sfx: {
                playSeeds: (sfxArtifacts.playSeeds || []).slice(),
                animations: cloneAnimationMap(sfxArtifacts.animations || {})
            },
            tween: {
                movedEntities: cloneMovedEntities(activeTurn.movedEntities || {}),
                elapsedMs: 0
            }
        };
    }

    function snapshotSessionState(session) {
        return {
            levelIndex: session.levelIndex,
            won: !!session.won,
            completed: !!session.completed,
            hasCheckpoint: !!session.checkpointSource,
            backupCount: session.backups ? session.backups.length : 0,
            linkDepth: session.linkStack ? session.linkStack.length : 0
        };
    }

    function normalizeSessionState(sessionState) {
        const source = sessionState || {};
        return {
            levelIndex: source.levelIndex || 0,
            won: !!source.won,
            completed: !!source.completed,
            hasCheckpoint: !!source.hasCheckpoint,
            backupCount: source.backupCount || 0,
            linkDepth: source.linkDepth || 0
        };
    }

    function normalizeRenderEffects(effects, state, runtime) {
        const source = effects || {};
        const metadata = state && state.metadata || {};
        const tweenSource = source.tween || {};
        return {
            source: source.source || "none",
            changed: !!source.changed,
            boardChanged: !!source.boardChanged,
            moved: !!source.moved,
            inputDirection: source.inputDirection,
            turns: source.turns || 0,
            commands: (source.commands || []).slice(),
            message: Object.assign({ requested: false, text: "" }, source.message || {}),
            status: Object.assign({ requested: false, text: "" }, source.status || {}),
            sfx: {
                playSeeds: source.sfx && source.sfx.playSeeds ? source.sfx.playSeeds.slice() : [],
                animations: cloneAnimationMap(source.sfx && source.sfx.animations || {})
            },
            tween: normalizeTweenEffect(tweenSource, state, runtime)
        };
    }

    function normalizeTweenEffect(tween, state, runtime) {
        const metadata = state && state.metadata || {};
        const movedEntities = cloneMovedEntities(tween.movedEntities || {});
        const enabled = metadata.tween_length !== undefined && Object.keys(movedEntities).length > 0;
        return {
            enabled,
            lengthMs: secondsToMs(metadata.tween_length, 0),
            easing: metadata.tween_easing || "linear",
            snap: positiveInteger(metadata.tween_snap, stateSpriteSize(state)),
            elapsedMs: numberOrDefault(tween.elapsedMs, 0),
            movedEntities,
            actionMask: actionMaskForRuntime(runtime),
            directionDeltas: buildTweenDirectionDeltas(runtime)
        };
    }

    function actionMaskForRuntime(runtime) {
        const bits = runtime && runtime.board && runtime.board.directionBits || {};
        return bits.action || 0;
    }

    function buildTweenDirectionDeltas(runtime) {
        const board = runtime && runtime.board || {};
        const bits = board.directionBits || {};
        const deltas = runtime && runtime.directions && runtime.directions.deltas || {};
        const result = {};
        for (const name of Object.keys(bits)) {
            const delta = deltas[name];
            if (Array.isArray(delta))
                result[bits[name]] = { x: delta[0] || 0, y: delta[1] || 0, z: delta[2] || 0 };
        }
        return result;
    }

    function buildRenderObjects3D(state) {
        const count = state.objectCount || (state.idDict ? state.idDict.length : 0);
        const objects = [];
        for (let id = 0; id < count; id++) {
            const name = state.idDict && state.idDict[id];
            if (name === undefined)
                continue;
            const object = state.objects && state.objects[name] || {};
            const layer = object.layer || 0;
            objects[id] = {
                id,
                name,
                layer,
                visual: buildObjectVisual3D(state, object, name)
            };
        }
        return objects;
    }

    function buildObjectVisual3D(state, object, name) {
        const colors = normalizeColors(state, object.colors || []);
        if (object.sprite3matrix)
            return buildSprite3MatrixVisual3D(state, object, colors);
        if (object.spritematrix && object.spritematrix.length > 0)
            return buildSpriteMatrixVisual3D(state, object, colors);

        throw new Error(`3D render frame requires object-owned sprite matrix data for "${name || "unnamed object"}".`);
    }

    function buildSpriteMatrixVisual3D(state, object, colors) {
        const matrix = object.spritematrix || [];
        const cells = spriteMatrixCells(matrix, colors);
        return {
            kind: "spritematrix",
            color: cells.length > 0 ? cells[0].color : firstVisibleColor(colors),
            colors,
            matrix,
            offset: object.spriteoffset || { x: 0, y: 0 },
            voxels: {
                size: spriteMatrixSize(matrix),
                cells
            }
        };
    }

    function buildSprite3MatrixVisual3D(state, object, colors) {
        const matrix = object.sprite3matrix || [];
        const cells = sprite3MatrixCells(matrix, colors);
        return {
            kind: "sprite3matrix",
            color: cells.length > 0 ? cells[0].color : firstVisibleColor(colors),
            colors,
            matrix,
            offset: object.sprite3offset || { row: 0, col: 0, slice: 0 },
            voxels: {
                size: sprite3MatrixSize(matrix),
                cells
            }
        };
    }

    function spriteMatrixCells(matrix, colors) {
        const cells = [];
        for (let row = 0; row < matrix.length; row++) {
            const cols = matrix[row] || [];
            for (let col = 0; col < cols.length; col++) {
                const value = cols[col];
                if (value < 0 || value === "." || value === " ")
                    continue;
                const color = spriteColorFromValue(value, colors);
                if (color.visible)
                    cells.push(spriteCell({ col, row, slice: 0 }, color));
            }
        }
        return cells;
    }

    function sprite3MatrixCells(matrix, colors) {
        const cells = [];
        for (let row = 0; row < matrix.length; row++) {
            const cols = matrix[row] || [];
            for (let col = 0; col < cols.length; col++) {
                const slices = cols[col] || [];
                for (let slice = 0; slice < slices.length; slice++) {
                    const value = slices[slice];
                    if (value < 0 || value === "." || value === " ")
                        continue;
                    const color = spriteColorFromValue(value, colors);
                    if (color.visible)
                        cells.push(spriteCell({ col, row, slice }, color));
                }
            }
        }
        return cells;
    }

    function spriteCell(coord, color) {
        const cell = Object.assign({}, coord, { color: color.color });
        if (color.alpha < 1)
            cell.alpha = color.alpha;
        return cell;
    }

    function spriteColorFromValue(value, colors) {
        return normalizeSpriteColor(colorFromSpriteValue(value, colors));
    }

    function colorFromSpriteValue(value, colors) {
        if (typeof value === "number")
            return colors[value] || "#ff00ff";
        if (typeof value === "string" && value.length === 1 && /[0-9a-zA-Z]/.test(value))
            return colors[spritePaletteIndex(value)] || "#ff00ff";
        return value || "#ff00ff";
    }

    function normalizeSpriteColor(color) {
        if (!color)
            return { color: "#ff00ff", alpha: 1, visible: true };
        if (typeof color === "string" && color.toLowerCase() === "transparent")
            return { color: "#000000", alpha: 0, visible: false };
        if (typeof color === "string") {
            const rgba = parseHexAlphaColor(color);
            if (rgba)
                return rgba;
        }
        return { color, alpha: 1, visible: true };
    }

    function parseHexAlphaColor(color) {
        const match = String(color).match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i);
        if (!match)
            return null;

        const hex = match[1];
        if (hex.length === 4) {
            return {
                color: "#" + hex.slice(0, 3),
                alpha: parseInt(hex[3] + hex[3], 16) / 255,
                visible: parseInt(hex[3] + hex[3], 16) > 0
            };
        }

        const alpha = parseInt(hex.slice(6, 8), 16);
        return {
            color: "#" + hex.slice(0, 6),
            alpha: alpha / 255,
            visible: alpha > 0
        };
    }

    function spritePaletteIndex(value) {
        if (value <= "9")
            return Number(value);
        return 10 + value.toLowerCase().charCodeAt(0) - 97;
    }

    function spriteMatrixSize(matrix) {
        let width = 0;
        for (const row of matrix || [])
            width = Math.max(width, row ? row.length : 0);
        return {
            width: Math.max(1, width),
            height: 1,
            depth: Math.max(1, matrix.length)
        };
    }

    function sprite3MatrixSize(matrix) {
        let width = 0;
        let depth = matrix.length;
        let height = 0;
        for (const row of matrix || []) {
            width = Math.max(width, row ? row.length : 0);
            for (const col of row || [])
                height = Math.max(height, col ? col.length : 0);
        }
        return {
            width: Math.max(1, width),
            height: Math.max(1, height),
            depth: Math.max(1, depth)
        };
    }

    function normalizeColors(state, colors) {
        const palette = state.metadata && state.metadata.color_palette;
        return colors.map(color => colorToPresentationColor(palette, color));
    }

    function colorToPresentationColor(palette, color) {
        if (!color)
            return "#ff00ff";
        if (typeof color === "string" && color.toLowerCase() === "transparent")
            return "transparent";
        if (typeof root.colorToHex === "function") {
            try {
                return root.colorToHex(palette || {}, color);
            } catch (err) {
                // Fall through to the raw color. Tests and simple renderers can handle it.
            }
        }
        if (palette && Object.prototype.hasOwnProperty.call(palette, color))
            return palette[color];
        return color;
    }

    function firstVisibleColor(colors) {
        for (const color of colors || []) {
            const spriteColor = normalizeSpriteColor(color);
            if (spriteColor.visible)
                return spriteColor.color;
        }
        return "transparent";
    }

    function buildDrawPlan3D(state, board, view, cells) {
        return {
            objectGroups: buildObjectGroups(state),
            cellOrder: buildCellOrder3D(cells, view)
        };
    }

    function buildObjectGroups(state) {
        const groups = [];
        if (Array.isArray(state.collisionLayerGroups) && state.collisionLayerGroups.length > 0) {
            for (const group of state.collisionLayerGroups) {
                groups.push({
                    firstObjectId: group.firstObjectNo || 0,
                    objectCount: group.numObjects || 0
                });
            }
            return groups;
        }

        const count = state.objectCount || (state.idDict ? state.idDict.length : 0);
        if (count > 0)
            groups.push({ firstObjectId: 0, objectCount: count });
        return groups;
    }

    function buildRenderCells3D(board, renderRegion) {
        const cells = [];
        const region = renderRegion || {
            x: 0,
            z: 0,
            width: board.width,
            depth: board.depth
        };
        for (let x = region.x; x < region.x + region.width; x++) {
            for (let y = 0; y < board.height; y++) {
                for (let z = region.z; z < region.z + region.depth; z++) {
                    const index = board.coordToIndex(x, y, z);
                    cells.push({
                        index,
                        x,
                        y,
                        z,
                        objectIds: objectIdsFromCell(board.getCell(index), board.objectCount)
                    });
                }
            }
        }
        return cells;
    }

    function objectIdsFromCell(cell, objectCount) {
        const data = cell.data || cell;
        const ids = [];
        const limit = objectCount || data.length * 32;
        for (let id = 0; id < limit; id++) {
            const word = id >> 5;
            const bit = id & 31;
            if (word < data.length && (data[word] & (1 << bit)) !== 0)
                ids.push(id);
        }
        return ids;
    }

    function buildCellOrder3D(cells, view) {
        const direction = cameraVectorFromYawPitch(view.yaw, view.pitch);
        const indices = cells.map((cell, index) => index);
        indices.sort((left, right) => {
            const a = cells[left];
            const b = cells[right];
            const da = a.x * direction.x + a.y * direction.y + a.z * direction.z;
            const db = b.x * direction.x + b.y * direction.y + b.z * direction.z;
            if (da !== db)
                return da - db;
            if (a.y !== b.y)
                return a.y - b.y;
            if (a.z !== b.z)
                return a.z - b.z;
            return a.x - b.x;
        });
        return indices;
    }

    function normalizeView(state, view, board) {
        const metadata = state && state.metadata || {};
        const sourceView = viewFrom3DMetadata(state);
        const requested = Object.assign({}, sourceView, view || {});
        const visibleRegion = normalizeVisibleRegion(requested.visibleRegion, board);
        return {
            projection: requested.projection || "perspective",
            yaw: numberOrDefault(requested.yaw, 0),
            pitch: numberOrDefault(requested.pitch, 90),
            cameraZoom: positiveNumber(requested.cameraZoom, 1),
            cameraViewAngle: positiveNumber(requested.cameraViewAngle, 35),
            backgroundColor: requested.backgroundColor || backgroundColorFromState(state),
            shade: requested.shade === undefined ? true : !!requested.shade,
            visibility: requested.visibility || "all",
            slice: requested.slice || null,
            cameraCenter: normalizeCameraCenter(requested.cameraCenter),
            visibleRegion,
            renderRegion: normalizeRenderRegion(requested.renderRegion, visibleRegion, requested, board)
        };
    }

    function viewFrom3DMetadata(state) {
        const metadata = state && state.metadata || {};
        const cameraAngle = metadata.camera_angle || {};
        return {
            projection: metadata.orthographic_camera ? "orthographic" : "perspective",
            yaw: cameraAngle.yaw,
            pitch: cameraAngle.pitch,
            cameraZoom: metadata.camera_zoom,
            cameraViewAngle: metadata.camera_view_angle
        };
    }

    function backgroundColorFromState(state) {
        if (state && typeof state.bgcolor === "string" && state.bgcolor.length > 0)
            return state.bgcolor;
        const metadata = state && state.metadata || {};
        if (metadata.background_color)
            return colorToPresentationColor(metadata.color_palette, metadata.background_color);
        return "#000000";
    }

    function numberOrDefault(value, fallback) {
        return Number.isFinite(value) ? value : fallback;
    }

    function positiveNumber(value, fallback) {
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    function positiveInteger(value, fallback) {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 ? number : fallback;
    }

    function visibleRegionFromOldFlickScreenDat(value, board) {
        if (!Array.isArray(value) || value.length !== 4)
            return null;
        const x = nonNegativeInteger(value[0], 0);
        const z = nonNegativeInteger(value[1], 0);
        return normalizeVisibleRegion({
            x,
            z,
            width: value[2] - x,
            depth: value[3] - z
        }, board);
    }

    function normalizeVisibleRegion(value, board) {
        if (!value || !board)
            return null;
        const x = nonNegativeInteger(value.x, 0);
        const z = nonNegativeInteger(value.z, 0);
        const width = Math.min(positiveInteger(value.width, board.width), Math.max(0, board.width - x));
        const depth = Math.min(positiveInteger(value.depth, board.depth), Math.max(0, board.depth - z));
        return width > 0 && depth > 0 ? { x, z, width, depth } : null;
    }

    function normalizeRenderRegion(value, visibleRegion, view, board) {
        if (value !== undefined)
            return normalizeVisibleRegion(value, board);
        if (!visibleRegion || !board)
            return null;
        return deriveCameraRenderRegion(visibleRegion, view || {}, board);
    }

    function deriveCameraRenderRegion(visibleRegion, view, board) {
        const aspect = positiveNumber(view.viewportAspect, 1);
        const projection = view.projection || "perspective";
        const cameraZoom = positiveNumber(view.cameraZoom, 1);
        const cameraViewAngle = positiveNumber(view.cameraViewAngle, 35);
        const fit = cameraFitForRegion(visibleRegion, view, board, aspect, cameraZoom);
        const target = cameraTargetForBoard(board);
        const cameraDir = normalize3(cameraVectorFromYawPitch(view.yaw, view.pitch));
        const cameraPosition = add3(target, scale3(cameraDir, cameraDistanceForProjection(projection, fit, cameraViewAngle)));
        const basis = cameraBasisFromDirection(cameraDir, view);
        const floorYs = [0.5, -Math.max(0, positiveNumber(board.height, 1) - 1) - 0.5];
        const points = projection === "orthographic"
            ? orthographicFootprintPoints(target, basis, cameraDir, fit.halfSpan, aspect, floorYs)
            : perspectiveFootprintPoints(cameraPosition, basis, fit.halfSpan, aspect, cameraViewAngle, floorYs);
        if (!points)
            return fullBoardRegion(board);
        return regionFromScenePoints(points, visibleRegion, board, view);
    }

    function cameraFitForRegion(region, view, board, aspect, zoom) {
        const bounds = sceneBoundsForRegion(region, board, view && view.cameraCenter);
        const basis = cameraBasisFromDirection(normalize3(cameraVectorFromYawPitch(view.yaw, view.pitch)), view);
        const target = cameraTargetForBoard(board);
        const corners = sceneBoundsCorners(bounds);
        let horizontal = 0;
        let vertical = 0;
        let depth = 0;
        for (const corner of corners) {
            const delta = subtract3(corner, target);
            horizontal = Math.max(horizontal, Math.abs(dot3(delta, basis.right)));
            vertical = Math.max(vertical, Math.abs(dot3(delta, basis.up)));
            depth = Math.max(depth, Math.abs(dot3(delta, basis.forward)));
        }
        return {
            halfSpan: Math.max(vertical, horizontal / positiveNumber(aspect, 1), 0.5) * 1.15 / positiveNumber(zoom, 1),
            depthHalf: depth
        };
    }

    function cameraDistanceForProjection(projection, fit, viewAngle) {
        if (projection === "perspective") {
            const fovRadians = positiveNumber(viewAngle, 35) * Math.PI / 180;
            return positiveNumber(fit.halfSpan, 0.5) / Math.tan(fovRadians / 2)
                + Math.max(0, fit.depthHalf || 0);
        }
        return Math.max(1, fit.depthHalf * 3 + 1);
    }

    function sceneBoundsForRegion(region, board, cameraCenter) {
        const center = cameraCenter || regionCenter(region);
        const width = positiveNumber(region.width, positiveNumber(board.width, 1));
        const depth = positiveNumber(region.depth, positiveNumber(board.depth, 1));
        const height = positiveNumber(board.height, 1);
        return {
            min: { x: region.x - 0.5 - center.x, y: -height + 0.5, z: region.z - 0.5 - center.z },
            max: { x: region.x + width - 0.5 - center.x, y: 0.5, z: region.z + depth - 0.5 - center.z }
        };
    }

    function sceneBoundsCorners(bounds) {
        return [
            { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
            { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
            { x: bounds.min.x, y: bounds.max.y, z: bounds.min.z },
            { x: bounds.min.x, y: bounds.max.y, z: bounds.max.z },
            { x: bounds.max.x, y: bounds.min.y, z: bounds.min.z },
            { x: bounds.max.x, y: bounds.min.y, z: bounds.max.z },
            { x: bounds.max.x, y: bounds.max.y, z: bounds.min.z },
            { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
        ];
    }

    function perspectiveFootprintPoints(cameraPosition, basis, halfSpan, aspect, viewAngle, floorYs) {
        const fov = positiveNumber(viewAngle, 35) * Math.PI / 180;
        const tanVertical = Math.tan(fov / 2);
        const tanHorizontal = tanVertical * positiveNumber(aspect, 1);
        const points = [];
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const ray = normalize3(add3(
                    basis.forward,
                    add3(scale3(basis.right, sx * tanHorizontal), scale3(basis.up, sy * tanVertical))
                ));
                if (!intersectRayWithHorizontalPlanes(points, cameraPosition, ray, floorYs))
                    return null;
            }
        }
        return points;
    }

    function orthographicFootprintPoints(target, basis, cameraDir, halfSpan, aspect, floorYs) {
        const points = [];
        const widthHalf = halfSpan * positiveNumber(aspect, 1);
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                const origin = add3(target, add3(scale3(basis.right, sx * widthHalf), scale3(basis.up, sy * halfSpan)));
                if (!intersectRayWithHorizontalPlanes(points, origin, basis.forward, floorYs))
                    return null;
            }
        }
        return points;
    }

    function intersectRayWithHorizontalPlanes(points, origin, ray, planeYs) {
        if (Math.abs(ray.y) < 1e-9)
            return false;
        for (const y of planeYs) {
            const t = (y - origin.y) / ray.y;
            if (t < 0)
                return false;
            points.push(add3(origin, scale3(ray, t)));
        }
        return true;
    }

    function regionFromScenePoints(points, visibleRegion, board, view) {
        const center = view && view.cameraCenter || regionCenter(visibleRegion);
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const point of points) {
            minX = Math.min(minX, point.x + center.x);
            maxX = Math.max(maxX, point.x + center.x);
            minZ = Math.min(minZ, point.z + center.z);
            maxZ = Math.max(maxZ, point.z + center.z);
        }
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ))
            return fullBoardRegion(board);
        const x = Math.max(0, Math.floor(minX - 0.5));
        const z = Math.max(0, Math.floor(minZ - 0.5));
        const maxCellX = Math.min(board.width, Math.ceil(maxX + 0.5));
        const maxCellZ = Math.min(board.depth, Math.ceil(maxZ + 0.5));
        return {
            x,
            z,
            width: Math.max(1, maxCellX - x),
            depth: Math.max(1, maxCellZ - z)
        };
    }

    function fullBoardRegion(board) {
        return {
            x: 0,
            z: 0,
            width: board.width,
            depth: board.depth
        };
    }

    function regionCenter(region) {
        return {
            x: region.x + (region.width - 1) / 2,
            z: region.z + (region.depth - 1) / 2
        };
    }

    function normalizeCameraCenter(value) {
        return value && Number.isFinite(value.x) && Number.isFinite(value.z)
            ? { x: value.x, z: value.z }
            : null;
    }

    function cameraTargetForBoard(board) {
        const height = board ? board.height : 1;
        return {
            x: 0,
            y: -Math.max(0, positiveNumber(height, 1) - 1) / 2,
            z: 0
        };
    }

    function cameraBasisFromDirection(cameraDir, view) {
        const forward = scale3(normalize3(cameraDir), -1);
        const upHint = cameraUpVectorForDirection(cameraDir, view);
        let right = normalize3(cross3(forward, upHint));
        if (vectorLength(right) === 0)
            right = { x: 1, y: 0, z: 0 };
        const up = normalize3(cross3(right, forward));
        return { forward, right, up };
    }

    function cameraUpVectorForDirection(direction, view) {
        const nearVertical = Math.abs(direction.y) > 0.999;
        if (!nearVertical)
            return { x: 0, y: 1, z: 0 };
        const yaw = (Number.isFinite(view && view.yaw) ? view.yaw : 0) * Math.PI / 180;
        return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    }

    function add3(a, b) {
        return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    }

    function subtract3(a, b) {
        return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    }

    function scale3(vector, scale) {
        return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
    }

    function dot3(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    function cross3(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    function normalize3(vector) {
        const length = vectorLength(vector);
        if (length === 0)
            return { x: 0, y: 0, z: 0 };
        return {
            x: vector.x / length,
            y: vector.y / length,
            z: vector.z / length
        };
    }

    function vectorLength(vector) {
        return Math.hypot(vector.x, vector.y, vector.z);
    }

    function nonNegativeInteger(value, fallback) {
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 ? number : fallback;
    }

    function secondsToMs(value, fallbackMs) {
        if (value === undefined || value === null || value === "")
            return fallbackMs;
        return Number(value) * 1000;
    }

    function stateSpriteSize(state) {
        return positiveInteger(state && state.sprite_size, 5);
    }

    function cameraVectorFromYawPitch(yawDegrees, pitchDegrees) {
        const yaw = yawDegrees * Math.PI / 180;
        const pitch = pitchDegrees * Math.PI / 180;
        const horizontal = Math.cos(pitch);
        return {
            x: -Math.sin(yaw) * horizontal,
            y: Math.sin(pitch),
            z: Math.cos(yaw) * horizontal
        };
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

    function validateRenderFrame3D(frame) {
        if (contract && typeof contract.validateRenderFrame3D === "function")
            return contract.validateRenderFrame3D(frame);
        return frame;
    }

    const api = {
        buildRenderFrame3D,
        buildSessionRenderFrame3D,
        buildSessionTurnRenderFrame3D,
        buildRenderObjects3D,
        buildRenderCells3D,
        buildDrawPlan3D,
        buildCellOrder3D,
        validateRenderFrame3D,
        spriteMatrixCells,
        spriteMatrixSize
    };

    root.Puzzle3DRenderFrame = api;
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
})(typeof window !== "undefined" ? window : this);
