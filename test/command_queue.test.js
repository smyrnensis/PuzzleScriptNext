const assert = require("assert");

const commandQueue = require("../src/js/command_queue.js");

function testQueuesCommandsWithMessageStatusAndGotoArtifacts() {
    const state = commandQueue.createCommandState();
    const rule = {
        lineNumber: 10,
        commands: [["message", "hello"], ["status", "ready"], ["goto", "next"], ["win"]]
    };

    commandQueue.queueCommands(state, rule);

    assert.deepStrictEqual(state.queue, ["message", "status", "goto,next", "win"]);
    assert.deepStrictEqual(state.sourceRules, [rule, rule, rule, rule]);
    assert.strictEqual(state.messageText, "hello");
    assert.strictEqual(state.statusText, "ready");
    assert.strictEqual(state.gosubTarget, -1);
    assert.strictEqual(commandQueue.hasCommandArtifacts(state), true);
}

function testCancelClearsExistingQueueAndBlocksLaterCommands() {
    const state = commandQueue.createCommandState();
    const firstRule = { lineNumber: 1, commands: [["win"]] };
    const cancelRule = { lineNumber: 2, commands: [["cancel"]] };
    const laterRule = { lineNumber: 3, commands: [["restart"]] };

    commandQueue.queueCommands(state, firstRule);
    commandQueue.queueCommands(state, cancelRule);
    commandQueue.queueCommands(state, laterRule);

    assert.deepStrictEqual(state.queue, ["cancel"]);
    assert.deepStrictEqual(state.sourceRules, [cancelRule]);
}

function testRestartBlocksLaterNonCancelCommands() {
    const state = commandQueue.createCommandState();
    const restartRule = { lineNumber: 1, commands: [["restart"]] };
    const winRule = { lineNumber: 2, commands: [["win"]] };

    commandQueue.queueCommands(state, restartRule);
    commandQueue.queueCommands(state, winRule);

    assert.deepStrictEqual(state.queue, ["restart"]);
    assert.deepStrictEqual(state.sourceRules, [restartRule]);
}

function testGosubAndLogAreArtifactsButNotQueued() {
    const state = commandQueue.createCommandState();
    const rule = { lineNumber: 1, commands: [["gosub", "sub"], ["log", "trace"]] };

    commandQueue.queueCommands(state, rule);

    assert.deepStrictEqual(state.queue, []);
    assert.strictEqual(state.gosubTarget, "sub");
    assert.deepStrictEqual(state.logs, [{ message: "trace", rule }]);
    assert.strictEqual(commandQueue.hasCommandArtifacts(state), true);
}

function testCollectsSessionArtifactsFromQueuedCommands() {
    const state = commandQueue.createCommandState({
        queue: ["message", "status", "goto,next", "win", "again", "checkpoint", "sfx3"],
        messageText: "hello",
        statusText: "ready",
        gosubTarget: "sub"
    });

    assert.deepStrictEqual(commandQueue.collectSessionArtifacts(state), {
        queue: ["message", "status", "goto,next", "win", "again", "checkpoint", "sfx3"],
        messageText: "hello",
        statusText: "ready",
        gotoTarget: "next",
        gosubTarget: "sub",
        logs: [],
        simpleSoundCommands: ["sfx3"],
        messageRequested: true,
        statusRequested: true,
        winRequested: true,
        againRequested: true,
        restartRequested: false,
        checkpointRequested: true,
        cancelRequested: false,
        undoRequested: false,
        quitRequested: false,
        nosaveRequested: false,
        linkRequested: false
    });
}

function testPlansSessionTailIn2DCommandPriorityOrder() {
    assert.deepStrictEqual(commandQueue.planSessionTail({
        queue: ["undo", "goto,next", "restart"],
        gotoTarget: "next",
        undoRequested: true,
        restartRequested: true
    }).terminalAction, { type: "undo" });

    assert.deepStrictEqual(commandQueue.planSessionTail({
        queue: ["goto,next", "restart"],
        gotoTarget: "next",
        restartRequested: true
    }).terminalAction, { type: "goto", target: "next" });

    assert.deepStrictEqual(commandQueue.planSessionTail({
        queue: ["cancel", "message"],
        cancelRequested: true
    }).terminalAction, { type: "cancel", commandsLeft: true });

    assert.deepStrictEqual(commandQueue.planSessionTail({
        queue: ["restart", "checkpoint"],
        restartRequested: true,
        checkpointRequested: true
    }).terminalAction, { type: "restart" });

    const winPlan = commandQueue.planSessionTail({
        queue: ["win", "checkpoint", "again"],
        winRequested: true,
        checkpointRequested: true,
        againRequested: true
    }, { modified: true });
    assert.strictEqual(winPlan.winRequested, true);
    assert.strictEqual(winPlan.checkpointRequested, false);
    assert.strictEqual(winPlan.againRequested, false);

    const againPlan = commandQueue.planSessionTail({
        queue: ["checkpoint", "again"],
        checkpointRequested: true,
        againRequested: true
    }, { modified: true });
    assert.strictEqual(againPlan.checkpointRequested, true);
    assert.strictEqual(againPlan.againRequested, true);
}

testQueuesCommandsWithMessageStatusAndGotoArtifacts();
testCancelClearsExistingQueueAndBlocksLaterCommands();
testRestartBlocksLaterNonCancelCommands();
testGosubAndLogAreArtifactsButNotQueued();
testCollectsSessionArtifactsFromQueuedCommands();
testPlansSessionTailIn2DCommandPriorityOrder();

console.log("command queue tests passed");
