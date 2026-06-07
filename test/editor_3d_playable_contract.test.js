const assert = require("assert");

function loadPlayHostOracle() {
    const calls = [];
    const canvas = {
        id: "gameCanvas",
        width: 640,
        height: 480,
        clientWidth: 640,
        clientHeight: 480,
        style: {},
        parentNode: {
            clientWidth: 640,
            clientHeight: 480,
            insertBefore(node) {
                calls.push(["insertBefore", node.id]);
            }
        }
    };
    const body = {
        appendChild(node) {
            calls.push(["appendChild", node.id]);
        }
    };
    const elements = { gameCanvas: canvas };

    global.document = {
        body,
        getElementById(id) {
            return elements[id] || null;
        },
        createElement(tagName) {
            const node = {
                tagName,
                id: "",
                width: 0,
                height: 0,
                clientWidth: 640,
                clientHeight: 480,
                style: {},
                parentNode: canvas.parentNode
            };
            return node;
        }
    };
    global.canvas = canvas;
    global.THREE = {};
    global.clearInputHistory = () => calls.push(["clearInputHistory"]);
    global.canvasResize = () => calls.push(["canvasResize"]);
    global.generateTitleScreen = () => calls.push(["generateTitleScreen"]);
    global.drawMessageScreen = message => calls.push(["drawMessageScreen", message]);
    global.tryPlayShowMessageSound = () => calls.push(["tryPlayShowMessageSound"]);
    global.showContinueOptionOnTitleScreen = () => false;
    global.isContinueOptionSelected = () => false;
    global.isLevelSelectOptionSelected = () => false;
    global.setGameState = (state, command, randomseed) => {
        calls.push(["setGameState", state, command, randomseed]);
        global.state = state;
    };
    global.GameRuntime3D = {
        createSessionFromState3D(state, options) {
            const levelIndex = options && options.levelIndex || 0;
            calls.push(["createSessionFromState3D", state, options]);
            return {
                state,
                levelIndex,
                runtime: { board: {} }
            };
        },
        rebuildSessionFromState3D(session, state, options) {
            calls.push(["rebuildSessionFromState3D", session, state, options]);
            session.state = state;
            session.levelIndex = options && options.levelIndex || session.levelIndex;
            return session;
        }
    };
    global.Puzzle3DRenderFrame = {
        buildSessionRenderFrame3D(session, options) {
            calls.push(["buildSessionRenderFrame3D", session.levelIndex, options && options.view && options.view.viewportAspect]);
            return { drawPlan: {}, cells: [] };
        },
        buildSessionTurnRenderFrame3D(turn, options) {
            calls.push(["buildSessionTurnRenderFrame3D", turn, options]);
            return { drawPlan: {}, cells: [] };
        }
    };
    global.Puzzle3DThreeRenderer = {
        renderToCanvas(renderCanvas, frame) {
            calls.push(["renderToCanvas", renderCanvas.id, frame]);
        }
    };
    global.PuzzleExternalPlayableHosts = [];
    global.PuzzleHostCapabilities = {};
    global.state = null;
    global.curLevelNo = 0;
    global.curLevel = null;
    global.titleScreen = true;
    global.textMode = true;
    global.levelEditorOpened = false;
    global.oldflickscreendat = [];

    delete require.cache[require.resolve("../src/js/play_host3d.js")];
    const host = require("../src/js/play_host3d.js");
    return { host, calls };
}

function makeCompiledState() {
    return {
        metadata: { three_dimensions: true },
        levels: [
            { message: "intro" },
            { is3d: true, width: 2, height: 2, depth: 1 }
        ],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE", "webgl"] }]
    };
}

function test3DPlayableStartDoesNotRequire2DLevelCloneCarrier() {
    const { host, calls } = loadPlayHostOracle();
    const compiledState = makeCompiledState();
    const compiled3DLevelPayload = compiledState.levels[1];

    assert.strictEqual(compiled3DLevelPayload.clone, undefined);
    const result = host.startCompiledState(compiledState, ["restart"], "seed-3d");

    assert.strictEqual(result, compiledState);
    assert.strictEqual(global.state, compiledState);
    assert(!calls.some(call => call[0] === "createSessionFromState3D"));
    assert(calls.some(call => call[0] === "setGameState" && call[1] === compiledState));

    calls.length = 0;
    assert.strictEqual(host.startPlayableLevel(compiledState, 1, { randomseed: "seed-3d" }), true);
    assert.strictEqual(global.curLevelNo, 1);
    assert.strictEqual(global.curLevel, compiledState.levels[1]);
    assert(calls.some(call => call[0] === "createSessionFromState3D" && call[2].levelIndex === 1));
    assert(calls.some(call => call[0] === "renderToCanvas"));
}

function test3DLevelEditorStartUsesHostEditorMode() {
    const { host, calls } = loadPlayHostOracle();
    const compiledState = makeCompiledState();

    const result = host.startCompiledState(compiledState, ["loadLevelEditor", 0], "seed-editor");

    assert.strictEqual(result, compiledState);
    assert.strictEqual(global.levelEditorOpened, true);
    assert.strictEqual(global.titleScreen, false);
    assert.strictEqual(global.textMode, false);
    assert.strictEqual(global.curLevelNo, 1);
    assert.strictEqual(global.curLevel, compiledState.levels[1]);
    assert(calls.some(call => call[0] === "createSessionFromState3D" && call[2].levelIndex === 1));
    assert(calls.some(call => call[0] === "canvasResize"));
}

function test3DRebuildUsesActiveHostSession() {
    const { host, calls } = loadPlayHostOracle();
    const compiledState = makeCompiledState();
    host.startPlayableLevel(compiledState, 1, { randomseed: "seed-3d" });
    calls.length = 0;

    const result = host.startCompiledState(compiledState, ["rebuild"], "seed-rebuild");

    assert.strictEqual(result, compiledState);
    assert(calls.some(call => call[0] === "rebuildSessionFromState3D" && call[2] === compiledState));
    assert(calls.some(call => call[0] === "renderToCanvas"));
}

test3DPlayableStartDoesNotRequire2DLevelCloneCarrier();
test3DLevelEditorStartUsesHostEditorMode();
test3DRebuildUsesActiveHostSession();

console.log("editor 3D playable contract tests passed");
