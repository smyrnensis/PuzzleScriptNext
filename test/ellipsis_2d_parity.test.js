const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rules3d = require("../src/js/rules3d.js");
const slots3d = require("../src/js/slots3d.js");
const runtime3d = require("../src/js/runtime3d.js");

function load2DEllipsisOracle() {
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
            URL: "test://ellipsis-parity",
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
module.exports.__ellipsisOracle = {
    run: function(options) {
        options = options || {};
        var mask = { bitsSetInArray: function() { return true; } };
        var rows = [];
        var cols = [];
        for (var y = 0; y < options.height; y++)
            rows.push({ data: [] });
        for (var x = 0; x < options.width; x++)
            cols.push({ data: [] });
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
        var matcher = options.wildcardCount === 1
            ? function(_cellRow, origin, kmax, kmin) {
                var result = [];
                for (var k = kmin; k < kmax; k++)
                    result.push([origin, k]);
                return result;
            }
            : function(_cellRow, origin, k1max, k1min, k2max, k2min, kmax) {
                var result = [];
                for (var k1 = k1min; k1 < k1max; k1++) {
                    for (var k2 = k2min; k1 + k2 < kmax && k2 < k2max; k2++)
                        result.push([origin, k1, k2]);
                }
                return result;
            };
        return matchCellRowWildCard(
            options.direction,
            matcher,
            cellRow,
            mask,
            mask,
            options.delta || 0,
            options.wildcardCount
        );
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__ellipsisOracle;
}

function run3DWildcardEnumeration(options) {
    const runtime = makeRuntime(options.width, options.height, 1);
    for (let index = 0; index < runtime.board.cellCount; index++)
        runtime.board.setCell(index, new Int32Array([1]));

    const cells = [];
    for (let index = 0; index < options.length; index++) {
        if (options.ellipsisIndexes.includes(index)) {
            cells.push({ ellipsis: true, rowIndex: index });
        } else {
            cells.push({
                offset: { x: index, y: 0, z: 0 },
                rowIndex: index,
                pattern: rules3d.makeCellPattern({ objectsPresent: new Int32Array([1]) })
            });
        }
    }

    const pattern = rules3d.makePattern(cells, {
        ellipsisCount: options.wildcardCount
    });

    return rules3d.findPatternMatches(runtime.board, pattern, {
        scanDirection: "right"
    }).map(match => [match.origin].concat(match.gaps));
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

function testOneEllipsisEnumerationMatches2DOracle() {
    const oracle = load2DEllipsisOracle();
    const scenario = {
        width: 5,
        height: 2,
        length: 3,
        direction: 8,
        wildcardCount: 1,
        ellipsisIndexes: [1]
    };

    assert.deepStrictEqual(run3DWildcardEnumeration(scenario), JSON.parse(JSON.stringify(oracle.run(scenario))));
}

function testTwoEllipsisEnumerationMatches2DOracle() {
    const oracle = load2DEllipsisOracle();
    const scenario = {
        width: 6,
        height: 1,
        length: 5,
        direction: 8,
        wildcardCount: 2,
        ellipsisIndexes: [1, 3]
    };

    assert.deepStrictEqual(run3DWildcardEnumeration(scenario), JSON.parse(JSON.stringify(oracle.run(scenario))));
}

testOneEllipsisEnumerationMatches2DOracle();
testTwoEllipsisEnumerationMatches2DOracle();

console.log("ellipsis 2D parity tests passed");
