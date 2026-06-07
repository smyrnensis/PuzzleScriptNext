const assert = require("assert");

const grouping = require("../src/js/rule_grouping.js");

function testArrangesNormalAndLateGroupsLike2D() {
    const rules = [
        { lineNumber: 1, groupNumber: 2 },
        { lineNumber: 2, groupNumber: 1 },
        { lineNumber: 3, groupNumber: 2 },
        { lineNumber: 4, groupNumber: 1, late: true }
    ];

    const arranged = grouping.arrangeRulesByGroupNumber(rules);

    assert.deepStrictEqual(arranged.groups.map(group => group.map(rule => rule.lineNumber)), [
        [2],
        [1, 3]
    ]);
    assert.deepStrictEqual(arranged.lateGroups.map(group => group.map(rule => rule.lineNumber)), [
        [4]
    ]);
}

function testDiscardsOverlappingRulesAndKeepsSameLineAlternativesLike2D() {
    const errors = [];
    const rules = [
        { lineNumber: 10, groupNumber: 1, discard: ["A", "B"] },
        { lineNumber: 10, groupNumber: 1 },
        { lineNumber: 11, groupNumber: 1 }
    ];

    const groups = grouping.groupRulesByGroupNumber(rules, {
        onError: function(message, lineNumber) {
            errors.push({ message, lineNumber });
        }
    });

    assert.deepStrictEqual(groups.map(group => group.map(rule => rule.lineNumber)), [
        [10, 11]
    ]);
    assert.deepStrictEqual(errors, []);
}

function testReportsWhenDiscardErasesWholeRuleLike2D() {
    const errors = [];
    const rules = [
        { lineNumber: 10, groupNumber: 1, discard: ["A", "B"] }
    ];

    const groups = grouping.groupRulesByGroupNumber(rules, {
        onError: function(message, lineNumber) {
            errors.push({ message, lineNumber });
        }
    });

    assert.deepStrictEqual(groups, []);
    assert.deepStrictEqual(errors, [
        {
            message: "A and B can never overlap, but this rule requires that to happen, so it's being culled.",
            lineNumber: 10
        }
    ]);
}

testArrangesNormalAndLateGroupsLike2D();
testDiscardsOverlappingRulesAndKeepsSameLineAlternativesLike2D();
testReportsWhenDiscardErasesWholeRuleLike2D();

console.log("rule grouping tests passed");
