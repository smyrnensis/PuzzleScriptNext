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

    function prepareCompiledState(compiledState, options) {
        return prepareCapabilities(compiledState && compiledState.hostCapabilities, options);
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
        if (root.location && root.location.protocol === "file:" && !/^(blob:|data:)/.test(moduleUrl))
            threeReadyPromise = loadThreeGlobalScript(opts.threeGlobalUrl || root.PUZZLE3D_THREE_GLOBAL_URL);
        else
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

    function loadThreeGlobalScript(scriptUrl) {
        if (root.THREE)
            return Promise.resolve(root.THREE);
        if (!scriptUrl)
            return Promise.reject(new Error("3D renderer cannot load Three.js modules from file://. Serve the game over HTTP, or provide PUZZLE3D_THREE_GLOBAL_URL for file:// playback."));
        if (!root.document || typeof root.document.createElement !== "function")
            return Promise.reject(new Error("3D renderer cannot load Three.js global fallback without document.createElement."));

        return new Promise((resolve, reject) => {
            const script = root.document.createElement("script");
            script.src = scriptUrl;
            script.onload = () => {
                if (root.THREE)
                    resolve(root.THREE);
                else
                    reject(new Error("3D renderer loaded Three.js global fallback, but window.THREE was not set."));
            };
            script.onerror = () => reject(new Error("3D renderer could not load Three.js global fallback."));
            const parent = root.document.head || root.document.documentElement || root.document.body;
            if (!parent || typeof parent.appendChild !== "function") {
                reject(new Error("3D renderer cannot append Three.js global fallback script."));
                return;
            }
            parent.appendChild(script);
        });
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

    function startPlayableLevel(compiledState, levelIndex, options) {
        if (!canStart())
            return false;

        const opts = options || {};
        root.state = compiledState;
        root.puzzle3DCompiledState = compiledState;
        root.puzzle3DRandomSeed = opts.randomseed;

        startSessionAtLevel(levelIndex || 0, compiledState);
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
        root.levelEditorOpened = false;
        root.oldflickscreendat = [];
        root.curLevelNo = levelIndex;
        const levels = typeof root.getPlayableLevels === "function"
            ? root.getPlayableLevels(state)
            : state && state.levels || [];
        root.curLevel = levels && levels[levelIndex] || null;
        const session = root.GameRuntime3D.createSessionFromState3D(state, {
            levelIndex
        });
        root.puzzle3DSession = session;
        renderSessionFrame(session, null, state);
        return session;
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
        const levels = typeof root.getPlayableLevels === "function"
            ? root.getPlayableLevels(state)
            : state && state.levels || [];
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
        const frameOptions = {
            state: compiledState
        };
        const frame = turnResult
            ? root.Puzzle3DRenderFrame.buildSessionTurnRenderFrame3D(turnResult, frameOptions)
            : root.Puzzle3DRenderFrame.buildSessionRenderFrame3D(session, frameOptions);
        root.puzzle3DRenderFrame = frame;
        root.Puzzle3DThreeRenderer.renderToCanvas(getRenderCanvas(), frame, {
            tweenElapsedMs: root.tweentimer || 0
        });
        syncTweenAnimationFlags(frame);
        return frame;
    }

    function redraw(compiledState) {
        if (!root.puzzle3DSession || root.textMode || root.titleScreen)
            return false;
        renderSessionFrame(root.puzzle3DSession, root.lastProcessInput3DResult, compiledState || root.puzzle3DCompiledState || root.state);
        return true;
    }

    function resetTweenTimerForTurn(result) {
        const movedEntities = result && result.turn && result.turn.movedEntities || {};
        if (Object.keys(movedEntities).length > 0)
            root.tweentimer = 0;
    }

    function syncTweenAnimationFlags(frame) {
        const tween = frame && frame.effects && frame.effects.tween;
        const active = !!(tween && tween.enabled && (root.tweentimer || 0) < tween.lengthMs);
        root.isAnimating = active;
        root.isTweening = active;
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
            scheduleBrowserWin();
        if (result.tailPlan && result.tailPlan.quitDeferred) {
            handleBrowserQuit();
            browserState.skipRender = true;
        }
        if (result.tailPlan && result.tailPlan.terminalAction)
            applyBrowserTerminalActionEffects(result.tailPlan.terminalAction);
        return browserState;
    }

    function scheduleBrowserWin() {
        if (root.winning)
            return;
        clearBrowserAgain();
        playBrowserSimpleSound("endlevel");
        root.winning = true;
        root.timer = 0;
    }

    function clearBrowserAgain() {
        root.againing = false;
    }

    function playBrowserSimpleSound(name) {
        const methodName = {
            cancel: "tryPlayCancelSound",
            endlevel: "tryPlayEndLevelSound",
            restart: "tryPlayRestartSound",
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
            return;
        }
        root.messagetext = message;
        if (typeof root.drawMessageScreen === "function")
            root.drawMessageScreen(root.messagetext);
        root.messageselected = false;
        if (typeof root.canvasResize === "function")
            root.canvasResize();
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
        prepareCompiledState,
        prepareCapabilities,
        ensureThree,
        ensureWebGL,
        startPlayableLevel,
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
    root.PuzzleHostCapabilities = root.PuzzleHostCapabilities || {};
    root.PuzzleHostCapabilities.prepareCompiledState = prepareCompiledState;
    root.PuzzleHostCapabilities.canStart = canStart;
    root.PuzzleHostCapabilities.restore = restore;
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
