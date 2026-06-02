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

        const frame = {
            model: contract ? contract.MODEL : "psnext-grid3",
            schemaVersion: contract ? contract.SCHEMA_VERSION : 1,
            levelName: state.levelName || board.title || null,
            size: {
                width: board.width,
                height: board.height,
                depth: board.depth,
                layerCount: board.layerCount
            },
            spriteGrid: buildSpriteGrid3D(state, objects, opts),
            objects,
            drawPlan: buildDrawPlan3D(state, board, view),
            cells: buildRenderCells3D(board),
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
        let depth = positiveInteger(opts && opts.spriteDepth, positiveInteger(state && state.sprite_depth, 1));

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
        const presentation = classifyLayerPresentation3D(state);
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
                visual: buildObjectVisual3D(state, object, presentationForLayer(presentation, layer, name), name)
            };
        }
        return objects;
    }

    function presentationForLayer(presentation, layer, name) {
        const value = presentation[layer];
        if (value === "floor" || value === "solid")
            return value;
        throw new Error(`3D render frame cannot infer visual presentation for object "${name}" on layer ${layer}.`);
    }

    function classifyLayerPresentation3D(state) {
        const layers = state && state.collisionLayers || [];
        const backgroundLayer = Number.isInteger(state && state.backgroundlayer)
            ? state.backgroundlayer
            : 0;
        const result = [];
        for (let layer = 0; layer < layers.length; layer++) {
            if (layer === backgroundLayer)
                result[layer] = "floor";
            else
                result[layer] = "solid";
        }
        return result;
    }

    function buildObjectVisual3D(state, object, presentation, name) {
        const colors = normalizeColors(state, object.colors || []);
        if (object.sprite3matrix)
            return buildSprite3MatrixVisual3D(state, object, colors, presentation);
        if (object.spritematrix && object.spritematrix.length > 0)
            return buildSpriteMatrixVisual3D(state, object, colors, presentation);

        throw new Error(`3D render frame requires object-owned sprite matrix data for "${name || "unnamed object"}".`);
    }

    function buildSpriteMatrixVisual3D(state, object, colors, presentation) {
        const matrix = object.spritematrix || [];
        const cells = spriteMatrixCells(matrix, colors);
        return {
            kind: "spritematrix",
            presentation,
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

    function buildSprite3MatrixVisual3D(state, object, colors, presentation) {
        const matrix = object.sprite3matrix || [];
        const cells = sprite3MatrixCells(matrix, colors);
        return {
            kind: "sprite3matrix",
            presentation,
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
                const color = presentationColorFromSpriteValue(value, colors);
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
                    const color = presentationColorFromSpriteValue(value, colors);
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

    function presentationColorFromSpriteValue(value, colors) {
        return normalizePresentationColor(colorFromSpriteValue(value, colors));
    }

    function colorFromSpriteValue(value, colors) {
        if (typeof value === "number")
            return colors[value] || "#ff00ff";
        if (typeof value === "string" && value.length === 1 && /[0-9a-zA-Z]/.test(value))
            return colors[spritePaletteIndex(value)] || "#ff00ff";
        return value || "#ff00ff";
    }

    function normalizePresentationColor(color) {
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
            const presentation = normalizePresentationColor(color);
            if (presentation.visible)
                return presentation.color;
        }
        return "transparent";
    }

    function buildDrawPlan3D(state, board, view) {
        return {
            objectGroups: buildObjectGroups(state),
            cellOrder: buildCellOrder3D(board, view)
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

    function buildRenderCells3D(board) {
        const cells = [];
        for (let index = 0; index < board.cellCount; index++) {
            const coord = board.indexToCoord(index);
            cells[index] = {
                index,
                x: coord.x,
                y: coord.y,
                z: coord.z,
                objectIds: objectIdsFromCell(board.getCell(index), board.objectCount)
            };
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

    function buildCellOrder3D(board, view) {
        const direction = cameraVectorFromYawPitch(view.yaw, view.pitch);
        const indices = [];
        for (let index = 0; index < board.cellCount; index++)
            indices.push(index);
        indices.sort((left, right) => {
            const a = board.indexToCoord(left);
            const b = board.indexToCoord(right);
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
            visibleRegion: normalizeVisibleRegion(requested.visibleRegion, board)
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
        return normalizeVisibleRegion({
            x: value[0],
            z: value[1],
            width: value[2],
            depth: value[3]
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
