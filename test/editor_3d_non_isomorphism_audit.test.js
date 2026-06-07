const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "src");

function read(relpath) {
    return fs.readFileSync(path.join(root, relpath), "utf8");
}

function test2DEngineDoesNotOwn3DBrowserOrLevelRouting() {
    const engine = read("js/engine.js");

    for (const forbidden of [
        "Puzzle3D",
        "PuzzleHostCapabilities",
        "hostCapabilities",
        "threeDimensionLevels",
        "levels3",
        "is3d"
    ]) {
        assert(!engine.includes(forbidden), `2D engine.js should not mention ${forbidden}`);
    }
}

function loadPlayHostBoundaryContext() {
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
    const elements = { gameCanvas: canvas };

    global.document = {
        body: {
            appendChild(node) {
                calls.push(["appendChild", node.id]);
            }
        },
        getElementById(id) {
            return elements[id] || null;
        },
        createElement(tagName) {
            return {
                tagName,
                id: "",
                width: 0,
                height: 0,
                clientWidth: 640,
                clientHeight: 480,
                style: {},
                parentNode: canvas.parentNode
            };
        }
    };
    global.canvas = canvas;
    global.THREE = {};
    global.GameRuntime3D = {
        createSessionFromState3D(state, options) {
            return {
                state,
                levelIndex: options && options.levelIndex || 0,
                runtime: { board: {} }
            };
        }
    };
    global.Puzzle3DRenderFrame = {
        buildSessionRenderFrame3D() {
            return { drawPlan: {}, cells: [] };
        },
        buildSessionTurnRenderFrame3D() {
            return { drawPlan: {}, cells: [] };
        }
    };
    global.Puzzle3DThreeRenderer = {
        renderToCanvas() {}
    };
    global.PuzzleExternalPlayableHosts = [];
    global.PuzzleHostCapabilities = {};
    global.clearInputHistory = () => {};
    global.canvasResize = () => {};
    global.state = null;
    global.curLevelNo = 0;
    global.curLevel = null;
    global.titleScreen = true;
    global.textMode = true;
    global.levelEditorOpened = false;
    global.oldflickscreendat = [];

    delete require.cache[require.resolve("../src/js/play_host3d.js")];
    const host = require("../src/js/play_host3d.js");
    return { host };
}

function testPlayHostRegistersGenericBrowserCapabilities() {
    const { host } = loadPlayHostBoundaryContext();

    assert.strictEqual(global.PuzzleExternalPlayableHosts.length, 1);
    assert.strictEqual(global.PuzzleExternalPlayableHosts[0], host);
    assert.strictEqual(global.PuzzleHostCapabilities.prepareCompiledState, host.prepareCompiledState);
    assert.strictEqual(global.PuzzleHostCapabilities.startCompiledState, host.startCompiledState);
    assert.strictEqual(typeof global.PuzzleHostCapabilities.hasActiveBrowserSession, "function");
    assert.strictEqual(typeof global.PuzzleHostCapabilities.processBrowserInput, "function");
    assert.strictEqual(global.PuzzleHostCapabilities.processInput, undefined);
}

function loadGraphicsBoundaryContext() {
    const context = {
        console,
        Math,
        Array,
        Int32Array,
        debugSwitch: "",
        window: {
            addEventListener() {}
        },
        document: {
            getElementById() {
                return {
                    parentNode: {
                        clientWidth: 320,
                        clientHeight: 240
                    },
                    getContext() {
                        return {};
                    },
                    width: 0,
                    height: 0
                };
            },
            createElement() {
                return {
                    getContext() {
                        return {};
                    }
                };
            }
        },
        canvas: null,
        state: {
            metadata: {},
            levels: [],
            glyphOrder: [],
            fgcolor: "white",
            bgcolor: "black",
            sprite_size: 5
        },
        IDE: false,
        textMode: false,
        levelEditorOpened: false,
        curLevel: { width: 2, height: 2, is3d: false },
        cellwidth: 1,
        cellheight: 1,
        screenwidth: 0,
        screenheight: 0,
        TITLE_WIDTH: 34,
        TITLE_HEIGHT: 13,
        font: { X: "00000\n00000\n00000\n00000\n00000" },
        loadedCustomFont: false,
        editorRowCount: 0,
        forceRegenImages: false,
        regenSpriteImages() {},
        redrawTextMode() {},
        colorToHex(_palette, value) {
            return value || "#000000";
        }
    };
    vm.createContext(context);
    vm.runInContext(read("js/graphics3d.js"), context, { filename: "graphics3d.js" });
    return context;
}

function test3DLevelEditorRedrawUsesEditorSliceInsteadOfPreviewHost() {
    const context = loadGraphicsBoundaryContext();
    const calls = [];
    const editorView = { width: 2, height: 2 };
    context.levelEditorOpened = true;
    context.curLevel = { width: 2, height: 2, is3d: true };
    context.isCurrentLevelEditor3D = () => true;
    context.is3DLevelEditorActive = () => calls.some(call => call[0] === "prepare");
    context.prepareLevelEditorForCurrentLevel = () => calls.push(["prepare"]);
    context.getLevelEditor3DViewLevel = () => editorView;
    context.redrawCellGrid = level => calls.push(["redrawCellGrid", level]);
    context.Puzzle3DPlayHost = {
        redraw() {
            calls.push(["previewHostRedraw"]);
            return true;
        }
    };

    context.redraw();

    assert.deepStrictEqual(calls, [
        ["prepare"],
        ["redrawCellGrid", editorView]
    ]);
}

function test3DSmoothscreenSkips2DCanvasCameraInitialization() {
    const context = loadGraphicsBoundaryContext();
    let initCalls = 0;
    context.state.metadata.smoothscreen = { screenSize: { width: 5, height: 4 } };
    context.curLevel = { width: 2, height: 2, is3d: true };
    context.isCurrentLevel3D = () => true;
    context.initSmoothCamera = () => { initCalls++; };
    context.Puzzle3DPlayHost = {
        redraw() {
            return true;
        }
    };

    context.canvasResize(context.curLevel);

    assert.strictEqual(initCalls, 0);
}

function run() {
    test2DEngineDoesNotOwn3DBrowserOrLevelRouting();
    testPlayHostRegistersGenericBrowserCapabilities();
    test3DLevelEditorRedrawUsesEditorSliceInsteadOfPreviewHost();
    test3DSmoothscreenSkips2DCanvasCameraInitialization();
}

run();
console.log("editor 3D non-isomorphism audit tests passed");
