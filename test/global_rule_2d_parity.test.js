const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rules3d = require("../src/js/rules3d.js");
const slots3d = require("../src/js/slots3d.js");
const runtime3d = require("../src/js/runtime3d.js");

function load2DGlobalRuleScanOracle() {
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
        RNG: function RNG() {},
        document: {
            URL: "test://global-rule-scan",
            addEventListener: function() {},
            dispatchEvent: function() {},
            getElementById: function() { return null; },
            getElementsByTagName: function() { return []; },
            body: {}
        },
        window: { console },
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
        RandomRuleGroups: require("../src/js/random_rule_groups.js"),
        RuleGroups: require("../src/js/rule_groups.js"),
        SfxArtifacts: require("../src/js/sfx_artifacts.js")
    };

    const hooks = `
module.exports.__globalRuleScanOracle = {
    run: function(options) {
        options = options || {};
        var mask = { bitsSetInArray: function() { return true; } };
        var rows = [];
        var cols = [];
        for (var y = 0; y < options.height; y++)
            rows.push({ data: [] });
        for (var x = 0; x < options.width; x++)
            cols.push({ data: [] });
        state = { metadata: options.metadata || {} };
        playerPositions = [options.playerIndex];
        curLevel = {
            width: options.width,
            height: options.height,
            objects: [],
            movements: [],
            mapCellContents: { data: [] },
            mapCellContents_Movements: { data: [] },
            rowCellContents: rows,
            rowCellContents_Movements: rows,
            colCellContents: cols,
            colCellContents_Movements: cols
        };
        var cellRow = [];
        for (var i = 0; i < options.length; i++)
            cellRow.push({});
        return matchCellRow(
            options.direction,
            function(_cellRow, index) { return true; },
            cellRow,
            mask,
            mask,
            options.delta || 0,
            !!options.isGlobal
        );
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__globalRuleScanOracle;
}

function run3DScanScenario(options) {
    const runtime = makeRuntime(options.width, options.height, 1);
    for (let index = 0; index < runtime.board.cellCount; index++)
        runtime.board.setCell(index, new Int32Array([1]));

    const pattern = rules3d.makePattern([
        {
            offset: { x: 0, y: 0, z: 0 },
            pattern: rules3d.makeCellPattern({ objectsPresent: new Int32Array([1]) })
        },
        {
            offset: { x: 1, y: 0, z: 0 },
            pattern: rules3d.makeCellPattern({ objectsPresent: new Int32Array([1]) })
        }
    ]);

    return rules3d.findPatternMatches(runtime.board, pattern, {
        scanDirection: "right",
        isGlobal: !!options.isGlobal,
        localRadius: options.metadata && options.metadata.local_radius,
        playerPositions: [options.playerIndex]
    }).map(match => match.origin);
}

function makeRuntime(width, height, depth) {
    const cellCount = width * height * depth;
    const level = {
        is3d: true,
        width,
        height,
        depth,
        cellCount,
        n_tiles: cellCount,
        layerCount: 1,
        objects: new Int32Array(cellCount)
    };

    return runtime3d.createRuntime3D(slots3d.buildSlots3D({
        metadata: {},
        default_metadata: {},
        levels: [level]
    }));
}

function testGlobalRuleBypassesLocalRadiusLike2D() {
    const oracle = load2DGlobalRuleScanOracle();
    const scenario = {
        width: 5,
        height: 5,
        playerIndex: 12,
        metadata: { local_radius: "1" },
        direction: 8,
        length: 2,
        isGlobal: true
    };

    assert.deepStrictEqual(run3DScanScenario(scenario), Array.from(oracle.run(scenario)));
}

function testNormalRuleUsesLocalRadiusLike2D() {
    const oracle = load2DGlobalRuleScanOracle();
    const scenario = {
        width: 5,
        height: 5,
        playerIndex: 12,
        metadata: { local_radius: "1" },
        direction: 8,
        length: 2,
        isGlobal: false
    };

    assert.deepStrictEqual(run3DScanScenario(scenario), Array.from(oracle.run(scenario)));
}

testGlobalRuleBypassesLocalRadiusLike2D();
testNormalRuleUsesLocalRadiusLike2D();

console.log("global rule 2d parity tests passed");
