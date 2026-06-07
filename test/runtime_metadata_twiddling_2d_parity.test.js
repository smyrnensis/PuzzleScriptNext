const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const metadataTwiddling = require("../src/js/runtime_metadata_twiddling.js");

function load2DMetadataOracle() {
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
            URL: "test://runtime-metadata-twiddling",
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
        solvedSections: [],
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        consolePrint: function() {},
        addToDebugTimeline: function() { return 0; },
        htmlColor: function(_color, text) { return text; },
        htmlJump: function(lineNumber) { return String(lineNumber); },
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
        CommandQueue: require("../src/js/command_queue.js")
    };

    const hooks = `
var __metadataHookCalls = [];
function canvasResize() { __metadataHookCalls.push(["canvasResize"]); }
function initSmoothCamera() { __metadataHookCalls.push(["initSmoothCamera"]); }
function regenSpriteImages() { __metadataHookCalls.push(["regenSpriteImages"]); }
function twiddleMetadataExtras() { __metadataHookCalls.push(["twiddleMetadataExtras"]); }
function twiddleMetaData(_state, command) { __metadataHookCalls.push(["twiddleMetaData", command[0], command[1]]); }
function consolePrintFromRule(message, rule) { __metadataHookCalls.push(["consolePrintFromRule", message, rule && rule.lineNumber]); }
twiddleable_params = ${JSON.stringify(metadataTwiddling.TWIDDLEABLE_PARAMS)};
module.exports.__metadataOracle = {
    reset: function(options) {
        options = options || {};
        state = {
            metadata: JSON.parse(JSON.stringify(options.metadata || {})),
            default_metadata: JSON.parse(JSON.stringify(options.defaultMetadata || {})),
            sfx_Events: {},
            levels: [],
            sections: []
        };
        curLevel = {
            commandQueue: [],
            commandQueueSourceRules: []
        };
        messagetext = "";
        statusText = "";
        gosubTarget = -1;
        perfCounters = { commands: 0 };
        __metadataHookCalls.length = 0;
    },
    apply: function(command, lineNumber) {
        var rule = Object.create(Rule.prototype);
        rule.commands = [command];
        rule.lineNumber = lineNumber || 1;
        rule.queueCommands();
    },
    snapshot: function() {
        return {
            metadata: JSON.parse(JSON.stringify(state.metadata)),
            hookCalls: JSON.parse(JSON.stringify(__metadataHookCalls))
        };
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__metadataOracle;
}

function makeSharedRunner() {
    let state = null;
    let hookCalls = [];
    return {
        reset(options) {
            options = options || {};
            state = {
                metadata: JSON.parse(JSON.stringify(options.metadata || {})),
                default_metadata: JSON.parse(JSON.stringify(options.defaultMetadata || {}))
            };
            hookCalls = [];
        },
        apply(command, lineNumber) {
            metadataTwiddling.applyRuntimeMetadataCommand(state, command, { lineNumber: lineNumber || 1 }, {
                twiddleMetaData: function(_state, cmd) { hookCalls.push(["twiddleMetaData", cmd[0], cmd[1]]); },
                canvasResize: function() { hookCalls.push(["canvasResize"]); },
                initSmoothCamera: function() { hookCalls.push(["initSmoothCamera"]); },
                regenSpriteImages: function() { hookCalls.push(["regenSpriteImages"]); },
                twiddleMetadataExtras: function() { hookCalls.push(["twiddleMetadataExtras"]); },
                consolePrintFromRule: function(message, rule) { hookCalls.push(["consolePrintFromRule", message, rule && rule.lineNumber]); }
            });
        },
        snapshot() {
            return {
                metadata: JSON.parse(JSON.stringify(state.metadata)),
                hookCalls: JSON.parse(JSON.stringify(hookCalls))
            };
        }
    };
}

function runScenario(oracle, shared, scenario) {
    oracle.reset(scenario.initial);
    shared.reset(scenario.initial);
    for (const command of scenario.commands) {
        oracle.apply(command, scenario.lineNumber);
        shared.apply(command, scenario.lineNumber);
    }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(shared.snapshot())), JSON.parse(JSON.stringify(oracle.snapshot())), scenario.name);
}

const scenarios = [
    {
        name: "ignores twiddle commands when runtime flag is absent",
        initial: { metadata: { text_color: "white" }, defaultMetadata: { text_color: "white" } },
        commands: [["text_color", "red"]]
    },
    {
        name: "sets scalar metadata and runs extras",
        initial: { metadata: { runtime_metadata_twiddling: true }, defaultMetadata: {} },
        commands: [["text_color", "red"]]
    },
    {
        name: "wipe deletes metadata and logs original action under debug",
        initial: {
            metadata: { runtime_metadata_twiddling: true, runtime_metadata_twiddling_debug: true, noundo: true },
            defaultMetadata: {}
        },
        commands: [["noundo", "wipe"]],
        lineNumber: 12
    },
    {
        name: "default restores from default metadata by clone",
        initial: {
            metadata: { runtime_metadata_twiddling: true, norestart: true },
            defaultMetadata: { norestart: "default-value" }
        },
        commands: [["norestart", "default"]]
    },
    {
        name: "viewport metadata calls parser and resize hooks",
        initial: { metadata: { runtime_metadata_twiddling: true }, defaultMetadata: {} },
        commands: [["flickscreen", "3x3"], ["zoomscreen", "4x4"]]
    },
    {
        name: "smoothscreen wipe follows 2D null branch",
        initial: { metadata: { runtime_metadata_twiddling: true, smoothscreen: "old" }, defaultMetadata: {} },
        commands: [["smoothscreen", "wipe"]]
    },
    {
        name: "color palette regenerates sprites and resizes",
        initial: { metadata: { runtime_metadata_twiddling: true }, defaultMetadata: {} },
        commands: [["color_palette", "arne"]]
    }
];

const oracle = load2DMetadataOracle();
const shared = makeSharedRunner();
for (const scenario of scenarios)
    runScenario(oracle, shared, scenario);

console.log("runtime_metadata_twiddling_2d_parity: ok");
