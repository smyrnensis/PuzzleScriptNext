const assert = require("assert");

function loadPlayHostWithWindow(windowObject) {
    global.window = windowObject;
    delete require.cache[require.resolve("../src/js/play_host3d.js")];
    return require("../src/js/play_host3d.js");
}

function makeBoard3D(width, height, depth, playerCoord) {
    const cells = new Int32Array(width * height * depth);
    const board = {
        width,
        height,
        depth,
        cellCount: cells.length,
        playerMask: new Int32Array([1]),
        getCell(index) {
            return new Int32Array([cells[index]]);
        },
        indexToCoord(index) {
            const yz = height * depth;
            const x = Math.floor(index / yz);
            const rest = index - x * yz;
            const y = Math.floor(rest / depth);
            const z = rest - y * depth;
            return { x, y, z };
        },
        setPlayer(coord) {
            cells.fill(0);
            cells[coord.x * height * depth + coord.y * depth + coord.z] = 1;
        }
    };
    board.setPlayer(playerCoord);
    return board;
}

function frameFromView(view) {
    return {
        kind: "frame",
        view,
        effects: {
            tween: {
                enabled: false,
                lengthMs: 0,
                movedEntities: {}
            }
        }
    };
}

function testCanStartRequiresRuntimeRenderFrameRendererAndThree() {
    let host = loadPlayHostWithWindow({});
    assert.strictEqual(host.canStart(), false);

    host = loadPlayHostWithWindow({
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {}
    });
    assert.strictEqual(host.canStart(), false);

    host = loadPlayHostWithWindow({
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {},
        THREE: {}
    });
    assert.strictEqual(host.canStart(), true);

    delete global.window;
}

function testRegistersAsExternalPlayableHostFor3DLevels() {
    const hostWindow = {};
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.canPlayLevel({}, { is3d: true }), true);
    assert.strictEqual(host.canPlayLevel({}, { width: 1, height: 1 }), false);
    assert.strictEqual(hostWindow.PuzzleExternalPlayableHosts.includes(host), true);
    assert.strictEqual(hostWindow.PuzzleHostCapabilities.handleSessionCommand, host.handleSessionCommand);

    delete global.window;
}

function testStartPlayableLevelUsesBrowserPlaybackContract() {
    const compiledState = { title: "host test", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    let renderedCanvas = null;
    let renderedFrame = null;

    const hostWindow = {
        THREE: {},
        RNG: function RNG(seed) {
            this.seed = seed;
        },
        canvas: { id: "gameCanvas" },
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
        processInput: () => false,
        GameRuntime3D: {
            createSessionFromState3D: state => {
                calls.push(["createSession", state]);
                return session;
            },
            processSessionTurn3D: (actualSession, direction, options) => {
                calls.push(["processTurn", actualSession, direction, options]);
                return {
                    session: actualSession,
                    turn: { changed: true, boardChanged: true, moved: true },
                    turns: [],
                    sessionState: { levelIndex: 0 }
                };
            },
            applySessionArtifacts3D: (actualSession, artifacts, turn, options) => {
                calls.push(["sessionCommand", actualSession, artifacts, turn.inputDirection, options]);
                return { terminalAction: { type: artifacts.queue[0] } };
            }
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: (actualSession, options) => {
                calls.push(["initialFrame", actualSession, options.state]);
                return { kind: "initial-frame" };
            },
            buildSessionTurnRenderFrame3D: (result, options) => {
                calls.push(["turnFrame", result.session, options.state]);
                return { kind: "turn-frame" };
            }
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (canvas, frame) => {
                renderedCanvas = canvas;
                renderedFrame = frame;
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: 123 }), true);
    assert.strictEqual(hostWindow.state, compiledState);
    assert.strictEqual(hostWindow.puzzle3DSession, session);
    assert.strictEqual(renderedCanvas, hostWindow.canvas);
    assert.deepStrictEqual(renderedFrame, { kind: "initial-frame" });

    const changed = host.processInput(0, true, false, "backup", 12);

    assert.strictEqual(changed, true);
    assert.deepStrictEqual(calls, [
        ["createSession", compiledState],
        ["initialFrame", session, compiledState],
        ["processTurn", session, "front", { dontDoWin: true, dontModify: false, backup: "backup", coord: 12, deferAgain: true, deferWin: true, deferQuit: true }],
        ["turnFrame", session, compiledState]
    ]);
    assert.deepStrictEqual(renderedFrame, { kind: "turn-frame" });

    host.restore();
    assert.strictEqual(hostWindow.puzzle3DSession, null);
    delete global.window;
}

function testStartPlayableLevelDoesNotLetStaleTurnFrameOverwriteInitialFrame() {
    const compiledState = { title: "host stale turn test", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: compiledState };
    const staleSession = { runtime: {}, state: compiledState };
    const renderCalls = [];
    let host = null;
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        lastProcessInput3DResult: {
            session: staleSession,
            turn: { changed: true },
            turns: []
        },
        canvasResize: () => {
            host.redraw(compiledState);
        },
        GameRuntime3D: {
            createSessionFromState3D: () => session
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: actualSession => {
                assert.strictEqual(actualSession, session);
                return { kind: "initial-frame" };
            },
            buildSessionTurnRenderFrame3D: () => ({ kind: "stale-turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => {
                renderCalls.push(frame.kind);
            }
        }
    };
    host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.lastProcessInput3DResult, null);
    assert.deepStrictEqual(renderCalls, ["initial-frame", "initial-frame"]);

    host.restore();
    delete global.window;
}

function testRebuildPlayableLevelRefreshesSessionThroughLifecycleAdapter() {
    const oldState = { title: "old 3d", levels: [{ is3d: true }] };
    const newState = { title: "new 3d", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: oldState, levelIndex: 0 };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        state: oldState,
        puzzle3DCompiledState: oldState,
        puzzle3DSession: session,
        curLevelNo: 0,
        curLevel: oldState.levels[0],
        getPlayableLevels: state => state.levels,
        GameRuntime3D: {
            rebuildSessionFromState3D(actualSession, actualState, options) {
                calls.push(["rebuildSession", actualSession, actualState, options]);
                actualSession.state = actualState;
                return actualSession;
            }
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D(actualSession, options) {
                calls.push(["frame", actualSession, options.state]);
                return { kind: "rebuilt-frame" };
            }
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas(_canvas, frame) {
                calls.push(["render", frame.kind]);
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.rebuildPlayableLevel(newState, 0, { randomseed: "seed-rebuild" }), true);

    assert.strictEqual(hostWindow.state, newState);
    assert.strictEqual(hostWindow.puzzle3DCompiledState, newState);
    assert.strictEqual(hostWindow.puzzle3DRandomSeed, "seed-rebuild");
    assert.strictEqual(hostWindow.puzzle3DSession, session);
    assert.deepStrictEqual(calls, [
        ["rebuildSession", session, newState, { randomseed: "seed-rebuild", levelIndex: 0 }],
        ["frame", session, newState],
        ["render", "rebuilt-frame"]
    ]);

    host.restore();
    delete global.window;
}

function testRedrawRejectsTurnResultFromDifferentSession() {
    const compiledState = { title: "host stale redraw test", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: compiledState };
    const staleSession = { runtime: {}, state: compiledState };
    const renderCalls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        GameRuntime3D: {
            createSessionFromState3D: () => session
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "initial-frame" }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "stale-turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => {
                renderCalls.push(frame.kind);
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    hostWindow.lastProcessInput3DResult = {
        session: staleSession,
        turn: { changed: true },
        turns: []
    };
    assert.strictEqual(host.redraw(compiledState), true);
    assert.deepStrictEqual(renderCalls.slice(-1), ["initial-frame"]);

    host.restore();
    delete global.window;
}

function testOpenLevelEditorCreates3DBoardWithoutRendererContract() {
    const compiledState = { title: "host editor test", levels: [{ is3d: true, width: 2, height: 2, depth: 2 }] };
    const session = { runtime: { board: { width: 2, height: 2, depth: 2 } }, state: compiledState, levelIndex: 0 };
    const calls = [];
    const lexicalBindings = {};
    const hostWindow = {
        curLevelNo: 0,
        levelEditorOpened: false,
        textMode: true,
        titleScreen: true,
        getPlayableLevels: state => state.levels,
        canvasResize: () => calls.push(["canvasResize"]),
        eval(source) {
            const match = source.match(/^([A-Za-z0-9_]+) = globalThis\.([A-Za-z0-9_]+);$/);
            if (!match || match[1] !== match[2])
                throw new Error(`unexpected eval source: ${source}`);
            lexicalBindings[match[1]] = hostWindow[match[1]];
            return lexicalBindings[match[1]];
        },
        GameRuntime3D: {
            createSessionFromState3D: (state, options) => {
                calls.push(["createSession", state, options.levelIndex]);
                return session;
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.canStart(), false);
    assert.strictEqual(host.openLevelEditor(compiledState, 0), true);
    assert.strictEqual(hostWindow.state, compiledState);
    assert.strictEqual(hostWindow.puzzle3DCompiledState, compiledState);
    assert.strictEqual(hostWindow.puzzle3DSession, session);
    assert.strictEqual(hostWindow.curLevel, compiledState.levels[0]);
    assert.strictEqual(hostWindow.levelEditorOpened, true);
    assert.strictEqual(hostWindow.textMode, false);
    assert.strictEqual(hostWindow.titleScreen, false);
    assert.strictEqual(lexicalBindings.curLevelNo, 0);
    assert.strictEqual(lexicalBindings.curLevel, compiledState.levels[0]);
    assert.strictEqual(lexicalBindings.puzzle3DSession, session);
    assert.strictEqual(lexicalBindings.levelEditorOpened, true);
    assert.strictEqual(lexicalBindings.textMode, false);
    assert.strictEqual(lexicalBindings.titleScreen, false);
    assert.deepStrictEqual(calls, [
        ["createSession", compiledState, 0],
        ["canvasResize"]
    ]);
    delete global.window;
}

function testActiveCanvasMigrationCarriesExistingKeyboardGateTarget() {
    const compiledState = { title: "host focus test", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const canvas2D = { id: "gameCanvas", style: {}, parentNode: { insertBefore: () => {} } };
    const canvas3D = { id: "gameCanvas3D", style: {} };
    let lexicalCanvas = canvas2D;
    let lexicalLastDownTarget = canvas2D;
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: canvas2D,
        document: {
            getElementById: id => id === "gameCanvas" ? canvas2D : id === "gameCanvas3D" ? canvas3D : null,
            createElement: () => canvas3D
        },
        eval(source) {
            if (source === "canvas = globalThis.canvas;") {
                lexicalCanvas = hostWindow.canvas;
                return lexicalCanvas;
            }
            if (source === "lastDownTarget;")
                return lexicalLastDownTarget;
            if (source === "lastDownTarget = globalThis.lastDownTarget;") {
                lexicalLastDownTarget = hostWindow.lastDownTarget;
                return lexicalLastDownTarget;
            }
            throw new Error(`unexpected eval source: ${source}`);
        },
        processInput: () => false,
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({ session, turn: {}, turns: [] }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.canvas, canvas3D);
    assert.strictEqual(hostWindow.lastDownTarget, canvas3D);
    assert.strictEqual(lexicalCanvas, canvas3D);
    assert.strictEqual(lexicalLastDownTarget, canvas3D);

    host.restore();
    assert.strictEqual(hostWindow.canvas, canvas2D);
    assert.strictEqual(hostWindow.lastDownTarget, canvas2D);
    assert.strictEqual(lexicalCanvas, canvas2D);
    assert.strictEqual(lexicalLastDownTarget, canvas2D);
    delete global.window;
}

function testProcessInputBridgeMaps2DBrowserVerticalCarrierTo3DDepth() {
    const hostWindow = {
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"]
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.normalizeProcessInputDirection(0), "front");
    assert.strictEqual(host.normalizeProcessInputDirection(1), "left");
    assert.strictEqual(host.normalizeProcessInputDirection(2), "back");
    assert.strictEqual(host.normalizeProcessInputDirection(3), "right");
    assert.strictEqual(host.normalizeProcessInputDirection(4), "action");
    assert.strictEqual(host.normalizeProcessInputDirection(-1), null);
    assert.strictEqual(host.normalizeProcessInputDirection("up"), "front");
    assert.strictEqual(host.normalizeProcessInputDirection("down"), "back");
    assert.strictEqual(host.normalizeProcessInputDirection("front"), "front");

    delete global.window;
}

function testRedrawBridgeCarries2DTweenTimerInto3DRenderer() {
    const compiledState = { title: "host tween test", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: compiledState };
    const renderCalls = [];
    const tweenFrame = {
        kind: "turn-frame",
        effects: {
            tween: {
                enabled: true,
                lengthMs: 50,
                movedEntities: { "p1-l1": 8 }
            }
        }
    };
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
        processInput: () => false,
        redraw: () => renderCalls.push(["redraw2d"]),
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({
                session,
                turn: {
                    changed: true,
                    boardChanged: true,
                    moved: true,
                    movedEntities: { "p1-l1": 8 }
                },
                turns: []
            }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({
                kind: "initial-frame",
                effects: { tween: { enabled: false, lengthMs: 0, movedEntities: {} } }
            }),
            buildSessionTurnRenderFrame3D: () => tweenFrame
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame, options) => {
                renderCalls.push(["render", frame.kind, options.tweenElapsedMs]);
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(host.processInput(3), true);
    assert.strictEqual(hostWindow.tweentimer, 0);
    assert.strictEqual(hostWindow.isAnimating, true);
    assert.deepStrictEqual(renderCalls.slice(-1), [["render", "turn-frame", 0]]);

    hostWindow.tweentimer = 25;
    host.redraw();
    assert.deepStrictEqual(renderCalls.slice(-1), [["render", "turn-frame", 25]]);
    assert.strictEqual(hostWindow.isAnimating, true);

    hostWindow.tweentimer = 50;
    host.redraw();
    assert.deepStrictEqual(renderCalls.slice(-1), [["render", "turn-frame", 50]]);
    assert.strictEqual(hostWindow.isAnimating, false);
    assert.strictEqual(hostWindow.isTweening, false);

    host.restore();
    delete global.window;
}

function testSmoothScreenKeepsBrowserRedrawLoopActiveWithoutTween() {
    const compiledState = {
        title: "host smoothscreen test",
        metadata: { smoothscreen: { screenSize: { width: 3, height: 3 } } },
        levels: [{ is3d: true }]
    };
    const session = { runtime: {}, state: compiledState };
    const renderCalls = [];
    const frame = {
        kind: "smooth-frame",
        effects: { tween: { enabled: false, lengthMs: 0, movedEntities: {} } }
    };
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            updateSessionScreenRegion3D: () => []
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => frame
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, actualFrame) => {
                renderCalls.push(actualFrame.kind);
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.isAnimating, true);
    assert.strictEqual(hostWindow.isTweening, false);
    host.redraw(compiledState);
    assert.deepStrictEqual(renderCalls, ["smooth-frame", "smooth-frame"]);

    host.restore();
    delete global.window;
}

function testPlayHostProjectsFlickscreenCarrierFromPlayerOver3DXZPlane() {
    const board = makeBoard3D(6, 1, 6, { x: 4, y: 0, z: 4 });
    const compiledState = {
        title: "host flickscreen carrier test",
        metadata: { flickscreen: [3, 3] },
        levels: [{ is3d: true }]
    };
    const session = { runtime: { board }, state: compiledState, levelIndex: 0, oldflickscreendat: [] };
    const views = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas", width: 300, height: 300 },
        oldflickscreendat: [],
        GameRuntime3D: {
            createSessionFromState3D: () => session
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: (_session, options) => {
                views.push(options.view);
                return frameFromView(options.view);
            }
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: () => {}
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.deepStrictEqual(views[0].visibleRegion, { x: 3, z: 3, width: 3, depth: 3 });
    assert.strictEqual(views[0].cameraCenter, null);
    assert.deepStrictEqual(session.oldflickscreendat, [3, 3, 6, 6]);
    assert.deepStrictEqual(hostWindow.oldflickscreendat, [3, 3, 6, 6]);

    host.restore();
    delete global.window;
}

function testPlayHostSmoothscreenUses2DTargetAndRenderLoopCarriersOver3DXZPlane() {
    const board = makeBoard3D(6, 1, 6, { x: 1, y: 0, z: 1 });
    const compiledState = {
        title: "host smoothscreen carrier test",
        metadata: {
            smoothscreen: {
                screenSize: { width: 3, height: 3 },
                boundarySize: { width: 1, height: 1 },
                cameraSpeed: 0.125
            }
        },
        levels: [{ is3d: true }]
    };
    const session = { runtime: { board }, state: compiledState, levelIndex: 0, oldflickscreendat: [] };
    const views = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas", width: 300, height: 300 },
        oldflickscreendat: [],
        GameRuntime3D: {
            createSessionFromState3D: () => session
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: (_session, options) => {
                views.push(options.view);
                return frameFromView(options.view);
            }
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: () => {}
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.deepStrictEqual(views[0].visibleRegion, { x: 0, z: 0, width: 3, depth: 3 });
    assert.deepStrictEqual(views[0].cameraCenter, { x: 1, z: 1 });

    board.setPlayer({ x: 4, y: 0, z: 1 });
    assert.strictEqual(host.redraw(compiledState), true);

    assert.strictEqual(views[1].cameraCenter.x, 1.375);
    assert.strictEqual(views[1].cameraCenter.z, 1);
    assert.deepStrictEqual(session.oldflickscreendat, [0, 0, 3, 3]);
    assert.strictEqual(hostWindow.isAnimating, true);
    assert.strictEqual(hostWindow.isTweening, false);

    assert.strictEqual(host.redraw(compiledState), true);
    assert.strictEqual(views[2].cameraCenter.x, 1.703125);
    assert.strictEqual(views[2].cameraCenter.z, 1);
    assert.strictEqual(hostWindow.isAnimating, true);

    host.restore();
    delete global.window;
}

function testSessionCommandHelperDoesNotPatch2DGlobals() {
    const compiledState = { title: "host command test", levels: [{ is3d: true }] };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const canvas2D = { id: "gameCanvas", style: {}, parentNode: { insertBefore: () => {} } };
    const canvas3D = { id: "gameCanvas3D", style: {} };
    let lexicalAgaining = true;
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: canvas2D,
        againing: true,
        document: {
            getElementById: id => id === "gameCanvas" ? canvas2D : null,
            createElement: tag => {
                assert.strictEqual(tag, "canvas");
                return canvas3D;
            }
        },
        eval(source) {
            if (source === "againing = globalThis.__puzzle3DBrowserLoopBindingValue;") {
                lexicalAgaining = hostWindow.__puzzle3DBrowserLoopBindingValue;
                return lexicalAgaining;
            }
            throw new Error(`unexpected eval source: ${source}`);
        },
        processInput: () => false,
        DoUndo: function DoUndo2D() {
            calls.push(["DoUndo2D"]);
        },
        DoRestart: function DoRestart2D() {
            calls.push(["DoRestart2D"]);
        },
        tryPlayUndoSound: () => calls.push(["tryPlayUndoSound"]),
        tryPlayRestartSound: () => calls.push(["tryPlayRestartSound"]),
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => {
                throw new Error("session keyboard commands should not run an input turn");
            },
            applySessionArtifacts3D: (actualSession, artifacts, turn, options) => {
                calls.push(["applySessionArtifacts3D", actualSession, artifacts, turn.inputDirection, options]);
                return { terminalAction: { type: artifacts.queue[0] } };
            }
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "initial-frame" }),
            buildSessionTurnRenderFrame3D: result => {
                calls.push(["turnFrame", result.turn.inputDirection]);
                return { kind: "turn-frame", command: result.turn.inputDirection };
            }
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame])
        }
    };
    const originalDoUndo = hostWindow.DoUndo;
    const originalDoRestart = hostWindow.DoRestart;
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.DoUndo, originalDoUndo);
    assert.strictEqual(hostWindow.DoRestart, originalDoRestart);
    calls.length = 0;

    assert.strictEqual(host.handleSessionCommand("undo"), true);
    assert.strictEqual(hostWindow.againing, false);
    assert.strictEqual(lexicalAgaining, false);
    hostWindow.againing = true;
    lexicalAgaining = true;
    assert.strictEqual(host.handleSessionCommand("restart"), true);
    assert.strictEqual(hostWindow.againing, false);
    assert.strictEqual(lexicalAgaining, false);

    assert.deepStrictEqual(calls, [
        ["applySessionArtifacts3D", session, { queue: ["undo"], undoRequested: true, restartRequested: false }, "undo", {}],
        ["tryPlayUndoSound"],
        ["turnFrame", "undo"],
        ["render", { kind: "turn-frame", command: "undo" }],
        ["applySessionArtifacts3D", session, { queue: ["restart"], undoRequested: false, restartRequested: true }, "restart", {}],
        ["tryPlayRestartSound"],
        ["turnFrame", "restart"],
        ["render", { kind: "turn-frame", command: "restart" }]
    ]);
    delete global.window;
}

function testStartCompiledStateUses2DSetGameStateFlowBoundary() {
    const compiledState = {
        title: "title shell test",
        metadata: {},
        levels: [{ is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        clearInputHistory: () => calls.push(["clearInputHistory"]),
        setGameState: (state, command, randomseed) => {
            calls.push(["setGameState", state, command, randomseed]);
            hostWindow.state = state;
        },
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startCompiledState(compiledState, ["restart"], null), compiledState);
    assert.deepStrictEqual(calls, [
        ["setGameState", compiledState, ["restart"], null],
        ["clearInputHistory"]
    ]);
    delete global.window;
}

function test3DHostRejectsNon3DCompiledState() {
    const hostWindow = {
        THREE: {},
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {}
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.throws(
        () => host.startCompiledState({ metadata: {}, levels: [{ width: 1, height: 1 }] }, ["restart"], null),
        /cannot start a state without playable 3D levels/
    );
    delete global.window;
}

function testHostDoesNotOwnBrowserLevelSelectFlow() {
    const compiledState = {
        title: "level select shell test",
        metadata: {},
        levels: [{ is3d: true }, { is3d: true }, { is3d: true }],
        sections: [{ firstLevel: 0 }, { firstLevel: 2 }]
    };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        processInput: () => false,
        GameRuntime3D: {
            createSessionFromState3D: (_state, options) => {
                calls.push(["createSession", options.levelIndex]);
                return { runtime: {}, state: compiledState };
            },
            processSessionTurn3D: () => ({ session: {}, turn: {}, turns: [] }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: () => {}
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.deepStrictEqual(calls, [
        ["createSession", 0]
    ]);
    delete global.window;
}

function testRestartGlobalRemains2DOwnedDuring3DSession() {
    const compiledState = {
        title: "pause shell test",
        metadata: { enable_pause: true, level_select: true },
        levels: [{ is3d: true, title: "level one" }],
        sections: [{ firstLevel: 0 }]
    };
    const calls = [];
    const session = { runtime: {}, state: compiledState };
    const canvas2D = { id: "gameCanvas", style: {}, parentNode: { insertBefore: () => {} } };
    const canvas3D = { id: "gameCanvas3D", style: {}, parentNode: { removeChild: child => calls.push(["removeCanvas", child.id]) } };
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: canvas2D,
        document: {
            getElementById: id => id === "gameCanvas" ? canvas2D : id === "gameCanvas3D" ? canvas3D : null,
            createElement: () => canvas3D
        },
        processInput: () => false,
        DoRestart: () => calls.push(["DoRestart2D"]),
        gotoLevelSelectScreen: () => calls.push(["gotoLevelSelectScreen"]),
        generateTitleScreen: () => calls.push(["generateTitleScreen"]),
        canvasResize: () => calls.push(["canvasResize"]),
        showContinueOptionOnTitleScreen: () => false,
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({ session, turn: {}, turns: [] }),
            applySessionArtifacts3D: (_session, artifacts, turn) => {
                calls.push(["applySessionArtifacts3D", artifacts.queue[0], turn.inputDirection]);
                return {};
            }
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" }),
            buildSessionTurnRenderFrame3D: result => ({ kind: "turn-frame", input: result.turn.inputDirection })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind, frame.input])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);
    const originalDoRestart = hostWindow.DoRestart;

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.DoRestart, originalDoRestart);
    calls.length = 0;

    hostWindow.DoRestart();
    assert.deepStrictEqual(calls, [["DoRestart2D"]]);
    delete global.window;
}

function testCommandMessageDoesNotInstallBrowserMessageFlow() {
    const compiledState = {
        title: "message command shell test",
        metadata: {},
        levels: [{ is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        processInput: () => false,
        curLevelNo: 0,
        curlevelTarget: null,
        showTempMessage: message => {
            calls.push(["showTempMessage", message]);
            hostWindow.textMode = true;
            hostWindow.titleScreen = false;
            hostWindow.messagetext = message;
        },
        canvasResize: () => calls.push(["canvasResize"]),
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({
                session,
                turn: {
                    changed: true,
                    boardChanged: true,
                    moved: false,
                    sessionArtifacts: {
                        messageRequested: true,
                        messageText: "hello"
                    }
                },
                turns: []
            }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.strictEqual(hostWindow.textMode, true);
    assert.deepStrictEqual(calls, [
        ["showTempMessage", "hello"]
    ]);
    assert.strictEqual(hostWindow.puzzle3DSession, session);
    delete global.window;
}

function testCommandStatusAndSimpleSfxUse2DBrowserOutputs() {
    const compiledState = {
        title: "status sfx command shell test",
        metadata: {},
        levels: [{ is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        processInput: () => false,
        statusText: "",
        tryPlaySimpleSound: sound => calls.push(["tryPlaySimpleSound", sound]),
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({
                session,
                turn: {
                    changed: true,
                    boardChanged: true,
                    moved: false,
                    sessionArtifacts: {
                        statusRequested: true,
                        statusText: "ready",
                        simpleSoundCommands: ["sfx0", "sfx12"]
                    }
                },
                turns: []
            }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.strictEqual(hostWindow.statusText, "ready");
    assert.deepStrictEqual(calls, [
        ["tryPlaySimpleSound", "sfx0"],
        ["tryPlaySimpleSound", "sfx12"],
        ["render", "turn-frame"]
    ]);
    delete global.window;
}

function testTurnSfxArtifactsUse2DBrowserSeedOutput() {
    const compiledState = {
        title: "turn sfx artifact shell test",
        metadata: {},
        levels: [{ is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        processInput: () => false,
        playSeed: seed => calls.push(["playSeed", seed]),
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({
                session,
                turn: {
                    changed: true,
                    boardChanged: true,
                    moved: true,
                    sessionArtifacts: {},
                    sfxArtifacts: {
                        playSeeds: ["36772507"],
                        animations: { "2,4": { kind: "move", seed: "afx0", dir: 8 } }
                    }
                },
                turns: []
            }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.deepStrictEqual(hostWindow.seedsToAnimate, {
        "2,4": { kind: "move", seed: "afx0", dir: 8 }
    });
    assert.deepStrictEqual(calls, [
        ["playSeed", "36772507"],
        ["render", "turn-frame"]
    ]);
    delete global.window;
}

function testRuleTerminalCommandUses2DBrowserSoundEffects() {
    const compiledState = {
        title: "terminal command sound test",
        metadata: {},
        levels: [{ is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        processInput: () => false,
        tryPlayRestartSound: () => calls.push(["tryPlayRestartSound"]),
        tryPlayCancelSound: () => calls.push(["tryPlayCancelSound"]),
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: () => ({
                session,
                turn: { changed: true, boardChanged: true, moved: false },
                turns: [],
                tailPlan: { terminalAction: { type: "restart" } }
            }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.deepStrictEqual(calls, [
        ["tryPlayRestartSound"],
        ["render", "turn-frame"]
    ]);

    hostWindow.GameRuntime3D.processSessionTurn3D = () => ({
        session,
        turn: { changed: true, boardChanged: false, moved: false },
        turns: [],
        tailPlan: { terminalAction: { type: "cancel" } }
    });
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.deepStrictEqual(calls, [
        ["tryPlayCancelSound"],
        ["render", "turn-frame"]
    ]);
    delete global.window;
}

function testBrowserAgainSchedulingUses2DLoopState() {
    const compiledState = {
        title: "again browser state test",
        metadata: {},
        levels: [{ is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const session = { runtime: {}, state: compiledState };
    const calls = [];
    const lexicalBindings = {};
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
        processInput: () => false,
        againing: false,
        timer: 400,
        eval(source) {
            const match = source.match(/^([A-Za-z0-9_]+) = globalThis\.__puzzle3DBrowserLoopBindingValue;$/);
            if (!match)
                throw new Error(`unexpected eval source: ${source}`);
            lexicalBindings[match[1]] = hostWindow.__puzzle3DBrowserLoopBindingValue;
            return lexicalBindings[match[1]];
        },
        GameRuntime3D: {
            createSessionFromState3D: () => session,
            processSessionTurn3D: (_session, direction, options) => {
                calls.push(["processTurn", direction, options.deferAgain, options.deferWin]);
                return {
                    session,
                    turn: { changed: true, boardChanged: true, moved: false },
                    turns: [],
                    againScheduled: direction === "right"
                };
            },
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.messagetext, "");
    assert.strictEqual(lexicalBindings.messagetext, "");
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.strictEqual(hostWindow.againing, true);
    assert.strictEqual(hostWindow.timer, 0);
    assert.strictEqual(lexicalBindings.againing, true);
    assert.strictEqual(lexicalBindings.timer, 0);
    assert.strictEqual(lexicalBindings.messagetext, "");
    assert.deepStrictEqual(calls, [
        ["processTurn", "right", true, true],
        ["render", "turn-frame"]
    ]);

    calls.length = 0;
    hostWindow.timer = 200;
    assert.strictEqual(host.processInput(-1), true);
    assert.strictEqual(hostWindow.againing, false);
    assert.strictEqual(hostWindow.timer, 200);
    assert.deepStrictEqual(calls, [
        ["processTurn", null, true, true],
        ["render", "turn-frame"]
    ]);
    delete global.window;
}

function testBrowserWinUses2DDoWinBoundary() {
    const compiledState = {
        title: "win browser state test",
        metadata: {},
        levels: [{ is3d: true }, { is3d: true }],
        sections: [{ firstLevel: 0 }]
    };
    const calls = [];
    const sessions = [
        { runtime: {}, state: compiledState, levelIndex: 0 },
        { runtime: {}, state: compiledState, levelIndex: 1 }
    ];
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
        processInput: () => false,
        againing: true,
        winning: false,
        timer: 300,
        DoWin: () => {
            calls.push(["DoWin"]);
            hostWindow.againing = false;
            hostWindow.winning = true;
            hostWindow.timer = 0;
        },
        GameRuntime3D: {
            createSessionFromState3D: (_state, options) => {
                calls.push(["createSession", options.levelIndex]);
                return sessions[options.levelIndex];
            },
            processSessionTurn3D: (_session, direction, options) => {
                calls.push(["processTurn", direction, options.deferWin]);
                return {
                    session: sessions[0],
                    turn: { changed: true, boardChanged: true, moved: false },
                    turns: [],
                    tailPlan: { winDeferred: true }
                };
            },
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: session => ({ kind: "frame", levelIndex: session.levelIndex }),
            buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind, frame.levelIndex])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    calls.length = 0;

    assert.strictEqual(host.processInput(3), true);
    assert.strictEqual(hostWindow.winning, true);
    assert.strictEqual(hostWindow.againing, false);
    assert.strictEqual(hostWindow.timer, 0);
    assert.strictEqual(hostWindow.puzzle3DSession, sessions[0]);
    assert.deepStrictEqual(calls, [
        ["processTurn", "right", true],
        ["DoWin"],
        ["render", "turn-frame", undefined]
    ]);
    delete global.window;
}

function testBrowserQuitDoesNotOwnShellPolicy() {
    const cases = [
        {
            metadata: { enable_pause: true },
            expected: [
                ["processTurn", "right", true]
            ]
        },
        {
            metadata: { level_select: true },
            expected: [
                ["processTurn", "right", true]
            ]
        },
        {
            metadata: {},
            expected: [
                ["processTurn", "right", true]
            ]
        }
    ];

    for (const testCase of cases) {
        const compiledState = {
            title: "quit browser state test",
            metadata: testCase.metadata,
            levels: [{ is3d: true }],
            sections: [{ firstLevel: 0 }]
        };
        const session = { runtime: {}, state: compiledState };
        const calls = [];
        const canvas2D = { id: "gameCanvas", style: {}, parentNode: { insertBefore: () => {} } };
        const canvas3D = { id: "gameCanvas3D", parentNode: { removeChild: child => calls.push(["removeCanvas", child.id]) } };
        const hostWindow = {
            THREE: {},
            RNG: function RNG() {},
            canvas: canvas2D,
            dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
            document: {
                getElementById: id => id === "gameCanvas" ? canvas2D : id === "gameCanvas3D" ? canvas3D : null,
                createElement: () => canvas3D
            },
            processInput: () => false,
            messagetext: "quit message",
            goToPauseScreen: () => calls.push(["goToPauseScreen"]),
            gotoLevelSelectScreen: () => calls.push(["gotoLevelSelectScreen"]),
            generateTitleScreen: () => calls.push(["generateTitleScreen"]),
            showContinueOptionOnTitleScreen: () => false,
            canvasResize: () => calls.push(["canvasResize"]),
            GameRuntime3D: {
                createSessionFromState3D: () => session,
                processSessionTurn3D: (_session, direction, options) => {
                    calls.push(["processTurn", direction, options.deferQuit]);
                    return {
                        session,
                        turn: { changed: true, boardChanged: true, moved: false },
                        turns: [],
                        tailPlan: { quitDeferred: true }
                    };
                },
                applySessionArtifacts3D: () => ({})
            },
            Puzzle3DRenderFrame: {
                buildSessionRenderFrame3D: () => ({ kind: "frame" }),
                buildSessionTurnRenderFrame3D: () => ({ kind: "turn-frame" })
            },
            Puzzle3DThreeRenderer: {
                renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
            }
        };
        const host = loadPlayHostWithWindow(hostWindow);

        assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
        calls.length = 0;

        assert.strictEqual(host.processInput(3), true);
        assert.strictEqual(hostWindow.messagetext, "");
        assert.deepStrictEqual(calls, testCase.expected);
        delete global.window;
    }
}

function testLevelMessageDoesNotCreateBrowserMessageFlow() {
    const compiledState = {
        title: "level message shell test",
        metadata: {},
        levels: [
            { message: "intro" },
            { is3d: true, title: "level one" }
        ],
        sections: [{ firstLevel: 1 }]
    };
    const calls = [];
    const session = { runtime: {}, state: compiledState };
    const hostWindow = {
        THREE: {},
        RNG: function RNG() {},
        canvas: { id: "gameCanvas" },
        processInput: () => false,
        drawMessageScreen: message => {
            calls.push(["drawMessageScreen", message]);
            hostWindow.textMode = true;
        },
        canvasResize: () => calls.push(["canvasResize"]),
        clearInputHistory: () => calls.push(["clearInputHistory"]),
        tryPlayShowMessageSound: () => calls.push(["tryPlayShowMessageSound"]),
        twiddleMetadataExtras: () => calls.push(["twiddleMetadataExtras"]),
        GameRuntime3D: {
            createSessionFromState3D: (_state, options) => {
                calls.push(["createSession", options.levelIndex]);
                return session;
            },
            processSessionTurn3D: () => ({ session, turn: {}, turns: [] }),
            applySessionArtifacts3D: () => ({})
        },
        Puzzle3DRenderFrame: {
            buildSessionRenderFrame3D: () => ({ kind: "frame" })
        },
        Puzzle3DThreeRenderer: {
            renderToCanvas: (_canvas, frame) => calls.push(["render", frame.kind])
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.startPlayableLevel(compiledState, 0, { randomseed: null }), true);
    assert.strictEqual(hostWindow.puzzle3DSession, session);
    assert.strictEqual(hostWindow.curLevelNo, 0);
    assert.deepStrictEqual(calls, [
        ["createSession", 0],
        ["render", "frame"],
        ["clearInputHistory"],
        ["canvasResize"]
    ]);
    delete global.window;
}

async function testPrepareCompiledStateLoadsHostCapabilitiesBeforeStart() {
    const calls = [];
    const threeModule = { Vector3: function Vector3() {} };
    const webglContext = { kind: "webgl" };
    const hostWindow = {
        PUZZLE3D_THREE_MODULE_URL: "local-three.js",
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {},
        document: {
            createElement: tag => {
                calls.push(["createElement", tag]);
                return {
                    getContext: name => {
                        calls.push(["getContext", name]);
                        return name === "webgl2" ? webglContext : null;
                    }
                };
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    assert.strictEqual(host.canStart(), false);
    await host.prepareCompiledState({
        hostCapabilities: [{
            kind: "renderer",
            renderer: "three3d",
            requires: ["THREE", "webgl"]
        }]
    }, {
        importModule: specifier => {
            calls.push(["import", specifier]);
            return Promise.resolve({ default: threeModule });
        }
    });

    assert.strictEqual(hostWindow.THREE, threeModule);
    assert.strictEqual(host.canStart(), true);
    assert.deepStrictEqual(calls, [
        ["import", "local-three.js"],
        ["createElement", "canvas"],
        ["getContext", "webgl2"]
    ]);
    delete global.window;
}

async function testPrepareCompiledStateSharesConcurrentThreeImport() {
    const calls = [];
    const threeModule = { Vector3: function Vector3() {} };
    let resolveImport = null;
    const hostWindow = {
        PUZZLE3D_THREE_MODULE_URL: "local-three.js",
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {}
    };
    const host = loadPlayHostWithWindow(hostWindow);
    const state = {
        hostCapabilities: [{ requires: ["THREE"] }]
    };
    const options = {
        importModule: specifier => {
            calls.push(["import", specifier]);
            return new Promise(resolve => {
                resolveImport = resolve;
            });
        }
    };

    const first = host.prepareCompiledState(state, options);
    const second = host.prepareCompiledState(state, options);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls, [["import", "local-three.js"]]);
    resolveImport({ default: threeModule });
    await Promise.all([first, second]);

    assert.strictEqual(hostWindow.THREE, threeModule);
    assert.deepStrictEqual(calls, [["import", "local-three.js"]]);
    delete global.window;
}

async function testPrepareCompiledStateCachesWebGLProbeAcrossRepeatedPreparation() {
    const calls = [];
    const webglContext = { kind: "webgl" };
    const hostWindow = {
        THREE: {},
        document: {
            createElement: tag => {
                calls.push(["createElement", tag]);
                return {
                    getContext: name => {
                        calls.push(["getContext", name]);
                        return name === "webgl2" ? webglContext : null;
                    }
                };
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);
    const state = {
        hostCapabilities: [{ requires: ["webgl"] }]
    };

    await host.prepareCompiledState(state);
    await host.prepareCompiledState(state);

    assert.deepStrictEqual(calls, [
        ["createElement", "canvas"],
        ["getContext", "webgl2"]
    ]);
    delete global.window;
}

async function testPrepareCompiledStateDeduplicatesRepeatedRequiresWithinOneCapability() {
    const calls = [];
    const hostWindow = {
        PUZZLE3D_THREE_MODULE_URL: "local-three.js",
        document: {
            createElement: tag => {
                calls.push(["createElement", tag]);
                return {
                    getContext: name => {
                        calls.push(["getContext", name]);
                        return name === "webgl2" ? { kind: "webgl" } : null;
                    }
                };
            }
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    await host.prepareCompiledState({
        hostCapabilities: [{ requires: ["THREE", "THREE", "webgl", "webgl"] }]
    }, {
        importModule: specifier => {
            calls.push(["import", specifier]);
            return Promise.resolve({ default: { kind: "three" } });
        }
    });

    assert.deepStrictEqual(calls, [
        ["import", "local-three.js"],
        ["createElement", "canvas"],
        ["getContext", "webgl2"]
    ]);
    delete global.window;
}

async function testPrepareCompiledStateRequiresExplicitThreeModuleUrl() {
    const hostWindow = {
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {}
    };
    const host = loadPlayHostWithWindow(hostWindow);

    await assert.rejects(
        () => host.prepareCompiledState({
            hostCapabilities: [{ requires: ["THREE"] }]
        }),
        /PUZZLE3D_THREE_MODULE_URL/
    );
    delete global.window;
}

async function testPrepareCompiledStateLoadsFileProtocolThreeModule() {
    const calls = [];
    const threeModule = { Vector3: function Vector3() {} };
    const hostWindow = {
        PUZZLE3D_THREE_MODULE_URL: "js/vendor/three.module.min.js",
        location: { protocol: "file:" },
        GameRuntime3D: {},
        Puzzle3DRenderFrame: {},
        Puzzle3DThreeRenderer: {}
    };
    const host = loadPlayHostWithWindow(hostWindow);

    await host.prepareCompiledState({
        hostCapabilities: [{ requires: ["THREE"] }]
    }, {
        importModule: specifier => {
            calls.push(["import", specifier]);
            return Promise.resolve({ default: threeModule });
        }
    });

    assert.strictEqual(hostWindow.THREE, threeModule);
    assert.deepStrictEqual(calls, [["import", "js/vendor/three.module.min.js"]]);
    delete global.window;
}

async function testPrepareCompiledStateRejectsMissingWebGL() {
    const hostWindow = {
        THREE: {},
        document: {
            createElement: () => ({
                getContext: () => null
            })
        }
    };
    const host = loadPlayHostWithWindow(hostWindow);

    await assert.rejects(
        () => host.prepareCompiledState({
            hostCapabilities: [{ requires: ["webgl"] }]
        }),
        /3D renderer requires WebGL/
    );
    delete global.window;
}

async function run() {
    testCanStartRequiresRuntimeRenderFrameRendererAndThree();
    testRegistersAsExternalPlayableHostFor3DLevels();
    testStartPlayableLevelUsesBrowserPlaybackContract();
    testStartPlayableLevelDoesNotLetStaleTurnFrameOverwriteInitialFrame();
    testRebuildPlayableLevelRefreshesSessionThroughLifecycleAdapter();
    testRedrawRejectsTurnResultFromDifferentSession();
    testOpenLevelEditorCreates3DBoardWithoutRendererContract();
    testActiveCanvasMigrationCarriesExistingKeyboardGateTarget();
    testProcessInputBridgeMaps2DBrowserVerticalCarrierTo3DDepth();
    testRedrawBridgeCarries2DTweenTimerInto3DRenderer();
    testSmoothScreenKeepsBrowserRedrawLoopActiveWithoutTween();
    testPlayHostProjectsFlickscreenCarrierFromPlayerOver3DXZPlane();
    testPlayHostSmoothscreenUses2DTargetAndRenderLoopCarriersOver3DXZPlane();
    testSessionCommandHelperDoesNotPatch2DGlobals();
    testStartCompiledStateUses2DSetGameStateFlowBoundary();
    test3DHostRejectsNon3DCompiledState();
    testHostDoesNotOwnBrowserLevelSelectFlow();
    testRestartGlobalRemains2DOwnedDuring3DSession();
    testCommandMessageDoesNotInstallBrowserMessageFlow();
    testCommandStatusAndSimpleSfxUse2DBrowserOutputs();
    testTurnSfxArtifactsUse2DBrowserSeedOutput();
    testRuleTerminalCommandUses2DBrowserSoundEffects();
    testBrowserAgainSchedulingUses2DLoopState();
    testBrowserWinUses2DDoWinBoundary();
    testBrowserQuitDoesNotOwnShellPolicy();
    testLevelMessageDoesNotCreateBrowserMessageFlow();
    await testPrepareCompiledStateLoadsHostCapabilitiesBeforeStart();
    await testPrepareCompiledStateSharesConcurrentThreeImport();
    await testPrepareCompiledStateCachesWebGLProbeAcrossRepeatedPreparation();
    await testPrepareCompiledStateDeduplicatesRepeatedRequiresWithinOneCapability();
    await testPrepareCompiledStateRequiresExplicitThreeModuleUrl();
    await testPrepareCompiledStateLoadsFileProtocolThreeModule();
    await testPrepareCompiledStateRejectsMissingWebGL();
}

run().then(function() {
    console.log("3d play host tests passed");
}).catch(function(err) {
    console.error(err);
    process.exit(1);
});
