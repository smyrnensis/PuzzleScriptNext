const assert = require("assert");
const fs = require("fs");
const path = require("path");

function loadInputOutputForTest(options = {}) {
    delete global.PuzzleHostCapabilities;
    const listeners = {};
    const canvasElement = options.canvas || { id: "gameCanvas", addEventListener: () => {} };
    canvasElement.relMouseCoords = canvasElement.relMouseCoords || (() => ({ x: 0, y: 0 }));
    const otherTarget = { id: "editor" };
    const calls = [];
    const pushes = [];
    const sideEffects = [];

    Object.assign(global, {
        document: {
            addEventListener: (name, handler, options) => {
                listeners[name] = handler;
                listeners[`${name}Options`] = options;
            },
            dispatchEvent: event => sideEffects.push(["dispatchEvent", event.type]),
            activeElement: { blur: () => sideEffects.push(["activeBlur"]) }
        },
        HTMLCanvasElement: function HTMLCanvasElement() {},
        window: {
            addEventListener: () => {},
            requestAnimationFrame: handler => {
                listeners.frame = handler;
            }
        },
        canvas: canvasElement,
        IDE: false,
        keybuffer: [],
        keyRepeatIndex: 0,
        keyRepeatTimer: 0,
        canDump: false,
        debugSwitch: "",
        throttle_movement: false,
        repeatinterval: 150,
        lastinput: -1,
        input_throttle_timer: 0,
        textMode: false,
        titleScreen: false,
        quittingTitleScreen: false,
        quittingMessageScreen: false,
        messageselected: false,
        levelEditorOpened: false,
        againinterval: 150,
        ignoreNotJustPressedAction: true,
        timer: 0,
        prevTimestamp: 0,
        debugTimestamp: 0,
        deltatime: 17,
        tweentimer: 0,
        winning: false,
        againing: false,
        autotick: 0,
        autotickinterval: 0,
        messagetext: "",
        isAnimating: false,
        solving: false,
        suppressInput: false,
        norepeat_action: false,
        state: { metadata: {} },
        getPlayableLevels: gameState => gameState && gameState.levels || [],
        screenwidth: 10,
        screenheight: 10,
        xoffset: 0,
        yoffset: 0,
        cellwidth: 1,
        cellheight: 1,
        dirNames: ["up", "left", "down", "right", "action", "mouse", "lclick", "rclick"],
        lastDownTarget: options.lastDownTarget === undefined ? canvasElement : options.lastDownTarget,
        processInput: input => {
            calls.push(input);
            return false;
        },
        pushInput: input => pushes.push(input),
        DoUndo: (force, ignoreDuplicates) => sideEffects.push(["DoUndo", force, ignoreDuplicates]),
        DoRestart: () => sideEffects.push(["DoRestart"]),
        goToTitleScreen: () => sideEffects.push(["goToTitleScreen"]),
        gotoLevelSelectScreen: () => sideEffects.push(["gotoLevelSelectScreen"]),
        goToPauseScreen: () => sideEffects.push(["goToPauseScreen"]),
        nextLevel: () => sideEffects.push(["nextLevel"]),
        gotoLevel: target => sideEffects.push(["gotoLevel", target]),
        selectPauseScreen: () => sideEffects.push(["selectPauseScreen"]),
        checkWin: () => sideEffects.push(["checkWin"]),
        tryPlayTitleSound: () => sideEffects.push(["tryPlayTitleSound"]),
        tryPlayStartGameSound: () => sideEffects.push(["tryPlayStartGameSound"]),
        tryPlayCloseMessageSound: () => sideEffects.push(["tryPlayCloseMessageSound"]),
        canvasResize: () => sideEffects.push(["canvasResize"]),
        clearInputHistory: () => sideEffects.push(["clearInputHistory"]),
        generateTitleScreen: (...args) => sideEffects.push(["generateTitleScreen", ...args]),
        drawMessageScreen: message => sideEffects.push(["drawMessageScreen", message]),
        redraw: () => {},
        pollGamepads: () => {},
        toggleMute: () => {},
        isSitelocked: () => false,
        ULBS: () => {},
        solve: () => {},
        stopSolving: () => {},
        dumpTestCase: () => {},
        makeGIF: () => {},
        saveClick: () => {},
        editor: { display: { input: { blur: () => sideEffects.push(["editorBlur"]) } } },
        rebuildClick: () => {},
        runClick: () => {}
    });

    delete require.cache[require.resolve("../src/js/inputoutput3d.js")];
    require("../src/js/inputoutput3d.js");
    return { listeners, canvasElement, otherTarget, calls, pushes, sideEffects };
}

function keyEvent(keyCode) {
    return {
        keyCode,
        preventDefault: () => {},
        stopImmediatePropagation: () => {},
        stopPropagation: () => {}
    };
}

function mouseEvent(target) {
    return {
        type: "mousedown",
        target,
        button: 0,
        preventDefault: () => {},
        stopImmediatePropagation: () => {},
        stopPropagation: () => {}
    };
}

function runShellScenario(scenario) {
    const { listeners, canvasElement, sideEffects, calls, pushes } = loadInputOutputForTest({
        lastDownTarget: scenario.lastDownTarget,
        canvas: scenario.canvas
    });
    Object.assign(global, scenario.setup || {});
    global.state = scenario.state;

    for (const step of scenario.steps) {
        if (step.type === "keydown")
            listeners.keydown(keyEvent(step.keyCode));
        else if (step.type === "frame")
            listeners.frame(step.timestamp);
        else if (step.type === "mousedown")
            listeners.mousedown(mouseEvent(step.target === "canvas" ? canvasElement : step.target));
    }

    return {
        calls: calls.slice(),
        pushes: pushes.slice(),
        sideEffects: sideEffects.slice(),
        textMode: !!global.textMode,
        titleScreen: !!global.titleScreen,
        titleMode: global.titleMode || 0,
        titleSelected: !!global.titleSelected,
        quittingTitleScreen: !!global.quittingTitleScreen,
        messageselected: !!global.messageselected,
        quittingMessageScreen: !!global.quittingMessageScreen,
        winning: !!global.winning,
        lastDownTargetIsCanvas: global.lastDownTarget === canvasElement
    };
}

function assert3DShellMatches2DOracle(name, baseScenario) {
    const levels = baseScenario.levels || [{ title: "playable" }];
    const twoD = runShellScenario(Object.assign({}, baseScenario, {
        state: {
            metadata: baseScenario.metadata || {},
            levels
        }
    }));
    const threeD = runShellScenario(Object.assign({}, baseScenario, {
        state: {
            metadata: baseScenario.metadata || {},
            levels
        }
    }));

    assert.deepStrictEqual(threeD, twoD, name);
}

function testActiveCanvasUsesExistingKeyboardGate() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, calls } = loadInputOutputForTest({ canvas: canvas3D });

    listeners.keydown(keyEvent(39));

    assert.deepStrictEqual(calls, [3]);
}

function testNonCanvasTargetDoesNotEnterKeyboardGate() {
    const { listeners, otherTarget, calls, pushes } = loadInputOutputForTest({ lastDownTarget: null });
    global.lastDownTarget = otherTarget;

    listeners.keydown(keyEvent(39));

    assert.deepStrictEqual(calls, []);
    assert.deepStrictEqual(pushes, []);
}

function testKeyboardListenersRunBeforeEditorBubbleHandlers() {
    const { listeners } = loadInputOutputForTest();

    assert.strictEqual(listeners.keydownOptions, true);
    assert.strictEqual(listeners.keyupOptions, true);
}

function testCanvasMouseDownBlursEditorInputForGameKeys() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, sideEffects } = loadInputOutputForTest({ canvas: canvas3D, lastDownTarget: null });

    listeners.mousedown(mouseEvent(canvas3D));

    assert.deepStrictEqual(sideEffects, [
        ["activeBlur"],
        ["editorBlur"]
    ]);
    assert.strictEqual(global.lastDownTarget, canvas3D);
}

function testNonCanvasMouseDownDoesNotBlurEditorInputForGameKeys() {
    const { listeners, otherTarget, sideEffects } = loadInputOutputForTest({ lastDownTarget: null });

    listeners.mousedown(mouseEvent(otherTarget));

    assert.deepStrictEqual(sideEffects, []);
    assert.strictEqual(global.lastDownTarget, otherTarget);
}

function testUndoAndRestartStayOnExistingCommands() {
    const { listeners, sideEffects, pushes } = loadInputOutputForTest();

    listeners.keydown(keyEvent(90));
    listeners.keydown(keyEvent(82));

    assert.deepStrictEqual(pushes, ["undo", "restart"]);
    assert.deepStrictEqual(sideEffects, [
        ["DoUndo", false, true],
        ["canvasResize"],
        ["DoRestart"],
        ["canvasResize"]
    ]);
}

function testActiveBrowserHostReceivesUndoAndRestartCommands() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, sideEffects, pushes } = loadInputOutputForTest({ canvas: canvas3D });
    const hostCalls = [];
    global.PuzzleHostCapabilities = {
        hasActiveBrowserSession: () => true,
        handleSessionCommand: command => {
            hostCalls.push(command);
            return true;
        }
    };

    listeners.keydown(keyEvent(90));
    listeners.keyup(keyEvent(90));
    listeners.keydown(keyEvent(82));

    assert.deepStrictEqual(hostCalls, ["undo", "restart"]);
    assert.deepStrictEqual(pushes, ["undo", "restart"]);
    assert.deepStrictEqual(sideEffects, [
        ["canvasResize"],
        ["canvasResize"]
    ]);
}

function testActiveBrowserHostWithoutCommandBoundaryDoesNotFallBackTo2DCommands() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, sideEffects, pushes } = loadInputOutputForTest({ canvas: canvas3D });
    global.PuzzleHostCapabilities = {
        hasActiveBrowserSession: () => true
    };

    assert.throws(
        () => listeners.keydown(keyEvent(90)),
        /Active browser playback host is missing handleSessionCommand/
    );
    assert.deepStrictEqual(pushes, ["undo"]);
    assert.deepStrictEqual(sideEffects, []);
}

function test3DMessageShellUsesOrdinaryLevelsForCloseInput() {
    assert3DShellMatches2DOracle("3D message close key shell matches 2D oracle", {
        levels: [{ message: "intro" }],
        setup: {
            textMode: true,
            titleScreen: false,
            curLevelNo: 0,
            unitTesting: false
        },
        steps: [{ type: "keydown", keyCode: 88 }]
    });
}

function test3DTitleShellUsesOrdinaryLevels() {
    assert3DShellMatches2DOracle("3D title action shell matches 2D oracle", {
        levels: [{ title: "playable" }],
        setup: {
            textMode: true,
            titleScreen: true,
            titleMode: 0,
            titleSelected: false,
            quittingTitleScreen: false
        },
        steps: [{ type: "keydown", keyCode: 88 }]
    });
}

function testTitleShellActionUsesExistingNextLevelOnUpdate() {
    assert3DShellMatches2DOracle("3D title delayed next-level shell matches 2D oracle", {
        levels: [{ title: "playable" }],
        setup: {
            textMode: true,
            titleScreen: true,
            titleMode: 0,
            titleSelected: false,
            quittingTitleScreen: false,
            timer: 0
        },
        steps: [
            { type: "keydown", keyCode: 88 },
            { type: "frame", timestamp: 0 },
            { type: "frame", timestamp: 400 }
        ]
    });
}

function testCanvasClickThenKeyboardUsesExistingTitleShellPath() {
    assert3DShellMatches2DOracle("3D canvas click title shell matches 2D oracle", {
        levels: [{ title: "playable" }],
        lastDownTarget: null,
        setup: {
            textMode: true,
            titleScreen: true,
            titleMode: 0,
            titleSelected: false,
            quittingTitleScreen: false
        },
        steps: [
            { type: "mousedown", target: "canvas" },
            { type: "keydown", keyCode: 88 }
        ]
    });
}

function test3DCanvasClickEntersExistingKeyboardGateEvenIfCanvasBindingIsStale() {
    const canvas3D = { id: "gameCanvas3D" };
    const { listeners, calls } = loadInputOutputForTest({ lastDownTarget: null });

    listeners.mousedown(mouseEvent(canvas3D));
    listeners.keydown(keyEvent(39));

    assert.deepStrictEqual(calls, [3]);
}

function testActiveBrowserHostReceivesKeyboardInputInsteadOf2DProcessInput() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, calls } = loadInputOutputForTest({ canvas: canvas3D });
    const hostCalls = [];
    global.PuzzleHostCapabilities = {
        hasActiveBrowserSession: () => true,
        processBrowserInput: input => {
            hostCalls.push(input);
            return false;
        }
    };

    listeners.keydown(keyEvent(39));

    assert.deepStrictEqual(hostCalls, [3]);
    assert.deepStrictEqual(calls, []);
}

function testInactiveBrowserHostFallsBackTo2DProcessInput() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, calls } = loadInputOutputForTest({ canvas: canvas3D });
    const hostCalls = [];
    global.PuzzleHostCapabilities = {
        hasActiveBrowserSession: () => false,
        processBrowserInput: input => {
            hostCalls.push(input);
            return false;
        }
    };

    listeners.keydown(keyEvent(39));

    assert.deepStrictEqual(hostCalls, []);
    assert.deepStrictEqual(calls, [3]);
}

function testActiveBrowserHostWithoutInputBoundaryDoesNotFallBackTo2DProcessInput() {
    const canvas3D = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, calls } = loadInputOutputForTest({ canvas: canvas3D });
    global.PuzzleHostCapabilities = {
        hasActiveBrowserSession: () => true
    };

    assert.throws(
        () => listeners.keydown(keyEvent(39)),
        /Active browser playback host is missing processBrowserInput/
    );
    assert.deepStrictEqual(calls, []);
}

function test3DLevelMessageCloseUpdateMatches2DOracle() {
    assert3DShellMatches2DOracle("3D level-message close update matches 2D oracle", {
        levels: [{ message: "intro" }],
        setup: {
            textMode: true,
            titleScreen: false,
            curLevelNo: 0,
            unitTesting: false,
            timer: 0
        },
        steps: [
            { type: "keydown", keyCode: 88 },
            { type: "frame", timestamp: 0 },
            { type: "frame", timestamp: 200 }
        ]
    });
}

function testWinningUpdateUsesExistingNextLevel() {
    const { listeners, sideEffects } = loadInputOutputForTest();
    global.winning = true;
    global.timer = 600;

    listeners.frame(1000);

    assert.strictEqual(global.winning, false);
    assert.deepStrictEqual(sideEffects, [["nextLevel"]]);
}

function runInputOutputLoopScenario(canvasId, scenario) {
    const canvasElement = { id: canvasId, addEventListener: () => {} };
    const { listeners, calls, pushes, sideEffects } = loadInputOutputForTest({ canvas: canvasElement });
    Object.assign(global, scenario.state || {});
    global.processInput = input => {
        calls.push(input);
        return scenario.processInputResult !== undefined ? scenario.processInputResult : true;
    };
    global.redraw = () => sideEffects.push(["redraw"]);

    for (const timestamp of scenario.frames || [0])
        listeners.frame(timestamp);

    return {
        calls: calls.slice(),
        pushes: pushes.slice(),
        sideEffects: sideEffects.slice(),
        timer: global.timer,
        autotick: global.autotick,
        keyRepeatTimer: global.keyRepeatTimer,
        againing: global.againing,
        winning: global.winning
    };
}

function runActiveHostInputOutputLoopScenario(scenario) {
    const canvasElement = { id: "gameCanvas3D", addEventListener: () => {} };
    const { listeners, calls, pushes, sideEffects } = loadInputOutputForTest({ canvas: canvasElement });
    const hostCalls = [];
    Object.assign(global, scenario.state || {});
    global.PuzzleHostCapabilities = {
        hasActiveBrowserSession: () => true,
        processBrowserInput: input => {
            hostCalls.push(input);
            return scenario.processInputResult !== undefined ? scenario.processInputResult : true;
        }
    };
    global.redraw = () => sideEffects.push(["redraw"]);

    for (const timestamp of scenario.frames || [0])
        listeners.frame(timestamp);

    return {
        hostCalls: hostCalls.slice(),
        calls: calls.slice(),
        pushes: pushes.slice(),
        sideEffects: sideEffects.slice(),
        autotick: global.autotick,
        keyRepeatTimer: global.keyRepeatTimer
    };
}

function run2DInputOutputLoopOracleScenario(scenario) {
    return runInputOutputLoopScenario("gameCanvas", scenario);
}

function run3DInputOutputLoopScenario(scenario) {
    return runInputOutputLoopScenario("gameCanvas3D", scenario);
}

function testBrowserLoopTimingMatches2DOracle() {
    const scenarios = [
        {
            name: "again interval fires no-input turn and resets loop counters",
            state: {
                againing: true,
                againinterval: 150,
                timer: 150,
                autotick: 80,
                keyRepeatTimer: 5,
                messagetext: ""
            },
            frames: [0],
            processInputResult: true
        },
        {
            name: "again interval waits while message text is visible",
            state: {
                againing: true,
                againinterval: 150,
                timer: 200,
                messagetext: "message"
            },
            frames: [0],
            processInputResult: true
        },
        {
            name: "realtime interval queues tick and no-input turn when unblocked",
            state: {
                autotickinterval: 100,
                autotick: 95,
                textMode: false,
                levelEditorOpened: false,
                againing: false,
                winning: false,
                messagetext: ""
            },
            frames: [0],
            processInputResult: true
        },
        {
            name: "realtime interval is blocked during winning delay",
            state: {
                autotickinterval: 100,
                autotick: 95,
                winning: true,
                timer: 100,
                messagetext: ""
            },
            frames: [0],
            processInputResult: true
        },
        {
            name: "winning delay advances level through existing loop state",
            state: {
                winning: true,
                timer: 500,
                messagetext: ""
            },
            frames: [0],
            processInputResult: true
        }
    ];

    for (const scenario of scenarios) {
        assert.deepStrictEqual(
            run3DInputOutputLoopScenario(scenario),
            run2DInputOutputLoopOracleScenario(scenario),
            scenario.name
        );
    }
}

function testActiveBrowserHostReceivesBrowserLoopNoInputTurns() {
    assert.deepStrictEqual(
        runActiveHostInputOutputLoopScenario({
            state: {
                againing: true,
                againinterval: 150,
                timer: 150,
                autotick: 80,
                keyRepeatTimer: 5,
                messagetext: ""
            },
            frames: [0],
            processInputResult: true
        }),
        {
            hostCalls: [-1],
            calls: [],
            pushes: [],
            sideEffects: [["redraw"]],
            autotick: 0,
            keyRepeatTimer: 5
        }
    );

    assert.deepStrictEqual(
        runActiveHostInputOutputLoopScenario({
            state: {
                autotickinterval: 100,
                autotick: 95,
                textMode: false,
                levelEditorOpened: false,
                againing: false,
                winning: false,
                messagetext: ""
            },
            frames: [0],
            processInputResult: true
        }),
        {
            hostCalls: [-1],
            calls: [],
            pushes: ["tick"],
            sideEffects: [["redraw"]],
            autotick: 0,
            keyRepeatTimer: 0
        }
    );
}

function testNo3DInputAdapterHookInInputOutput() {
    const source = fs.readFileSync(path.join(__dirname, "../src/js/inputoutput3d.js"), "utf8");

    assert(!source.includes("BrowserGameAdapter"));
    assert(!source.includes("Puzzle3DInputAdapter"));
}

testActiveCanvasUsesExistingKeyboardGate();
testNonCanvasTargetDoesNotEnterKeyboardGate();
testKeyboardListenersRunBeforeEditorBubbleHandlers();
testCanvasMouseDownBlursEditorInputForGameKeys();
testNonCanvasMouseDownDoesNotBlurEditorInputForGameKeys();
testUndoAndRestartStayOnExistingCommands();
testActiveBrowserHostReceivesUndoAndRestartCommands();
testActiveBrowserHostWithoutCommandBoundaryDoesNotFallBackTo2DCommands();
test3DMessageShellUsesOrdinaryLevelsForCloseInput();
test3DTitleShellUsesOrdinaryLevels();
testTitleShellActionUsesExistingNextLevelOnUpdate();
testCanvasClickThenKeyboardUsesExistingTitleShellPath();
test3DCanvasClickEntersExistingKeyboardGateEvenIfCanvasBindingIsStale();
testActiveBrowserHostReceivesKeyboardInputInsteadOf2DProcessInput();
testInactiveBrowserHostFallsBackTo2DProcessInput();
testActiveBrowserHostWithoutInputBoundaryDoesNotFallBackTo2DProcessInput();
test3DLevelMessageCloseUpdateMatches2DOracle();
testWinningUpdateUsesExistingNextLevel();
testBrowserLoopTimingMatches2DOracle();
testActiveBrowserHostReceivesBrowserLoopNoInputTurns();
testNo3DInputAdapterHookInInputOutput();

console.log("3d inputoutput tests passed");
