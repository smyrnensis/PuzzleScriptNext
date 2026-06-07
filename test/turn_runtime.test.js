const assert = require("assert");

const commandQueue = require("../src/js/command_queue.js");
const turnRuntime = require("../src/js/turn_runtime.js");

function testRunsSharedTurnPipelineIn2DOrder() {
    const runtime = makeRuntime();
    const calls = [];
    const result = turnRuntime.processTurn(runtime, "right", {}, makeHooks({
        calls,
        applyRuleGroups(_board, groups) {
            calls.push(groups.name);
            return { returnValue: groups.name === "normal", changed: groups.name === "normal" };
        },
        resolveMovements() {
            calls.push("movement");
            runtime.board.cells[0] = 2;
            return {
                moved: true,
                movedEntities: { "p1-l0": 8 },
                rigidFailures: [],
                shouldUndo: false
            };
        }
    }));

    assert.deepStrictEqual(calls, ["seedInput", "normal", "movement", "late"]);
    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.rulesChangedBoard, true);
    assert.strictEqual(result.moved, true);
    assert.deepStrictEqual(result.movedEntities, { "p1-l0": 8 });
    assert.strictEqual(result.lateRulesChanged, false);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.changed, true);
}

function testRigidFailureRestoresAndRetriesWithBannedGroup() {
    const runtime = makeRuntime();
    const calls = [];
    let movementCount = 0;
    const result = turnRuntime.processTurn(runtime, null, {}, makeHooks({
        calls,
        applyRuleGroups(_board, groups) {
            calls.push(groups.name);
            return { returnValue: true, changed: true };
        },
        resolveMovements() {
            calls.push("movement");
            movementCount++;
            runtime.board.cells[0] = movementCount === 1 ? 9 : 2;
            return movementCount === 1
                ? { moved: false, rigidFailures: [{ groupIndex: 4 }], shouldUndo: true }
                : { moved: true, rigidFailures: [], shouldUndo: false };
        }
    }));

    assert.deepStrictEqual(calls, ["normal", "movement", "restore", "normal", "movement", "late"]);
    assert.deepStrictEqual(result.bannedGroups, { 4: true });
    assert.deepStrictEqual(runtime.board.cells, [2]);
}

function testRequirePlayerMovementRollbackMatchesSharedCommandBypass() {
    const runtime = makeRuntime({
        requirePlayerMovement: true,
        playerPositions: [0],
        hasPlayerAtPosition: true
    });
    const blocked = turnRuntime.processTurn(runtime, "right", {}, makeHooks({
        isRequirePlayerMovementEnabled() {
            return true;
        },
        hasPlayerAtPosition() {
            return true;
        },
        applyRuleGroups() {
            return { returnValue: false, changed: false };
        }
    }));

    assert.strictEqual(blocked.requirePlayerMovementFailed, true);
    assert.strictEqual(blocked.changed, false);
    assert.deepStrictEqual(runtime.board.cells, [1]);

    const bypassRuntime = makeRuntime({
        requirePlayerMovement: true,
        playerPositions: [0],
        hasPlayerAtPosition: true
    });
    const bypassed = turnRuntime.processTurn(bypassRuntime, "right", {}, makeHooks({
        isRequirePlayerMovementEnabled() {
            return true;
        },
        hasPlayerAtPosition() {
            return true;
        },
        applyRuleGroups(_board, groups, _options, commandState) {
            if (groups.name === "normal")
                commandQueue.queueCommands(commandState, { commands: [["undo"]], lineNumber: 10 });
            return { returnValue: false, changed: false };
        }
    }));

    assert.strictEqual(bypassed.requirePlayerMovementFailed, false);
    assert.deepStrictEqual(bypassed.commandQueue, ["undo"]);
}

function testDontDoWinSuppressesWinConditionAndWinCommand() {
    const runtime = makeRuntime();
    const result = turnRuntime.processTurn(runtime, null, { dontDoWin: true }, makeHooks({
        applyRuleGroups(_board, groups, _options, commandState) {
            if (groups.name === "normal")
                commandQueue.queueCommands(commandState, { commands: [["win"]], lineNumber: 11 });
            return { returnValue: false, changed: false };
        },
        evaluateWinConditions() {
            return true;
        }
    }));

    assert.strictEqual(result.winConditionSatisfied, true);
    assert.strictEqual(result.sessionArtifacts.winRequested, false);
}

function makeRuntime(options) {
    const opts = options || {};
    return {
        board: {
            cells: [1],
            playerPositions: opts.playerPositions || [],
            cloneSource() {
                return { cells: this.cells.slice() };
            }
        },
        rules: {
            groups: Object.assign([], { name: "normal" }),
            lateGroups: Object.assign([], { name: "late" }),
            loopPoint: {},
            lateLoopPoint: {},
            subroutines: [],
            winConditions: []
        }
    };
}

function makeHooks(overrides) {
    const opts = overrides || {};
    return Object.assign({
        getRules(runtime) {
            return runtime.rules;
        },
        cloneBoardSource(runtime) {
            return runtime.board.cloneSource();
        },
        createCommandState: commandQueue.createCommandState,
        applyRuleGroups(_board, groups) {
            return { returnValue: groups.name === "normal", changed: groups.name === "normal" };
        },
        resolveMovements() {
            return { moved: false, rigidFailures: [], shouldUndo: false };
        },
        restoreBoardFromSource(runtime, source) {
            if (opts.calls)
                opts.calls.push("restore");
            runtime.board.cells = source.cells.slice();
        },
        collectSfxArtifacts() {
            return { playSeeds: [], animations: {} };
        },
        evaluateWinConditions() {
            return false;
        },
        boardChanged(source, runtime) {
            return JSON.stringify(source.cells) !== JSON.stringify(runtime.board.cells);
        },
        findPlayerPositions(runtime) {
            return runtime.board.playerPositions.slice();
        },
        seedInputMovement(_runtime, inputDirection) {
            if (inputDirection && opts.calls)
                opts.calls.push("seedInput");
            return inputDirection ? [0] : [];
        },
        buildRuleOptions(_runtime, options) {
            return options;
        },
        isRequirePlayerMovementEnabled() {
            return false;
        },
        hasPlayerAtPosition() {
            return false;
        }
    }, opts);
}

testRunsSharedTurnPipelineIn2DOrder();
testRigidFailureRestoresAndRetriesWithBannedGroup();
testRequirePlayerMovementRollbackMatchesSharedCommandBypass();
testDontDoWinSuppressesWinConditionAndWinCommand();

console.log("turn runtime tests passed");
