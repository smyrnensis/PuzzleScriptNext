const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const randomRuleGroups = require("../src/js/random_rule_groups.js");

function load2DRandomRuleGroupOracle() {
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
            URL: "test://random-rule-groups",
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
        CommandQueue: require("../src/js/command_queue.js"),
        RandomRuleGroups: randomRuleGroups,
        SfxArtifacts: require("../src/js/sfx_artifacts.js")
    };

    const hooks = `
module.exports.__randomRuleGroupOracle = {
    run: function(options) {
        options = options || {};
        RandomGen = { uniform: function() { return options.uniform || 0; } };
        perfCounters = { randoms: 0 };

        var applied = [];
        var queued = [];
        var level = {
            delta_index: function(direction) {
                return options.deltaByDirection && options.deltaByDirection[direction] || 0;
            }
        };
        var rules = (options.rules || []).map(function(spec, index) {
            return {
                direction: spec.direction || index,
                lineNumber: spec.lineNumber || index + 1,
                findMatches: function() {
                    return JSON.parse(JSON.stringify(spec.matches || []));
                },
                applyAt: function(_level, tuple, check, delta) {
                    applied.push({
                        lineNumber: this.lineNumber,
                        tuple: JSON.parse(JSON.stringify(tuple)),
                        check: check,
                        delta: delta
                    });
                    return !!spec.changed;
                },
                queueCommands: function() {
                    queued.push(this.lineNumber);
                }
            };
        });

        var changed = applyRandomRuleGroup(level, rules);
        return {
            changed: changed,
            applied: applied,
            queued: queued,
            randoms: perfCounters.randoms
        };
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__randomRuleGroupOracle;
}

function runSharedScenario(options) {
    const applied = [];
    const queued = [];
    const level = {
        delta_index: function(direction) {
            return options.deltaByDirection && options.deltaByDirection[direction] || 0;
        }
    };
    const rules = (options.rules || []).map(function(spec, index) {
        return {
            direction: spec.direction || index,
            lineNumber: spec.lineNumber || index + 1,
            findMatches: function() {
                return JSON.parse(JSON.stringify(spec.matches || []));
            },
            applyAt: function(_level, tuple, check, delta) {
                applied.push({
                    lineNumber: this.lineNumber,
                    tuple: JSON.parse(JSON.stringify(tuple)),
                    check,
                    delta
                });
                return !!spec.changed;
            },
            queueCommands: function() {
                queued.push(this.lineNumber);
            }
        };
    });

    const changed = randomRuleGroups.applyRandomRuleGroup(level, rules, {
        uniform: function() { return options.uniform || 0; }
    });

    return {
        changed,
        applied,
        queued,
        randoms: 1
    };
}

function testScenariosMatch2DOracle() {
    const oracle = load2DRandomRuleGroupOracle();
    const scenarios = [
        {
            name: "empty candidate set is a no-op",
            uniform: 0.75,
            rules: [
                { matches: [] },
                { matches: [] }
            ],
            expected: { changed: false, applied: [], queued: [], randoms: 1 }
        },
        {
            name: "uniform selects from flattened rule tuple candidates",
            uniform: 0.5,
            deltaByDirection: { 3: 30, 4: 40 },
            rules: [
                {
                    direction: 3,
                    lineNumber: 10,
                    matches: [["a", "b"], ["c"]],
                    changed: true
                },
                {
                    direction: 4,
                    lineNumber: 20,
                    matches: [["d"]],
                    changed: true
                }
            ],
            expected: {
                changed: true,
                applied: [{ lineNumber: 10, tuple: ["b", "c"], check: false, delta: 30 }],
                queued: [10],
                randoms: 1
            }
        },
        {
            name: "commands queue even when selected replacement does not change",
            uniform: 0.99,
            deltaByDirection: { 4: 40 },
            rules: [
                {
                    direction: 3,
                    lineNumber: 10,
                    matches: [["a"], ["b"]],
                    changed: true
                },
                {
                    direction: 4,
                    lineNumber: 20,
                    matches: [["d"]],
                    changed: false
                }
            ],
            expected: {
                changed: false,
                applied: [{ lineNumber: 20, tuple: ["d"], check: false, delta: 40 }],
                queued: [20],
                randoms: 1
            }
        }
    ];

    scenarios.forEach(function(scenario) {
        const oracleResult = JSON.parse(JSON.stringify(oracle.run(scenario)));
        const sharedResult = JSON.parse(JSON.stringify(runSharedScenario(scenario)));
        assert.deepStrictEqual(oracleResult, scenario.expected, `${scenario.name} 2D expected`);
        assert.deepStrictEqual(sharedResult, scenario.expected, `${scenario.name} shared expected`);
        assert.deepStrictEqual(sharedResult, oracleResult, `${scenario.name} shared equals 2D`);
    });
}

testScenariosMatch2DOracle();

console.log("random rule group 2D parity tests passed");
