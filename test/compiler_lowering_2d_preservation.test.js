const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ORIGINAL_2D_COMMIT = "1347caa014461019721dfe82a49f357bc165d86c";

function testOriginal2DCompilerSourceIsPinned() {
    childProcess.execFileSync(
        "git",
        ["cat-file", "-e", `${ORIGINAL_2D_COMMIT}:src/js/compiler.js`],
        { cwd: path.join(__dirname, ".."), stdio: "pipe" }
    );
    const originalCompilerSource = loadOriginal2DCompilerSource();

    assert.ok(
        originalCompilerSource.includes("function rulesToMask(state) {"),
        "pinned original compiler source must contain the original 2D rulesToMask implementation"
    );
}

function testSharedRuleLoweringPreserves2DMasks() {
    run2DPreservation({
        name: "2D rule mask lowering",
        rules: [
            rule(10, [], [[["right", "player"], ["stationary", "box:red"]]], [[["right", "player"], ["left", "box:blue"]]]),
            rule(20, [], [[["no", "wall"]]], [[["random", "box"]]]),
            rule(30, [], [[["", "box"]]], [[["randomdir", "box:red"]]]),
            rule(40, [], [[["", "player"]]], [[["no", "player"]]]),
            rule(50, [], [[["", "crate"]]], [[["", "box:blue"]]])
        ]
    });
}

function run2DPreservation(scenario) {
    const compilerPath = path.join(__dirname, "../src/js/compiler.js");
    const currentOracle = load2DPreservationOracle(fs.readFileSync(compilerPath, "utf8"));
    const originalOracle = load2DPreservationOracle(loadOriginal2DCompilerSource());
    const result = {
        shared: JSON.parse(JSON.stringify(currentOracle.runSource({ rules: scenario.rules }))),
        legacy: JSON.parse(JSON.stringify(originalOracle.runSource({ rules: scenario.rules })))
    };

    assert.deepStrictEqual(result.shared.errors, result.legacy.errors, `${scenario.name} errors`);
    assert.deepStrictEqual(result.shared.warnings, result.legacy.warnings, `${scenario.name} warnings`);
    assert.deepStrictEqual(result.shared.snapshot, result.legacy.snapshot, scenario.name);
}

function rule(lineNumber, prefixes, lhs, rhs) {
    return {
        lineNumber,
        groupNumber: lineNumber,
        prefixes,
        directions: ["right"],
        lhs,
        rhs,
        commands: [],
        randomRule: false,
        rigid: false,
        late: false,
        globalRule: false,
        isOnce: false
    };
}

function loadOriginal2DCompilerSource() {
    return childProcess.execFileSync(
        "git",
        ["show", `${ORIGINAL_2D_COMMIT}:src/js/compiler.js`],
        { cwd: path.join(__dirname, ".."), encoding: "utf8" }
    );
}

function load2DPreservationOracle(source) {
    const compilerPath = path.join(__dirname, "../src/js/compiler.js");
    const compilerDir = path.dirname(compilerPath);
    const context = {
        module: { exports: {} },
        exports: {},
        require: id => id.startsWith("./") ? require(path.join(compilerDir, id)) : require(id),
        console,
        Level: function Level() {},
        BitVec: TestBitVec,
        CellPattern: TestCellPattern,
        CellReplacement: TestCellReplacement,
        Rule: TestRule,
        ellipsisPattern: {},
        STRIDE_OBJ: 0,
        STRIDE_MOV: 0,
        MOV_BITS: 0,
        MOV_MASK: 0,
        dirMasks: {
            up: 1,
            down: 2,
            left: 4,
            right: 8,
            action: 16,
            moving: 31
        },
        matchCache: {},
        debugMode: false,
        debugSwitch: "",
        colorPalettes: { arnecolors: {} },
        colorToHex: function(_palette, value) { return value || "#000000"; },
        canSetHTMLColors: false,
        document: {
            body: {},
            getElementById: function() { return null; },
            getElementsByTagName: function() { return []; }
        },
        window: {},
        consolePrint: function() {},
        consolePrintFromRule: function() {},
        htmlJump: function(lineNumber) { return String(lineNumber); },
        logWarning: function() {},
        logWarningNoLine: function() {},
        logError: function(message, lineNumber) {
            throw new Error(message + " @ " + lineNumber);
        },
        logErrorNoLine: function(message) {
            throw new Error(message);
        }
    };

    const hooks = `
module.exports.__preservationOracle = {
    runSource: function(input) {
        var state = makePreservationState();
        STRIDE_OBJ = state.STRIDE_OBJ;
        STRIDE_MOV = state.STRIDE_MOV;
        MOV_BITS = state.MOV_BITS;
        MOV_MASK = state.MOV_MASK;
        state.rules = prepareRulesForMasking(state, input.rules);

        var result = captureCompilerMessages(function() {
            rulesToMask(state);
        });
        result.snapshot = snapshotRules(state.rules);

        return result;
    }
};

function prepareRulesForMasking(state, rules) {
    var prepared = rules.map(cloneRuleForOracle);
    prepared = expandRulesWithPrefixes(state, prepared);
    prepared = expandRulesWithTags(state, prepared);
    prepared = expandRulesWithMultiDirectionObjects(state, prepared);
    prepared = expandRulesWithMultipleDirections(state, prepared);
    return convertObjectsAndDirections(state, prepared);
}

function captureCompilerMessages(callback) {
    var errors = [];
    var warnings = [];
    var previousLogError = logError;
    var previousLogErrorNoLine = logErrorNoLine;
    var previousLogWarning = logWarning;
    var previousLogWarningNoLine = logWarningNoLine;
    logError = function(message, lineNumber) {
        errors.push({ message: message, lineNumber: lineNumber });
    };
    logErrorNoLine = function(message) {
        errors.push({ message: message, lineNumber: null });
    };
    logWarning = function(message, lineNumber) {
        warnings.push({ message: message, lineNumber: lineNumber });
    };
    logWarningNoLine = function(message) {
        warnings.push({ message: message, lineNumber: null });
    };
    try {
        callback();
    } finally {
        logError = previousLogError;
        logErrorNoLine = previousLogErrorNoLine;
        logWarning = previousLogWarning;
        logWarningNoLine = previousLogWarningNoLine;
    }
    return { errors: errors, warnings: warnings };
}

function makePreservationState() {
    return {
        STRIDE_OBJ: 1,
        STRIDE_MOV: 1,
        MOV_BITS: 5,
        MOV_MASK: 0x1f,
        objectCount: 5,
        backgroundid: 0,
        backgroundlayer: 0,
        names: [],
        legend_synonyms: [
            ["crate", "box:red"]
        ],
        legend_properties: [
            ["box", "box:red", "box:blue"]
        ],
        legend_aggregates: [],
        tags: {},
        mappings: {},
        collisionLayers: [
            ["background"],
            ["player"],
            ["box:red", "box:blue", "wall"]
        ],
        objects: {
            background: { id: 0, layer: 0 },
            player: { id: 1, layer: 1 },
            "box:red": { id: 2, layer: 2 },
            "box:blue": { id: 3, layer: 2 },
            wall: { id: 4, layer: 2 }
        },
        objectMasks: {
            background: mask(0),
            player: mask(1),
            "box:red": mask(2),
            "box:blue": mask(3),
            wall: mask(4),
            crate: mask(2),
            box: mask(2, 3)
        },
        propertiesDict: {
            box: ["box:red", "box:blue"]
        },
        propertiesSingleLayer: {
            box: 2,
            crate: 2
        },
        aggregatesDict: {},
        layerMasks: [
            mask(0),
            mask(1),
            mask(2, 3, 4)
        ],
        loops: [],
        subroutines: [],
        winconditions: []
    };
}

function cloneRuleForOracle(rule) {
    return {
        lineNumber: rule.lineNumber,
        groupNumber: rule.groupNumber,
        prefixes: rule.prefixes.slice(),
        directions: rule.directions.slice(),
        lhs: cloneCells(rule.lhs),
        rhs: cloneCells(rule.rhs),
        commands: rule.commands.map(function(command) { return command.slice(); }),
        randomRule: !!rule.randomRule,
        rigid: !!rule.rigid,
        late: !!rule.late,
        globalRule: !!rule.globalRule,
        isOnce: !!rule.isOnce
    };
}

function cloneCells(rows) {
    return rows.map(function(row) {
        return row.map(function(cell) {
            return cell.slice();
        });
    });
}

function snapshotRules(rules) {
    return rules.map(function(rule) {
        return {
            lineNumber: rule.lineNumber,
            lhs: rule.lhs.map(function(row) {
                return row.map(snapshotCellPattern);
            })
        };
    });
}

function snapshotCellPattern(pattern) {
    if (pattern === ellipsisPattern)
        return { ellipsis: true };
    return {
        objectsPresent: maskArray(pattern.objectsPresent),
        objectsMissing: maskArray(pattern.objectsMissing),
        anyObjectsPresent: pattern.anyObjectsPresent.map(maskArray),
        movementsPresent: maskArray(pattern.movementsPresent),
        movementsMissing: maskArray(pattern.movementsMissing),
        replacement: snapshotReplacement(pattern.replacement)
    };
}

function snapshotReplacement(replacement) {
    if (!replacement)
        return null;
    return {
        objectsClear: maskArray(replacement.objectsClear),
        objectsSet: maskArray(replacement.objectsSet),
        movementsClear: maskArray(replacement.movementsClear),
        movementsSet: maskArray(replacement.movementsSet),
        movementsLayerMask: maskArray(replacement.movementsLayerMask),
        randomMask: maskArray(replacement.randomMask),
        randomDirMask: maskArray(replacement.randomDirMask)
    };
}

function maskArray(maskValue) {
    return Array.from(maskValue && maskValue.data || maskValue || []);
}

function mask() {
    var bitvec = new BitVec(1);
    for (var i = 0; i < arguments.length; i++)
        bitvec.ibitset(arguments[i]);
    return bitvec;
}
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: compilerPath });
    return context.module.exports.__preservationOracle;
}

function TestCellPattern(args) {
    this.objectsPresent = args[0];
    this.objectsMissing = args[1];
    this.anyObjectsPresent = args[2];
    this.movementsPresent = args[3];
    this.movementsMissing = args[4];
    this.replacement = args[5];
}

function TestCellReplacement(args) {
    this.objectsClear = args[0];
    this.objectsSet = args[1];
    this.movementsClear = args[2];
    this.movementsSet = args[3];
    this.movementsLayerMask = args[4];
    this.randomMask = args[5];
    this.randomDirMask = args[6];
}

function TestRule(rule) {
    this.direction = rule[0];
    this.patterns = rule[1];
    this.hasReplacements = rule[2];
    this.lineNumber = rule[3];
    this.ellipsisCount = rule[4];
    this.groupNumber = rule[5];
    this.isRigid = rule[6];
    this.commands = rule[7];
    this.isRandom = rule[8];
    this.cellRowMasks = rule[9];
    this.cellRowMasks_Movements = rule[10];
    this.isGlobal = rule[11];
    this.isOnce = rule[12];
}

class TestBitVec {
    constructor(init) {
        this.data = init instanceof Int32Array ? new Int32Array(init) : new Int32Array(init);
    }

    clone() {
        return new TestBitVec(this.data);
    }

    iand(other) {
        for (let i = 0; i < this.data.length; i++)
            this.data[i] &= other.data[i];
    }

    ior(other) {
        for (let i = 0; i < this.data.length; i++)
            this.data[i] |= other.data[i];
    }

    iclear(other) {
        for (let i = 0; i < this.data.length; i++)
            this.data[i] &= ~other.data[i];
    }

    inot() {
        for (let i = 0; i < this.data.length; i++)
            this.data[i] = ~this.data[i];
    }

    ibitset(index) {
        this.data[index >> 5] |= 1 << (index & 31);
    }

    ishiftor(mask, shift) {
        const word = shift >> 5;
        const offset = shift & 31;
        this.data[word] |= mask << offset;
        if (offset && word + 1 < this.data.length)
            this.data[word + 1] |= mask >>> (32 - offset);
    }

    iszero() {
        return this.data.every(value => value === 0);
    }

    bitsSetInArray(arr) {
        for (let i = 0; i < this.data.length; i++) {
            if ((this.data[i] & arr[i]) !== this.data[i])
                return false;
        }
        return true;
    }

    bitsClearInArray(arr) {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] & arr[i])
                return false;
        }
        return true;
    }

    anyBitsInCommon(other) {
        return !this.bitsClearInArray(other.data);
    }
}

testOriginal2DCompilerSourceIsPinned();
testSharedRuleLoweringPreserves2DMasks();

console.log("compiler lowering 2D preservation tests passed");
