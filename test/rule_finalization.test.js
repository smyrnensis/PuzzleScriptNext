const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const finalization = require("../src/js/rule_finalization.js");
const ruleGrouping = require("../src/js/rule_grouping.js");

function rule(lineNumber, groupNumber, flags) {
    return Object.assign({ lineNumber, groupNumber }, flags || {});
}

function testLoopPointsMatch2DNormalAndLatePolicies() {
    const loops = [
        [15, 1],
        [25, -1]
    ];
    const normalGroups = [
        [rule(10, 1)],
        [rule(30, 2)]
    ];
    const lateGroups = [
        [rule(10, 1)],
        [rule(30, 2)]
    ];

    const result = finalization.generateLoopPoints(loops, normalGroups, lateGroups);

    assert.deepStrictEqual(result.loopPoint, {});
    assert.deepStrictEqual(result.lateLoopPoint, { 0: 1 });
}

function testLoopPointWarningsAndErrorsUse2DMessages() {
    const warnings = [];
    const errors = [];

    finalization.generateLoopPoints([[10, -1]], [[rule(10, 1)]], [], {
        onWarning: function(message, lineNumber) {
            warnings.push({ message, lineNumber });
        },
        onError: function(message, lineNumber) {
            errors.push({ message, lineNumber });
        }
    });

    assert.deepStrictEqual(warnings, [
        {
            message: "Found a loop point in the middle of a rule. You probably don't want to do this, right?",
            lineNumber: 10
        }
    ]);
    assert.deepStrictEqual(errors, [
        {
            message: "Found an ENDLOOP, but I'm not in a loop?",
            lineNumber: 10
        }
    ]);
}

function testRigidGroupStateSupports2DAnd3DSelectors() {
    const groups = [
        [rule(1, 10)],
        [rule(2, 20, { isRigid: true })],
        [rule(3, 30, { rigid: true })]
    ];

    const twoD = finalization.buildRigidGroupState(groups, {
        isRigid: function(targetRule) {
            return !!targetRule.isRigid;
        }
    });
    const threeD = finalization.buildRigidGroupState(groups, {
        isRigid: function(targetRule) {
            return !!targetRule.rigid;
        }
    });

    assert.deepStrictEqual(twoD.rigidGroups, [false, true, false]);
    assert.deepStrictEqual(twoD.rigidGroupIndexToGroupIndex, [1]);
    assert.deepStrictEqual(twoD.groupNumberToRigidGroupIndex[20], 0);
    assert.deepStrictEqual(threeD.rigidGroups, [false, false, true]);
    assert.deepStrictEqual(threeD.rigidGroupIndexToGroupIndex, [2]);
    assert.deepStrictEqual(threeD.groupNumberToRigidGroupIndex[30], 0);
}

function testFinalizeRuleRuntimeOwnsSharedFinalizationOrder() {
    const normalRules = [
        rule(30, 2, { rigid: true }),
        rule(10, 1)
    ];
    const lateRules = [
        rule(40, 4),
        rule(20, 3)
    ];
    const gosubCalls = [];

    const result = finalization.finalizeRuleRuntime({
        normalRules,
        lateRules,
        loops: [[15, 1], [35, -1]],
        subroutines: [{ lineNumber: 99 }],
        ruleContract: "state.rules3d",
        isRigid: function(targetRule) {
            return !!targetRule.rigid;
        },
        fixUpGosubs: function(groups, subroutines) {
            gosubCalls.push({ groups, subroutines });
        }
    });

    assert.deepStrictEqual(result.groups.map(group => group[0].groupNumber), [1, 2]);
    assert.deepStrictEqual(result.lateGroups.map(group => group[0].groupNumber), [3, 4]);
    assert.deepStrictEqual(result.loopPoint, { 2: 1 });
    assert.deepStrictEqual(result.lateLoopPoint, { 0: 0 });
    assert.deepStrictEqual(result.subroutines, [{ lineNumber: 99 }]);
    assert.strictEqual(gosubCalls.length, 2);
    assert.strictEqual(gosubCalls[0].groups, result.groups);
    assert.strictEqual(gosubCalls[1].groups, result.lateGroups);
    assert.deepStrictEqual(result.rigidGroups, [false, true]);
    assert.deepStrictEqual(result.rigidGroupIndexToGroupIndex, [1]);
    assert.deepStrictEqual(result.groupNumberToRigidGroupIndex[2], 0);
    assert.deepStrictEqual(result.finalization, {
        ruleContract: "state.rules3d"
    });
    assert.deepStrictEqual(result.inactive2DRuntimeProjection, {
        rules: [],
        lateRules: [],
        rigidGroups: [],
        loopPoint: {},
        lateLoopPoint: {}
    });
}

function testProjectFinalizedRuntimeKeepsProjectionOutOfCompiler() {
    const finalized = finalization.finalizeRuleRuntime({
        normalRules: [rule(1, 1, { rigid: true })],
        lateRules: [rule(2, 2)],
        ruleContract: "runtime.rules",
        isRigid: function(targetRule) {
            return !!targetRule.rigid;
        }
    });

    const projection = finalization.projectFinalizedRuntime(finalized, {
        ruleContract: "state.rules3d"
    });

    assert.deepStrictEqual(projection.runtimeRules.groups.map(group => group[0].groupNumber), [1]);
    assert.deepStrictEqual(projection.runtimeRules.lateGroups.map(group => group[0].groupNumber), [2]);
    assert.deepStrictEqual(projection.runtimeRules.finalization, {
        ruleContract: "state.rules3d"
    });
    assert.deepStrictEqual(projection.rigidState.rigidGroups, [true]);
    assert.deepStrictEqual(projection.rigidState.rigidGroupIndexToGroupIndex, [0]);
    assert.deepStrictEqual(projection.inactive2DRuntimeProjection, {
        rules: [],
        lateRules: [],
        rigidGroups: [],
        loopPoint: {},
        lateLoopPoint: {}
    });
}

function testSharedFinalizationMatches2DCompilerOracle() {
    const oracle = load2DCompilerFinalizationOracle();
    const input = {
        normalRules: [
            rule(30, 3, { isRigid: true }),
            rule(10, 1),
            rule(20, 2)
        ],
        lateRules: [
            rule(50, 5),
            rule(40, 4, { isRigid: true })
        ],
        loops: [
            [15, 1],
            [35, -1],
            [45, 1],
            [55, -1]
        ],
        subroutines: []
    };

    const expected = JSON.parse(JSON.stringify(oracle.run(input)));
    const actual = finalizationSnapshot(finalization.finalizeRuleRuntime({
        normalRules: input.normalRules,
        lateRules: input.lateRules,
        loops: input.loops,
        subroutines: input.subroutines,
        isRigid: function(targetRule) {
            return !!targetRule.isRigid;
        }
    }));

    assert.deepStrictEqual(actual, expected);
}

function finalizationSnapshot(result) {
    return {
        groups: result.groups.map(group => group.map(targetRule => targetRule.groupNumber)),
        lateGroups: result.lateGroups.map(group => group.map(targetRule => targetRule.groupNumber)),
        loopPoint: result.loopPoint,
        lateLoopPoint: result.lateLoopPoint,
        rigidGroups: result.rigidGroups,
        rigidGroupIndexToGroupIndex: result.rigidGroupIndexToGroupIndex,
        groupNumberToRigidGroupIndex: sparseArrayToObject(result.groupNumberToRigidGroupIndex),
        groupIndexToRigidGroupIndex: sparseArrayToObject(result.groupIndexToRigidGroupIndex)
    };
}

function sparseArrayToObject(values) {
    const result = {};
    for (let i = 0; i < values.length; i++) {
        if (values[i] !== undefined)
            result[i] = values[i];
    }
    return result;
}

function load2DCompilerFinalizationOracle() {
    const compilerPath = path.join(__dirname, "../src/js/compiler.js");
    const source = fs.readFileSync(compilerPath, "utf8");
    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        RuleGrouping: ruleGrouping,
        RuleFinalization: finalization,
        Level: function Level() {},
        debugMode: false,
        debugSwitch: "",
        logError: function(message, lineNumber) {
            throw new Error(message + " @ " + lineNumber);
        },
        logWarning: function() {},
        consolePrint: function() {},
        consolePrintFromRule: function() {},
        htmlJump: function(lineNumber) { return String(lineNumber); },
        colorPalettes: { arnecolors: {} },
        colorToHex: function(_palette, value) { return value || "#000000"; },
        canSetHTMLColors: false,
        document: {
            body: {},
            getElementById: function() { return null; },
            getElementsByTagName: function() { return []; }
        },
        window: {}
    };

    const hooks = `
module.exports.__finalizationOracle = {
    run: function(input) {
        var state = {
            rules: input.normalRules.map(function(rule) { return Object.assign({}, rule); }).concat(
                input.lateRules.map(function(rule) {
                    return Object.assign({}, rule, { late: true });
                })
            ),
            lateRules: [],
            loops: input.loops.map(function(loop) { return loop.slice(); }),
            subroutines: input.subroutines || []
        };
        arrangeRulesByGroupNumber(state);
        generateRigidGroupList(state);
        generateLoopPoints(state);
        return {
            groups: state.rules.map(function(group) {
                return group.map(function(rule) { return rule.groupNumber; });
            }),
            lateGroups: state.lateRules.map(function(group) {
                return group.map(function(rule) { return rule.groupNumber; });
            }),
            loopPoint: state.loopPoint,
            lateLoopPoint: state.lateLoopPoint,
            rigidGroups: state.rigidGroups,
            rigidGroupIndexToGroupIndex: state.rigidGroupIndex_to_GroupIndex,
            groupNumberToRigidGroupIndex: sparseArrayToObject(state.groupNumber_to_RigidGroupIndex),
            groupIndexToRigidGroupIndex: sparseArrayToObject(state.groupIndex_to_RigidGroupIndex)
        };
    }
};

function sparseArrayToObject(values) {
    var result = {};
    for (var i = 0; i < values.length; i++) {
        if (values[i] !== undefined)
            result[i] = values[i];
    }
    return result;
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: compilerPath });
    return context.module.exports.__finalizationOracle;
}

testLoopPointsMatch2DNormalAndLatePolicies();
testLoopPointWarningsAndErrorsUse2DMessages();
testRigidGroupStateSupports2DAnd3DSelectors();
testFinalizeRuleRuntimeOwnsSharedFinalizationOrder();
testProjectFinalizedRuntimeKeepsProjectionOutOfCompiler();
testSharedFinalizationMatches2DCompilerOracle();

console.log("rule finalization tests passed");
