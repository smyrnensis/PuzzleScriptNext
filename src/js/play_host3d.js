(function(root) {
    "use strict";

    let previousCanvas = null;
    let threeReadyPromise = null;
    let webGLReadyPromise = null;

    function canStart() {
        return !!(root
            && root.GameRuntime3D
            && root.Puzzle3DRenderFrame
            && root.Puzzle3DThreeRenderer
            && root.THREE);
    }

    function canPlayLevel(_compiledState, leveldat) {
        return !!(leveldat && leveldat.is3d);
    }

    function getLevelItems(compiledState) {
        return compiledState && Array.isArray(compiledState.levels)
            ? compiledState.levels
            : [];
    }

    function hasActiveSession() {
        return !!root.puzzle3DSession;
    }

    function hasActiveBrowserSession() {
        return hasActiveSession();
    }

    function prepareCompiledState(compiledState, options) {
        return prepareCapabilities(compiledState && compiledState.hostCapabilities, options);
    }

    function startCompiledState(compiledState, command, randomseed) {
        if (!hasThreeDimensionPlayableLevel(compiledState))
            throw new Error("3D playback host cannot start a state without playable 3D levels.");
        const cmd = command || ["restart"];
        const name = cmd[0] || "restart";
        if (name === "loadLevelEditor") {
            const editorIndex = resolve3DLevelIndex(compiledState, cmd[1]);
            if (openLevelEditor(compiledState, editorIndex, { randomseed }))
                return compiledState;
            throw new Error("3D level editor requires an editable 3D level.");
        }
        if (name === "rebuild" && root.puzzle3DSession) {
            if (rebuildPlayableLevel(compiledState, root.puzzle3DSession.levelIndex, { randomseed }))
                return compiledState;
            throw new Error("3D rebuild requires an active 3D session.");
        }
        if (typeof root.setGameState !== "function")
            throw new Error("3D playback host requires the 2D setGameState() flow boundary.");
        root.puzzle3DCompiledState = compiledState;
        root.puzzle3DRandomSeed = randomseed;
        root.setGameState(compiledState, cmd, randomseed);
        if (typeof root.clearInputHistory === "function")
            root.clearInputHistory();
        if (root.state === compiledState)
            return compiledState;
        throw new Error("3D playback host could not start the compiled state through setGameState().");
    }

    function resolve3DLevelIndex(compiledState, requestedIndex) {
        const levels = getLevelItems(compiledState);
        if (requestedIndex !== undefined && levels[requestedIndex] && levels[requestedIndex].is3d)
            return requestedIndex;
        for (let index = requestedIndex || 0; index < levels.length; index++) {
            if (levels[index] && levels[index].is3d)
                return index;
        }
        for (let index = 0; index < levels.length; index++) {
            if (levels[index] && levels[index].is3d)
                return index;
        }
        return requestedIndex || 0;
    }

    function prepareCapabilities(capabilities, options) {
        const list = capabilities || [];
        let ready = Promise.resolve();
        for (let i = 0; i < list.length; i++)
            ready = ready.then(() => prepareCapability(list[i], options));
        return ready;
    }

    function prepareCapability(capability, options) {
        if (!capability || !capability.requires)
            return Promise.resolve();
        let ready = Promise.resolve();
        for (let i = 0; i < capability.requires.length; i++) {
            const required = capability.requires[i];
            if (required === "THREE")
                ready = ready.then(() => ensureThree(options));
            else if (required === "webgl")
                ready = ready.then(() => ensureWebGL());
        }
        return ready;
    }

    function ensureThree(options) {
        if (root.THREE)
            return Promise.resolve(root.THREE);
        if (threeReadyPromise)
            return threeReadyPromise;

        const opts = options || {};
        const importModule = opts.importModule || (specifier => import(specifier));
        const moduleUrl = opts.threeModuleUrl || root.PUZZLE3D_THREE_MODULE_URL;
        if (!moduleUrl)
            return Promise.reject(new Error("3D renderer requires PUZZLE3D_THREE_MODULE_URL."));
        threeReadyPromise = importModule(moduleUrl).then(module => {
            root.THREE = module && module.default ? module.default : module;
            return root.THREE;
        });
        threeReadyPromise = threeReadyPromise.catch(err => {
            threeReadyPromise = null;
            throw err;
        });
        return threeReadyPromise;
    }

    function ensureWebGL() {
        if (webGLReadyPromise)
            return webGLReadyPromise;
        if (!root.document || typeof root.document.createElement !== "function")
            return Promise.resolve(null);

        webGLReadyPromise = new Promise((resolve, reject) => {
            const canvas = root.document.createElement("canvas");
            let context = null;
            try {
                context = canvas.getContext("webgl2")
                    || canvas.getContext("webgl")
                    || canvas.getContext("experimental-webgl");
            } catch (err) {
                context = null;
            }
            if (!context) {
                reject(new Error("3D renderer requires WebGL."));
                return;
            }
            resolve(context);
        }).catch(err => {
            webGLReadyPromise = null;
            throw err;
        });
        return webGLReadyPromise;
    }

    function hasThreeDimensionPlayableLevel(compiledState) {
        const levels = getLevelItems(compiledState);
        for (let i = 0; i < levels.length; i++) {
            if (levels[i] && levels[i].is3d)
                return true;
        }
        return false;
    }

    function startPlayableLevel(compiledState, levelIndex, options) {
        if (!canStart())
            return false;

        const opts = options || {};
        root.state = compiledState;
        root.puzzle3DCompiledState = compiledState;
        root.puzzle3DRandomSeed = opts.randomseed;

        const session = startSessionAtLevel(levelIndex || 0, compiledState);
        if (typeof root.clearInputHistory === "function")
            root.clearInputHistory();
        if (typeof root.canvasResize === "function")
            root.canvasResize();
        return true;
    }

    function startSessionAtLevel(levelIndex, compiledState) {
        const state = compiledState || root.puzzle3DCompiledState || root.state;
        root.textMode = false;
        root.titleScreen = false;
        root.messagetext = "";
        root.levelEditorOpened = false;
        root.oldflickscreendat = [];
        root.puzzle3DScreenCamera = null;
        root.lastProcessInput3DResult = null;
        root.curLevelNo = levelIndex;
        const levels = getLevelItems(state);
        root.curLevel = levels && levels[levelIndex] || null;
        const session = root.GameRuntime3D.createSessionFromState3D(state, {
            levelIndex
        });
        root.puzzle3DSession = session;
        renderSessionFrame(session, null, state);
        syncBrowserLoopBindings();
        return session;
    }

    function rebuildPlayableLevel(compiledState, levelIndex, options) {
        if (!canStart())
            return false;
        if (!root.puzzle3DSession)
            throw new Error("3D rebuild requires an active 3D session.");
        if (!root.GameRuntime3D || typeof root.GameRuntime3D.rebuildSessionFromState3D !== "function")
            throw new Error("3D rebuild requires GameRuntime3D.rebuildSessionFromState3D().");

        const opts = options || {};
        const index = levelIndex !== undefined ? levelIndex : root.puzzle3DSession.levelIndex;
        root.state = compiledState;
        root.puzzle3DCompiledState = compiledState;
        root.puzzle3DRandomSeed = opts.randomseed;
        root.puzzle3DScreenCamera = null;
        root.lastProcessInput3DResult = null;
        root.curLevelNo = index;
        const levels = getLevelItems(compiledState);
        root.curLevel = levels && levels[index] || root.curLevel;
        root.GameRuntime3D.rebuildSessionFromState3D(root.puzzle3DSession, compiledState, Object.assign({}, opts, {
            levelIndex: index
        }));
        renderSessionFrame(root.puzzle3DSession, null, compiledState);
        return true;
    }

    function syncLevelEditorBindings() {
        if (!root || typeof root.eval !== "function")
            return;
        const bindings = [
            "state",
            "puzzle3DCompiledState",
            "puzzle3DRandomSeed",
            "puzzle3DSession",
            "curLevelNo",
            "curLevel",
            "textMode",
            "titleScreen",
            "levelEditorOpened",
            "oldflickscreendat"
        ];
        for (let i = 0; i < bindings.length; i++) {
            const name = bindings[i];
            try {
                root.eval(name + " = globalThis." + name + ";");
            } catch (err) {
                // Some host tests and shells do not expose every browser binding.
            }
        }
    }

    function openLevelEditor(compiledState, levelIndex, options) {
        const state = compiledState || root.puzzle3DCompiledState || root.state;
        const index = levelIndex === undefined || levelIndex === null ? root.curLevelNo || 0 : levelIndex;
        const levels = getLevelItems(state);
        const level = levels && levels[index];
        if (!level || !level.is3d || !root.GameRuntime3D || !root.GameRuntime3D.createSessionFromState3D)
            return false;

        root.state = state;
        root.puzzle3DCompiledState = state;
        root.curLevelNo = index;
        root.curLevel = level;
        root.textMode = false;
        root.titleScreen = false;
        root.levelEditorOpened = true;
        root.oldflickscreendat = [];
        root.puzzle3DScreenCamera = null;
        root.lastProcessInput3DResult = null;

        if (!root.puzzle3DSession || root.puzzle3DSession.state !== state || root.puzzle3DSession.levelIndex !== index) {
            root.puzzle3DSession = root.GameRuntime3D.createSessionFromState3D(state, Object.assign({}, options || {}, {
                levelIndex: index
            }));
        }

        syncLevelEditorBindings();
        removeRenderCanvas();
        if (typeof root.canvasResize === "function")
            root.canvasResize();
        return true;
    }

    function processInput(inputDirection, dontDoWin, dontModify, bak, coord) {
        if (!root.puzzle3DSession)
            return false;
        const compiledState = root.puzzle3DCompiledState || root.state;
        const options = normalizeProcessInputOptions(dontDoWin, dontModify, bak, coord);
        const result = root.GameRuntime3D.processSessionTurn3D(
            root.puzzle3DSession,
            normalizeProcessInputDirection(inputDirection),
            options
        );
        root.lastProcessInput3DResult = result;
        const browserState = syncBrowserTurnState(result);
        const outputState = applyBrowserTurnOutputs(result);
        resetTweenTimerForTurn(result);
        if (!browserState.skipRender && !outputState.skipRender)
            renderSessionFrame(root.puzzle3DSession, result, compiledState);
        return !!(result
            && result.turn
            && (result.turn.changed || result.turn.boardChanged || result.turn.moved));
    }

    function restore() {
        if (!root)
            return;
        root.puzzle3DSession = null;
        root.puzzle3DRenderFrame = null;
        root.lastProcessInput3DResult = null;
        root.puzzle3DScreenCamera = null;
        removeRenderCanvas();
    }

    function normalizeProcessInputOptions(dontDoWin, dontModify, bak, coord) {
        return {
            dontDoWin: !!dontDoWin,
            dontModify: !!dontModify,
            backup: bak,
            coord,
            deferAgain: true,
            deferWin: true,
            deferQuit: true
        };
    }

    function normalizeProcessInputDirection(inputDirection) {
        if (inputDirection === -1 || inputDirection === undefined || inputDirection === null)
            return null;
        const direction = typeof inputDirection === "number" && root.dirNames && root.dirNames[inputDirection]
            ? root.dirNames[inputDirection]
            : inputDirection;
        return normalizeBrowser2DCarrierFor3D(direction);
    }

    function normalizeBrowser2DCarrierFor3D(direction) {
        if (direction === "up")
            return "front";
        if (direction === "down")
            return "back";
        return direction;
    }

    function renderSessionFrame(session, turnResult, compiledState) {
        const canvas = getRenderCanvas();
        const screenView = updateScreenView3D(session, compiledState, canvas);
        const frameOptions = {
            state: compiledState,
            view: Object.assign({
                viewportAspect: renderCanvasAspect(canvas)
            }, screenView)
        };
        const frame = turnResult
            ? root.Puzzle3DRenderFrame.buildSessionTurnRenderFrame3D(turnResult, frameOptions)
            : root.Puzzle3DRenderFrame.buildSessionRenderFrame3D(session, frameOptions);
        root.puzzle3DRenderFrame = frame;
        root.Puzzle3DThreeRenderer.renderToCanvas(canvas, frame, {
            tweenElapsedMs: root.tweentimer || 0
        });
        syncTweenAnimationFlags(frame, compiledState);
        return frame;
    }

    function renderCanvasAspect(canvas) {
        const width = canvas && (canvas.clientWidth || canvas.width) || 640;
        const height = canvas && (canvas.clientHeight || canvas.height) || 480;
        return width / Math.max(1, height);
    }

    function updateScreenView3D(session, compiledState, canvas) {
        if (!session || !session.runtime || !session.runtime.board)
            return {};
        const state = compiledState || session.state || {};
        const metadata = state.metadata || {};
        const viewport = screenViewport3D(metadata);
        const board = session.runtime.board;
        if (!viewport) {
            root.puzzle3DScreenCamera = null;
            return {};
        }

        const width = Math.min(positiveInteger(viewport[0], board.width), board.width);
        const depth = Math.min(positiveInteger(viewport[1], board.depth), board.depth);
        const player = firstPlayerCoord3D(board);
        let region = null;
        let cameraCenter = null;

        if (metadata.smoothscreen !== undefined) {
            const camera = updateSmoothCamera3D(session, metadata.smoothscreen, player, width, depth, canvas);
            if (camera) {
                region = regionFromCameraPosition3D(camera.position, board, width, depth);
                cameraCenter = { x: camera.position.x, z: camera.position.z };
            }
        } else {
            root.puzzle3DScreenCamera = null;
            region = regionFromPlayer3D(metadata, board, player, width, depth);
        }

        if (!region)
            return {};
        session.oldflickscreendat = [
            region.x,
            region.z,
            region.x + region.width,
            region.z + region.depth
        ];
        root.oldflickscreendat = session.oldflickscreendat.slice();
        return {
            visibleRegion: region,
            cameraCenter
        };
    }

    function screenViewport3D(metadata) {
        if (metadata.flickscreen !== undefined)
            return metadata.flickscreen;
        if (metadata.zoomscreen !== undefined)
            return metadata.zoomscreen;
        if (metadata.smoothscreen !== undefined && metadata.smoothscreen.screenSize)
            return [metadata.smoothscreen.screenSize.width, metadata.smoothscreen.screenSize.height];
        return null;
    }

    function regionFromPlayer3D(metadata, board, player, width, depth) {
        if (!player)
            return null;
        if (metadata.flickscreen !== undefined) {
            return {
                x: clampScreenMin(Math.floor(player.x / width) * width, board.width, width),
                z: clampScreenMin(Math.floor(player.z / depth) * depth, board.depth, depth),
                width,
                depth
            };
        }
        if (metadata.zoomscreen !== undefined) {
            return {
                x: centeredScreenMin(player.x, board.width, width),
                z: centeredScreenMin(player.z, board.depth, depth),
                width,
                depth
            };
        }
        return null;
    }

    function updateSmoothCamera3D(session, smoothscreenConfig, player, width, depth, canvas) {
        const board = session.runtime.board;
        let camera = root.puzzle3DScreenCamera;
        if (!player) {
            return camera && camera.session === session && camera.levelIndex === session.levelIndex
                ? camera
                : null;
        }
        if (!camera || camera.session !== session || camera.levelIndex !== session.levelIndex) {
            const target = smoothCameraTargetForPlayer3D(player, board, width, depth, smoothscreenConfig);
            camera = {
                session,
                levelIndex: session.levelIndex,
                position: Object.assign({}, target),
                target
            };
            root.puzzle3DScreenCamera = camera;
            return camera;
        }

        updateSmoothCameraTargetAxis3D(camera, player, smoothscreenConfig, "x", "width", width, board.width);
        updateSmoothCameraTargetAxis3D(camera, player, smoothscreenConfig, "z", "height", depth, board.depth);
        advanceSmoothCamera3D(camera, smoothscreenConfig, width, depth, canvas);
        return camera;
    }

    function smoothCameraTargetForPlayer3D(player, board, width, depth, smoothscreenConfig) {
        const boundary = smoothscreenConfig.boundarySize || {};
        return {
            x: smoothscreenConfig.flick
                ? flickCameraPosition(player.x, board.width, width, positiveInteger(boundary.width, width))
                : cameraPosition(player.x, board.width, width),
            z: smoothscreenConfig.flick
                ? flickCameraPosition(player.z, board.depth, depth, positiveInteger(boundary.height, depth))
                : cameraPosition(player.z, board.depth, depth)
        };
    }

    function updateSmoothCameraTargetAxis3D(camera, player, smoothscreenConfig, coord, boundaryName, screenDimension, levelDimension) {
        const boundary = smoothscreenConfig.boundarySize || {};
        const boundaryDimension = positiveInteger(boundary[boundaryName], 1);
        const playerVector = player[coord] - camera.target[coord];
        const direction = Math.sign(playerVector);
        const boundaryVector = direction > 0
            ? Math.ceil(boundaryDimension / 2)
            : -(Math.floor(boundaryDimension / 2) + 1);
        if (Math.abs(playerVector) - Math.abs(boundaryVector) < 0)
            return;
        camera.target[coord] = smoothscreenConfig.flick
            ? flickCameraPosition(player[coord], levelDimension, screenDimension, boundaryDimension)
            : cameraPosition(player[coord] - boundaryVector + direction, levelDimension, screenDimension);
    }

    function advanceSmoothCamera3D(camera, smoothscreenConfig, width, depth, canvas) {
        const speed = smoothCameraSpeed(smoothscreenConfig.cameraSpeed);
        const snap = smoothCameraSnapThreshold(width, depth, canvas);
        for (const coord of ["x", "z"]) {
            const delta = camera.target[coord] - camera.position[coord];
            if (delta === 0)
                continue;
            if (Math.abs(delta) < snap) {
                camera.position[coord] = camera.target[coord];
                continue;
            }
            camera.position[coord] += delta * speed;
        }
    }

    function regionFromCameraPosition3D(position, board, width, depth) {
        return {
            x: screenMinFromCameraPosition(position.x, board.width, width),
            z: screenMinFromCameraPosition(position.z, board.depth, depth),
            width,
            depth
        };
    }

    function firstPlayerCoord3D(board) {
        const playerMask = board.playerMask;
        if (!playerMask)
            return null;
        for (let index = 0; index < board.cellCount; index++) {
            if (anyBitsInCommon(board.getCell(index), playerMask))
                return board.indexToCoord(index);
        }
        return null;
    }

    function anyBitsInCommon(a, b) {
        const left = a && (a.data || a) || [];
        const right = b && (b.data || b) || [];
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
            if ((left[i] & right[i]) !== 0)
                return true;
        }
        return false;
    }

    function centeredScreenMin(position, dimension, screenDimension) {
        return Math.max(Math.min(position - Math.floor(screenDimension / 2), dimension - screenDimension), 0);
    }

    function screenMinFromCameraPosition(position, dimension, screenDimension) {
        return clampScreenMin(Math.floor(position) - Math.floor(screenDimension / 2), dimension, screenDimension);
    }

    function cameraPosition(targetPosition, levelDimension, screenDimension) {
        return Math.min(
            Math.max(targetPosition, Math.floor(screenDimension / 2)),
            levelDimension - Math.ceil(screenDimension / 2)
        );
    }

    function flickCameraPosition(targetPosition, levelDimension, screenDimension, boundaryDimension) {
        const flickGridOffset = Math.floor(screenDimension / 2) - Math.floor(boundaryDimension / 2);
        const flickGridPlayerPosition = targetPosition - flickGridOffset;
        const flickGridPlayerCell = Math.floor(flickGridPlayerPosition / boundaryDimension);
        const maxFlickGridCell = Math.floor((levelDimension - Math.ceil(screenDimension / 2) - Math.floor(boundaryDimension / 2) - flickGridOffset) / boundaryDimension);
        return Math.min(Math.max(flickGridPlayerCell, 0), maxFlickGridCell) * boundaryDimension + Math.floor(screenDimension / 2);
    }

    function clampScreenMin(value, dimension, screenDimension) {
        return Math.max(0, Math.min(value, Math.max(0, dimension - screenDimension)));
    }

    function smoothCameraSpeed(value) {
        const number = Number(value);
        if (!Number.isFinite(number))
            return 0.125;
        return Math.max(0, Math.min(number, 1));
    }

    function smoothCameraSnapThreshold(width, depth, canvas) {
        const pixelWidth = canvas && canvas.width ? canvas.width / Math.max(1, width) : 1;
        const pixelDepth = canvas && canvas.height ? canvas.height / Math.max(1, depth) : 1;
        return 0.5 / Math.max(1, Math.min(pixelWidth, pixelDepth));
    }

    function positiveInteger(value, fallback) {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 ? number : fallback;
    }

    function redraw(compiledState) {
        if (!root.puzzle3DSession || root.textMode || root.titleScreen)
            return false;
        renderSessionFrame(root.puzzle3DSession, currentSessionTurnResult(root.puzzle3DSession), compiledState || root.puzzle3DCompiledState || root.state);
        return true;
    }

    function currentSessionTurnResult(session) {
        const result = root.lastProcessInput3DResult;
        return result && result.session === session ? result : null;
    }

    function resetTweenTimerForTurn(result) {
        const movedEntities = result && result.turn && result.turn.movedEntities || {};
        if (Object.keys(movedEntities).length > 0)
            root.tweentimer = 0;
    }

    function syncTweenAnimationFlags(frame, compiledState) {
        const tween = frame && frame.effects && frame.effects.tween;
        const smooth = !!(compiledState && compiledState.metadata && compiledState.metadata.smoothscreen);
        const active = smooth || !!(tween && tween.enabled && (root.tweentimer || 0) < tween.lengthMs);
        root.isAnimating = active;
        root.isTweening = !!(tween && tween.enabled && (root.tweentimer || 0) < tween.lengthMs);
    }

    function syncBrowserTurnState(result) {
        const browserState = { skipRender: false };
        if (!result)
            return browserState;
        if (result.againScheduled) {
            root.againing = true;
            root.timer = 0;
        } else {
            root.againing = false;
        }
        if (result.tailPlan && result.tailPlan.winDeferred)
            triggerBrowserWin();
        if (result.tailPlan && result.tailPlan.quitDeferred) {
            handleBrowserQuit();
            browserState.skipRender = true;
        }
        if (result.tailPlan && result.tailPlan.terminalAction)
            applyBrowserTerminalActionEffects(result.tailPlan.terminalAction);
        syncBrowserLoopBindings();
        return browserState;
    }

    function triggerBrowserWin() {
        if (typeof root.DoWin !== "function")
            throw new Error("3D browser win flow requires the 2D DoWin() boundary.");
        root.DoWin();
    }

    function clearBrowserAgain() {
        syncBrowserLoopBinding("againing", false);
    }

    function syncBrowserLoopBinding(name, value) {
        root[name] = value;
        if (!root || typeof root.eval !== "function")
            return;
        const holder = "__puzzle3DBrowserLoopBindingValue";
        try {
            root[holder] = value;
            root.eval(name + " = globalThis." + holder + ";");
        } catch (err) {
            // Some host tests and shells do not expose every browser binding.
        } finally {
            try {
                delete root[holder];
            } catch (err) {
                root[holder] = undefined;
            }
        }
    }

    function syncBrowserLoopBindings() {
        if (!root || typeof root.eval !== "function")
            return;
        const bindings = [
            "state",
            "puzzle3DCompiledState",
            "puzzle3DSession",
            "puzzle3DRenderFrame",
            "lastProcessInput3DResult",
            "puzzle3DScreenCamera",
            "curLevelNo",
            "curLevel",
            "textMode",
            "titleScreen",
            "quittingMessageScreen",
            "messagetext",
            "messageselected",
            "ignoreNotJustPressedAction",
            "timer",
            "winning",
            "againing"
        ];
        for (let i = 0; i < bindings.length; i++) {
            const name = bindings[i];
            if (!Object.prototype.hasOwnProperty.call(root, name))
                continue;
            syncBrowserLoopBinding(name, root[name]);
        }
    }

    function playBrowserSimpleSound(name) {
        const methodName = {
            cancel: "tryPlayCancelSound",
            endlevel: "tryPlayEndLevelSound",
            restart: "tryPlayRestartSound",
            showmessage: "tryPlayShowMessageSound",
            undo: "tryPlayUndoSound"
        }[name];
        if (methodName && typeof root[methodName] === "function") {
            root[methodName]();
            return;
        }
        if (typeof root.tryPlaySimpleSound === "function")
            root.tryPlaySimpleSound(name);
    }

    function applyBrowserTurnOutputs(result) {
        const outputState = { skipRender: false };
        const artifacts = getTurnOutputArtifacts(result);
        if (!artifacts)
            return outputState;

        applyBrowserTurnSfx(result);
        applyBrowserSimpleSoundCommands(artifacts);
        if (artifacts.statusRequested)
            root.statusText = artifacts.statusText || "";
        if (artifacts.messageRequested) {
            showBrowserMessage(artifacts.messageText || "");
            outputState.skipRender = true;
        }
        return outputState;
    }

    function getTurnOutputArtifacts(result) {
        const turn = result && result.turn;
        if (!turn)
            return null;
        return turn.sessionArtifacts || turn.commandArtifacts || null;
    }

    function applyBrowserTurnSfx(result) {
        const sfx = result && result.turn && result.turn.sfxArtifacts;
        if (!sfx)
            return;
        root.seedsToAnimate = sfx.animations || {};
        const seeds = sfx.playSeeds || [];
        for (let i = 0; i < seeds.length; i++)
            playBrowserSeed(seeds[i]);
    }

    function playBrowserSeed(seed) {
        if (!seed)
            return;
        if (typeof root.playSeed !== "function")
            throw new Error("3D browser playback requires the 2D playSeed sound output.");
        root.playSeed(seed);
    }

    function applyBrowserSimpleSoundCommands(artifacts) {
        const commands = artifacts.simpleSoundCommands || [];
        for (let i = 0; i < commands.length; i++)
            playBrowserSimpleSound(commands[i]);
    }

    function showBrowserMessage(message) {
        removeRenderCanvas();
        if (typeof root.showTempMessage === "function") {
            root.showTempMessage(message);
            syncBrowserLoopBindings();
            return;
        }
        playBrowserSimpleSound("showmessage");
        root.textMode = true;
        root.titleScreen = false;
        root.messagetext = message;
        if (typeof root.drawMessageScreen === "function")
            root.drawMessageScreen(root.messagetext);
        root.messageselected = false;
        if (typeof root.clearInputHistory === "function")
            root.clearInputHistory();
        if (typeof root.canvasResize === "function")
            root.canvasResize();
        syncBrowserLoopBindings();
    }

    function handleBrowserQuit() {
        root.messagetext = "";
        return false;
    }

    function getRenderCanvas() {
        if (!root.document)
            return root.canvas;
        let canvas3D = root.document.getElementById("gameCanvas3D");
        if (canvas3D) {
            syncRenderCanvasSize(canvas3D);
            setActiveCanvas(canvas3D);
            return canvas3D;
        }

        const canvas2D = root.document.getElementById("gameCanvas") || root.canvas;
        canvas3D = root.document.createElement("canvas");
        canvas3D.id = "gameCanvas3D";
        canvas3D.width = canvas2D && canvas2D.width || 640;
        canvas3D.height = canvas2D && canvas2D.height || 480;
        canvas3D.tabIndex = canvas2D && canvas2D.tabIndex || 0;

        if (canvas2D && canvas2D.parentNode) {
            canvas2D.parentNode.insertBefore(canvas3D, canvas2D.nextSibling);
            canvas2D.style.display = "none";
        } else if (root.document.body) {
            root.document.body.appendChild(canvas3D);
        }
        syncRenderCanvasSize(canvas3D);
        setActiveCanvas(canvas3D);
        return canvas3D;
    }

    function syncRenderCanvasSize(canvas3D) {
        if (!canvas3D)
            return;
        const parent = canvas3D.parentNode;
        const width = parent && parent.clientWidth || canvas3D.width || 640;
        const height = parent && parent.clientHeight || canvas3D.height || 480;
        canvas3D.style = canvas3D.style || {};
        canvas3D.style.display = "block";
        canvas3D.style.width = width + "px";
        canvas3D.style.height = height + "px";
    }

    function setActiveCanvas(canvasElement) {
        if (!canvasElement)
            return;
        const oldCanvas = root.canvas || null;
        if (previousCanvas === null)
            previousCanvas = oldCanvas;
        root.canvas = canvasElement;
        migrateActiveCanvasTarget(oldCanvas, canvasElement);
        setGlobalCanvasBinding();
    }

    function restore2DCanvasBinding() {
        const canvas2D = root.document && root.document.getElementById("gameCanvas") || previousCanvas;
        if (canvas2D) {
            const oldCanvas = root.canvas || null;
            root.canvas = canvas2D;
            migrateActiveCanvasTarget(oldCanvas, canvas2D);
            setGlobalCanvasBinding();
        }
    }

    function migrateActiveCanvasTarget(oldCanvas, newCanvas) {
        if (!oldCanvas || !newCanvas)
            return;
        if (getGlobalLastDownTarget() === oldCanvas) {
            root.lastDownTarget = newCanvas;
            setGlobalLastDownTargetBinding();
        }
    }

    function handleSessionCommand(command) {
        if (!root.puzzle3DSession)
            return false;
        if (command !== "undo" && command !== "restart")
            return false;
        clearBrowserAgain();

        const artifacts = {
            queue: [command],
            undoRequested: command === "undo",
            restartRequested: command === "restart"
        };
        const turn = {
            changed: false,
            boardChanged: command === "restart",
            moved: false,
            inputDirection: command,
            sessionArtifacts: artifacts,
            commandArtifacts: { queue: [command] }
        };
        const plan = root.GameRuntime3D.applySessionArtifacts3D(root.puzzle3DSession, artifacts, turn, {});
        if (command === "restart")
            root.puzzle3DScreenCamera = null;
        if (plan && plan.terminalAction)
            applyBrowserTerminalActionEffects(plan.terminalAction);
        root.lastProcessInput3DResult = {
            session: root.puzzle3DSession,
            turn,
            turns: [turn]
        };
        renderSessionFrame(root.puzzle3DSession, root.lastProcessInput3DResult, root.state);
        return true;
    }

    function showEditorCanvas() {
        removeRenderCanvas();
        return true;
    }

    function applyBrowserTerminalActionEffects(action) {
        if (!action)
            return;
        if (action.type === "restart")
            playBrowserSimpleSound("restart");
        else if (action.type === "undo")
            playBrowserSimpleSound("undo");
        else if (action.type === "cancel")
            playBrowserSimpleSound("cancel");
    }

    function removeRenderCanvas(options) {
        if (!root.document)
            return;
        if (root.puzzle3DThreeRenderer && typeof root.puzzle3DThreeRenderer.dispose === "function") {
            root.puzzle3DThreeRenderer.dispose();
            root.puzzle3DThreeRenderer = null;
        }
        const canvas3D = root.document.getElementById("gameCanvas3D");
        if (canvas3D && canvas3D.parentNode)
            canvas3D.parentNode.removeChild(canvas3D);
        const canvas2D = root.document.getElementById("gameCanvas");
        if (canvas2D) {
            canvas2D.style.display = "";
            restore2DCanvasBinding();
        }
    }

    function setGlobalCanvasBinding() {
        if (typeof root.eval !== "function")
            return;
        try {
            root.eval("canvas = globalThis.canvas;");
        } catch (err) {
            // Some test hosts do not expose browser global bindings.
        }
    }

    function getGlobalLastDownTarget() {
        if (typeof root.eval === "function") {
            try {
                return root.eval("lastDownTarget;");
            } catch (err) {
                // Some test hosts do not expose browser global bindings.
            }
        }
        return root.lastDownTarget;
    }

    function setGlobalLastDownTargetBinding() {
        if (typeof root.eval !== "function")
            return;
        try {
            root.eval("lastDownTarget = globalThis.lastDownTarget;");
        } catch (err) {
            // Some test hosts do not expose browser global bindings.
        }
    }

    const api = {
        canStart,
        canPlayLevel,
        hasActiveSession,
        hasActiveBrowserSession,
        prepareCompiledState,
        startCompiledState,
        prepareCapabilities,
        ensureThree,
        ensureWebGL,
        startPlayableLevel,
        rebuildPlayableLevel,
        openLevelEditor,
        processInput,
        handleSessionCommand,
        showEditorCanvas,
        redraw,
        restore,
        normalizeProcessInputDirection,
        normalizeBrowser2DCarrierFor3D,
        normalizeProcessInputOptions
    };

    root.Puzzle3DPlayHost = api;
    root.PuzzleExternalPlayableHosts = root.PuzzleExternalPlayableHosts || [];
    if (root.PuzzleExternalPlayableHosts.indexOf(api) < 0)
        root.PuzzleExternalPlayableHosts.push(api);
    root.PuzzleHostCapabilities = root.PuzzleHostCapabilities || {};
    root.PuzzleHostCapabilities.prepareCompiledState = prepareCompiledState;
    root.PuzzleHostCapabilities.startCompiledState = startCompiledState;
    root.PuzzleHostCapabilities.hasActiveBrowserSession = hasActiveBrowserSession;
    root.PuzzleHostCapabilities.processBrowserInput = processInput;
    root.PuzzleHostCapabilities.handleSessionCommand = handleSessionCommand;
    root.PuzzleHostCapabilities.canStart = canStart;
    root.PuzzleHostCapabilities.restore = restore;
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
