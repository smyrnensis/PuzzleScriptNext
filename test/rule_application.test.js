const assert = require("assert");

const commandQueue = require("../src/js/command_queue.js");
const ruleApplication = require("../src/js/rule_application.js");

function testAppliesRuleGroupsThroughSharedSequence() {
    const board = { values: [1, 2], uniform: () => 0 };
    const commandState = commandQueue.createCommandState();
    const calls = [];
    const changedByLine = {};
    const groups = [
        [{ lineNumber: 1, groupNumber: 1, patterns: ["match"], commands: [["log", "first"]] }],
        [{ lineNumber: 2, groupNumber: 2, patterns: ["miss"], commands: [["log", "second"]] }]
    ];

    const result = ruleApplication.applyRuleGroups(board, groups, {}, commandState, null, {}, {
        applyRuleGroup: function(targetBoard, group, options, targetCommandState) {
            calls.push(group[0].lineNumber);
            if (changedByLine[group[0].lineNumber])
                return { returnValue: false, changed: false };
            changedByLine[group[0].lineNumber] = true;
            commandQueue.queueCommands(targetCommandState, group[0]);
            return { returnValue: true, changed: true };
        }
    });

    assert.strictEqual(result.returnValue, true);
    assert.deepStrictEqual(calls, [1, 2]);
    assert.deepStrictEqual(commandState.logs.map(log => log.message), ["first", "second"]);
}

function testMultiPatternRuleRequiresEveryPatternAndQueuesOnce() {
    const board = { values: [1], uniform: () => 0 };
    const commandState = commandQueue.createCommandState();
    const rule = {
        lineNumber: 3,
        patterns: ["match", "miss"],
        commands: [["log", "nope"]]
    };

    const changed = ruleApplication.applyRule(board, rule, {}, commandState, makeHooks());

    assert.strictEqual(changed, false);
    assert.deepStrictEqual(commandState.logs, []);

    rule.patterns = ["match", "match"];
    const changedAfterBothMatch = ruleApplication.applyRule(board, rule, {}, commandState, makeHooks());

    assert.strictEqual(changedAfterBothMatch, true);
    assert.deepStrictEqual(commandState.logs.map(log => log.message), ["nope"]);
}

function testTupleReplacementsRecheckLaterTuples() {
    const board = { values: [1], uniform: () => 0 };
    let valid = false;
    const changed = ruleApplication.applyRuleTupleReplacements(board, [{ id: 1 }], {}, true, {
        isMatchStillValid: function() {
            return valid;
        },
        applyMatchReplacements: function() {
            throw new Error("should not apply invalid tuple");
        }
    });

    assert.strictEqual(changed, false);

    valid = true;
    const validChanged = ruleApplication.applyRuleTupleReplacements(board, [{ id: 1 }], {}, true, {
        isMatchStillValid: function() {
            return true;
        },
        applyMatchReplacements: function() {
            return true;
        }
    });

    assert.strictEqual(validChanged, true);
}

function makeHooks() {
    return ruleApplication.buildRuleApplicationHooks({
        findPatternMatches: function(_board, pattern) {
            return pattern === "match" ? [[{ pattern }]] : [];
        },
        isMatchStillValid: function() {
            return true;
        },
        applyMatchReplacements: function() {
            return true;
        },
        queueCommands: function(commandState, rule) {
            commandQueue.queueCommands(commandState, rule);
        }
    });
}

testAppliesRuleGroupsThroughSharedSequence();
testMultiPatternRuleRequiresEveryPatternAndQueuesOnce();
testTupleReplacementsRecheckLaterTuples();

console.log("rule application tests passed");
