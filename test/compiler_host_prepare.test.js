const assert = require("assert");

function loadCompilerForHostPrepareTest() {
    const calls = [];

    global.ThreeDimensionLevels = {};
    global.Level = function Level() {};
    global.BitVec = function BitVec() {};
    global.logErrorNoLine = message => calls.push(["logErrorNoLine", message]);
    global.consoleError = message => calls.push(["consoleError", message]);
    global.consoleCacheDump = () => calls.push(["consoleCacheDump"]);
    global.setGameState = (state, command, randomseed) => calls.push(["setGameState", state, command, randomseed]);
    global.clearInputHistory = () => calls.push(["clearInputHistory"]);

    delete global.window;
    delete global.PuzzleHostCapabilities;
    delete global.globalThis.PuzzleHostCapabilities;
    delete require.cache[require.resolve("../src/js/compiler3d.js")];

    return {
        compiler: require("../src/js/compiler3d.js"),
        calls
    };
}

async function test3DHostPreparationRunsBeforeStart() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE", "webgl"] }]
    };
    let prepared = false;

    global.PuzzleHostCapabilities = {
        prepareCompiledState: actualState => {
            calls.push(["prepareCompiledState", actualState]);
            prepared = true;
            return Promise.resolve();
        },
        startCompiledState: (actualState, command, randomseed) => {
            calls.push(["startCompiledState", actualState, command, randomseed]);
            return actualState;
        },
        canStart: () => prepared
    };

    const result = await compiler.startCompiledStateAfterHostPreparation(state, ["restart"], 17);

    assert.strictEqual(result, state);
    assert.deepStrictEqual(calls, [
        ["prepareCompiledState", state],
        ["startCompiledState", state, ["restart"], 17],
        ["consoleCacheDump"]
    ]);
}

function test2DStateStartsSynchronouslyWithoutHostPreparation() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ width: 1, height: 1 }],
        hostCapabilities: []
    };

    const result = compiler.startCompiledStateAfterHostPreparation(state, ["restart"], 23);

    assert.strictEqual(result, state);
    assert.deepStrictEqual(calls, [
        ["setGameState", state, ["restart"], 23],
        ["clearInputHistory"],
        ["consoleCacheDump"]
    ]);
}

function test2DStateDoesNotInfer3DHostCapability() {
    const { compiler } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ width: 1, height: 1 }]
    };

    assert.strictEqual(compiler.hasThreeDimensionLevels(state), false);
    assert.deepStrictEqual(compiler.inferHostCapabilities(state), []);
}

async function testHostPreparationErrorIsReported() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE"] }]
    };

    global.PuzzleHostCapabilities = {
        prepareCompiledState: () => Promise.reject(new Error("missing renderer capability"))
    };

    const result = await compiler.startCompiledStateAfterHostPreparation(state, ["restart"], null);

    assert.strictEqual(result, null);
    assert.deepStrictEqual(calls, [
        ["consoleError", '<span class="systemMessage">missing renderer capability</span>'],
        ["consoleCacheDump"]
    ]);
}

async function test3DHostCapabilityRequiresLoadedHost() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE"] }]
    };

    const result = await compiler.startCompiledStateAfterHostPreparation(state, ["restart"], null);

    assert.strictEqual(result, null);
    assert.deepStrictEqual(calls, [
        ["consoleError", '<span class="systemMessage">Browser playback requires a host capability preparer to be loaded.</span>'],
        ["consoleCacheDump"]
    ]);
}

async function test3DHostCapabilityRejectsIncompleteHost() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE"] }]
    };

    global.PuzzleHostCapabilities = {};

    const result = await compiler.startCompiledStateAfterHostPreparation(state, ["restart"], null);

    assert.strictEqual(result, null);
    assert.deepStrictEqual(calls, [
        ["consoleError", '<span class="systemMessage">Browser playback host is missing prepareCompiledState().</span>'],
        ["consoleCacheDump"]
    ]);
}

async function test3DHostCapabilityRejectsMissingStartBoundary() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE"] }]
    };

    global.PuzzleHostCapabilities = {
        prepareCompiledState: () => Promise.resolve(),
        canStart: () => true
    };

    const result = await compiler.startCompiledStateAfterHostPreparation(state, ["restart"], null);

    assert.strictEqual(result, null);
    assert.deepStrictEqual(calls, [
        ["consoleError", '<span class="systemMessage">Browser playback host is missing startCompiledState().</span>'],
        ["consoleCacheDump"]
    ]);
}

async function testPending3DPreparationDoesNotStartAfterNewer2DStart() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state3D = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE", "webgl"] }]
    };
    const state2D = {
        levels: [{ width: 1, height: 1 }],
        hostCapabilities: []
    };
    let resolvePreparation;

    global.PuzzleHostCapabilities = {
        prepareCompiledState: actualState => {
            calls.push(["prepareCompiledState", actualState]);
            return new Promise(resolve => {
                resolvePreparation = resolve;
            });
        },
        startCompiledState: (actualState, command, randomseed) => {
            calls.push(["startCompiledState", actualState, command, randomseed]);
            return actualState;
        }
    };

    const staleStart = compiler.startCompiledStateAfterHostPreparation(state3D, ["restart"], 11);
    const freshStart = compiler.startCompiledStateAfterHostPreparation(state2D, ["restart"], 22);

    assert.strictEqual(freshStart, state2D);
    resolvePreparation();
    const staleResult = await staleStart;

    assert.strictEqual(staleResult, null);
    assert.deepStrictEqual(calls, [
        ["prepareCompiledState", state3D],
        ["setGameState", state2D, ["restart"], 22],
        ["clearInputHistory"],
        ["consoleCacheDump"]
    ]);
}

async function testStale3DPreparationErrorIsNotReportedAfterNewer2DStart() {
    const { compiler, calls } = loadCompilerForHostPrepareTest();
    const state3D = {
        levels: [{ is3d: true }],
        hostCapabilities: [{ kind: "renderer", requires: ["THREE"] }]
    };
    const state2D = {
        levels: [{ width: 1, height: 1 }],
        hostCapabilities: []
    };
    let rejectPreparation;

    global.PuzzleHostCapabilities = {
        prepareCompiledState: actualState => {
            calls.push(["prepareCompiledState", actualState]);
            return new Promise((_resolve, reject) => {
                rejectPreparation = reject;
            });
        }
    };

    const staleStart = compiler.startCompiledStateAfterHostPreparation(state3D, ["restart"], 31);
    const freshStart = compiler.startCompiledStateAfterHostPreparation(state2D, ["restart"], 32);

    assert.strictEqual(freshStart, state2D);
    rejectPreparation(new Error("stale 3D preparation failed"));
    const staleResult = await staleStart;

    assert.strictEqual(staleResult, null);
    assert.deepStrictEqual(calls, [
        ["prepareCompiledState", state3D],
        ["setGameState", state2D, ["restart"], 32],
        ["clearInputHistory"],
        ["consoleCacheDump"]
    ]);
}

async function run() {
    await test3DHostPreparationRunsBeforeStart();
    test2DStateStartsSynchronouslyWithoutHostPreparation();
    test2DStateDoesNotInfer3DHostCapability();
    await testHostPreparationErrorIsReported();
    await test3DHostCapabilityRequiresLoadedHost();
    await test3DHostCapabilityRejectsIncompleteHost();
    await test3DHostCapabilityRejectsMissingStartBoundary();
    await testPending3DPreparationDoesNotStartAfterNewer2DStart();
    await testStale3DPreparationErrorIsNotReportedAfterNewer2DStart();
}

run().then(function() {
    console.log("compiler host prepare tests passed");
}).catch(function(err) {
    console.error(err);
    process.exit(1);
});
