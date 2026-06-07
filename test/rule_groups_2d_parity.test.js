const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const commandQueue = require("../src/js/command_queue.js");
const randomRuleGroups = require("../src/js/random_rule_groups.js");
const ruleGroups = require("../src/js/rule_groups.js");
const ruleApplication = require("../src/js/rule_application.js");
const sfxArtifacts = require("../src/js/sfx_artifacts.js");

function load2DRuleGroupOracle() {
    const enginePath = path.join(__dirname, "../src/js/engine.js");
    let source = fs.readFileSync(enginePath, "utf8");

    source = source.replace("\ngenerateTitleScreen();\nif (titleMode>0){", "\nif (titleMode>0){");
    source = source.replace("\ncanvasResize();\n\nfunction tryPlaySimpleSound", "\nfunction tryPlaySimpleSound");

    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        Event: function Event(name) { this.type = name; },
        RNG: function RNG() { this.uniform = function() { return 0; }; },
        document: {
            URL: "test://rule-groups",
            addEventListener: function() {},
            dispatchEvent: function() {},
            getElementById: function() { return null; },
            getElementsByTagName: function() { return []; },
            body: {}
        },
        window: {},
        Image: function Image() {},
        localStorage: {},
        debugSwitch: "",
        verbose_logging: false,
        curLevelNo: 0,
        curlevelTarget: null,
        solvedSections: [],
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        consolePrint: function() {},
        consolePrintFromRule: function() {},
        addToDebugTimeline: function() { return 0; },
        htmlColor: function(_color, text) { return text; },
        htmlJump: function(lineNumber) { return String(lineNumber); },
        canvasResize: function() {},
        tryLoadCustomFont: function() {},
        isSitelocked: function() { return false; },
        fillRange: function(start, end) {
            const result = [];
            for (let i = start; i < end; i++)
                result.push(i);
            return result;
        },
        fillAndHighlight: function(screen) { return screen; },
        deepClone: function(value) {
            return value == null ? value : JSON.parse(JSON.stringify(value));
        },
        twiddleMetaData: function() {},
        initSmoothCamera: function() {},
        regenSpriteImages: function() {},
        twiddleable_params: [],
        CommandQueue: commandQueue,
        RandomRuleGroups: randomRuleGroups,
        RuleGroups: ruleGroups,
        SfxArtifacts: sfxArtifacts
    };

    const hooks = `
module.exports.__ruleGroupOracle = {
    run: function(options) {
        options = options || {};
        perfCounters = { groups: 0 };
        curLevel = { marker: "level" };
        verbose_logging = false;
        var applied = [];
        var logs = [];
        logErrorCacheable = function(message, lineNumber) {
            logs.push({ message: message, lineNumber: lineNumber });
        };
        var rules = (options.rules || []).map(function(spec, index) {
            var calls = 0;
            return {
                isRandom: false,
                isOnce: !!spec.isOnce,
                lineNumber: spec.lineNumber || index + 1,
                tryApply: function(level) {
                    applied.push({ lineNumber: this.lineNumber, levelMarker: level.marker });
                    var sequence = spec.sequence || [];
                    var result = !!sequence[calls];
                    calls++;
                    return result;
                }
            };
        });
        var returnValue = applyRuleGroup(rules);
        return {
            returnValue: returnValue,
            applied: applied,
            groups: perfCounters.groups,
            logs: logs
        };
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__ruleGroupOracle;
}

function runSharedScenario(options) {
    const applied = [];
    const level = { marker: "level" };
    const rules = (options.rules || []).map(function(spec, index) {
        let calls = 0;
        return {
            isRandom: false,
            isOnce: !!spec.isOnce,
            lineNumber: spec.lineNumber || index + 1,
            tryApply: function(targetLevel) {
                applied.push({ lineNumber: this.lineNumber, levelMarker: targetLevel.marker });
                const sequence = spec.sequence || [];
                const result = !!sequence[calls];
                calls++;
                return result;
            }
        };
    });

    const result = ruleGroups.applyRuleGroup(level, rules);
    return {
        returnValue: result.returnValue,
        changed: result.changed,
        loopPropagated: result.loopPropagated,
        applied
    };
}

function testOrdinaryRuleGroupMatches2DOracle() {
    const oracle = load2DRuleGroupOracle();
    const scenarios = [
        {
            name: "no rule applies",
            rules: [
                { lineNumber: 10, sequence: [false] },
                { lineNumber: 20, sequence: [false] }
            ],
            expectedOracle: {
                returnValue: false,
                applied: [
                    { lineNumber: 10, levelMarker: "level" },
                    { lineNumber: 20, levelMarker: "level" }
                ],
                groups: 1,
                logs: []
            },
            expectedShared: {
                returnValue: false,
                changed: false,
                loopPropagated: false,
                applied: [
                    { lineNumber: 10, levelMarker: "level" },
                    { lineNumber: 20, levelMarker: "level" }
                ]
            }
        },
        {
            name: "non-once rule propagates and returns loop propagated",
            rules: [
                { lineNumber: 10, sequence: [true, false] }
            ],
            expectedOracle: {
                returnValue: true,
                applied: [
                    { lineNumber: 10, levelMarker: "level" },
                    { lineNumber: 10, levelMarker: "level" }
                ],
                groups: 1,
                logs: []
            },
            expectedShared: {
                returnValue: true,
                changed: true,
                loopPropagated: true,
                applied: [
                    { lineNumber: 10, levelMarker: "level" },
                    { lineNumber: 10, levelMarker: "level" }
                ]
            }
        },
        {
            name: "once rule can change without propagating the group return value",
            rules: [
                { lineNumber: 10, sequence: [true], isOnce: true }
            ],
            expectedOracle: {
                returnValue: false,
                applied: [
                    { lineNumber: 10, levelMarker: "level" }
                ],
                groups: 1,
                logs: []
            },
            expectedShared: {
                returnValue: false,
                changed: true,
                loopPropagated: false,
                applied: [
                    { lineNumber: 10, levelMarker: "level" }
                ]
            }
        },
        {
            name: "propagated pass restarts rule order",
            rules: [
                { lineNumber: 10, sequence: [true, false] },
                { lineNumber: 20, sequence: [false, false] }
            ],
            expectedOracle: {
                returnValue: true,
                applied: [
                    { lineNumber: 10, levelMarker: "level" },
                    { lineNumber: 20, levelMarker: "level" },
                    { lineNumber: 10, levelMarker: "level" }
                ],
                groups: 1,
                logs: []
            },
            expectedShared: {
                returnValue: true,
                changed: true,
                loopPropagated: true,
                applied: [
                    { lineNumber: 10, levelMarker: "level" },
                    { lineNumber: 20, levelMarker: "level" },
                    { lineNumber: 10, levelMarker: "level" }
                ]
            }
        }
    ];

    scenarios.forEach(function(scenario) {
        const oracleResult = JSON.parse(JSON.stringify(oracle.run(scenario)));
        const sharedResult = JSON.parse(JSON.stringify(runSharedScenario(scenario)));
        assert.deepStrictEqual(oracleResult, scenario.expectedOracle, `${scenario.name} 2D expected`);
        assert.deepStrictEqual(sharedResult, scenario.expectedShared, `${scenario.name} shared expected`);
        assert.deepStrictEqual(sharedResult.returnValue, oracleResult.returnValue, `${scenario.name} return value`);
        assert.deepStrictEqual(sharedResult.applied, oracleResult.applied, `${scenario.name} apply order`);
    });
}

function testRuleSequenceHandlesLoopPointsLike2DApplyRules() {
    const calls = [];
    const groups = [
        [{ lineNumber: 10 }],
        [{ lineNumber: 20 }]
    ];
    const groupResults = [
        [{ returnValue: false, changed: false }, { returnValue: true, changed: true }],
        [{ returnValue: true, changed: true }, { returnValue: false, changed: false }]
    ];

    const result = ruleGroups.applyRuleSequence({ marker: "level" }, groups, { 2: 0 }, [], 0, {
        applyRuleGroup: function(_level, group, groupIndex) {
            calls.push(group[0].lineNumber);
            return groupResults[groupIndex].shift();
        }
    });

    assert.deepStrictEqual(calls, [10, 20, 10, 20, 10, 20]);
    assert.strictEqual(result.returnValue, true);
    assert.strictEqual(result.changed, true);
}

function testRuleSequenceHandlesGosubAndReturnLike2DApplyRules() {
    const calls = [];
    const groups = [
        [{ lineNumber: 10 }],
        [{ lineNumber: 20 }],
        [{ lineNumber: 30 }]
    ];
    const subroutines = [{ label: "sub", lineNumber: 30 }];
    let gosubTarget = -1;

    const result = ruleGroups.applyRuleSequence({ marker: "level" }, groups, {}, subroutines, 0, {
        applyRuleGroup: function(_level, group, groupIndex) {
            calls.push(group[0].lineNumber);
            if (groupIndex === 0)
                gosubTarget = 2;
            return {
                returnValue: groupIndex === 2,
                changed: groupIndex === 2
            };
        },
        getGosubTarget: function() {
            return gosubTarget;
        },
        clearGosubTarget: function() {
            gosubTarget = -1;
        }
    });

    assert.deepStrictEqual(calls, [10, 30, 20]);
    assert.strictEqual(result.returnValue, true);
    assert.strictEqual(result.changed, true);
}

testOrdinaryRuleGroupMatches2DOracle();
testRuleSequenceHandlesLoopPointsLike2DApplyRules();
testRuleSequenceHandlesGosubAndReturnLike2DApplyRules();

console.log("rule group 2D parity tests passed");
