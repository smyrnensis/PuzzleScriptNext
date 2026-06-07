const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const winConditions = require("../src/js/win_conditions.js");

function load2DWinOracle() {
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
            URL: "test://win-conditions",
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
        unitTesting: false,
        levelEditorOpened: false,
        solving: false,
        curLevelNo: 0,
        curlevelTarget: null,
        solvedSections: [],
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        consolePrint: function() {},
        addToDebugTimeline: function() { return 0; },
        htmlColor: function(_color, text) { return text; },
        htmlJump: function(lineNumber) { return String(lineNumber); },
        canvasResize: function() {},
        tryLoadCustomFont: function() {},
        isSitelocked: function() { return false; },
        tryPlayEndLevelSound: function() {},
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
        twiddleable_params: [],
        CommandQueue: require("../src/js/command_queue.js")
    };

    const hooks = `
var __didWin = false;
DoWin = function() { __didWin = true; winning = true; };
module.exports.__winOracle = {
    run: function(options) {
        options = options || {};
        STRIDE_OBJ = 1;
        STRIDE_MOV = 1;
        state = {
            metadata: {},
            default_metadata: {},
            levels: [],
            sections: [],
            links: [],
            winconditions: options.conditions.map(makeCondition)
        };
        curLevel = new Level(0, options.cells.length, 1, 1, new Int32Array(options.cells), null);
        RebuildLevelArrays();
        curLevel.commandQueue = [];
        curLevel.commandQueueSourceRules = [];
        _o10 = new BitVec(STRIDE_OBJ);
        __didWin = false;
        winning = false;
        runrulesonlevelstart_phase = false;
        checkWin(false);
        return __didWin;
    }
};

function makeCondition(condition) {
    return [
        condition[0],
        new BitVec(new Int32Array(condition[1])),
        new BitVec(new Int32Array(condition[2])),
        condition[3] || 1,
        !!condition[4],
        !!condition[5]
    ];
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__winOracle;
}

function runShared(scenario) {
    const board = {
        cellCount: scenario.cells.length,
        getCell(index) {
            return new Int32Array([scenario.cells[index]]);
        }
    };
    return winConditions.evaluateWinConditions(board, scenario.conditions.map(condition => [
        condition[0],
        new Int32Array(condition[1]),
        new Int32Array(condition[2]),
        condition[3] || 1,
        !!condition[4],
        !!condition[5]
    ]));
}

const scenarios = [
    {
        name: "some object on any occupied cell passes",
        cells: [0b001, 0b010, 0b100],
        conditions: [[0, [0b010], [0b111], 1, false, false]]
    },
    {
        name: "some object on any occupied cell fails when missing",
        cells: [0b001, 0b100],
        conditions: [[0, [0b010], [0b111], 1, false, false]]
    },
    {
        name: "no object on object passes when no cell has both",
        cells: [0b001, 0b010, 0b100],
        conditions: [[-1, [0b010], [0b100], 1, false, false]]
    },
    {
        name: "no object on object fails when one cell has both",
        cells: [0b001, 0b110],
        conditions: [[-1, [0b010], [0b100], 1, false, false]]
    },
    {
        name: "all object on object passes",
        cells: [0b001, 0b011, 0b001],
        conditions: [[1, [0b010], [0b001], 1, false, false]]
    },
    {
        name: "all object on object fails when a matched cell lacks second filter",
        cells: [0b011, 0b010],
        conditions: [[1, [0b010], [0b001], 1, false, false]]
    },
    {
        name: "aggregate filter requires all aggregate bits",
        cells: [0b001, 0b011, 0b010],
        conditions: [[0, [0b011], [0b111], 1, true, false]]
    },
    {
        name: "multiple conditions must all pass",
        cells: [0b011, 0b100],
        conditions: [
            [0, [0b010], [0b001], 1, false, false],
            [-1, [0b010], [0b100], 1, false, false]
        ]
    }
];

const oracle = load2DWinOracle();
for (const scenario of scenarios) {
    const expected = oracle.run(scenario);
    const actual = runShared(scenario);
    assert.strictEqual(actual, expected, scenario.name);
}

console.log("win condition 2D parity tests passed");
