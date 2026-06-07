const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function testTaggedMappingRuleLoweringMatches2DOracle() {
    runCompilerLoweringParity({
        name: "tagged object mapping rule expansion",
        rules: [
            rule(10, ["kind"], [[["", "box:kind"]]], [[["", "box:next"]]])
        ]
    });
}

function testPropertyAndSynonymRuleLoweringMatches2DOracle() {
    runCompilerLoweringParity({
        name: "property and synonym rule lowering",
        rules: [
            rule(20, [], [[["", "box"], ["", "crate"]]], [[["", "box:red"], ["", "box:blue"]]]),
            rule(30, [], [[["no", "box"]]], [[["", "box:red"]]])
        ]
    });
}

function runCompilerLoweringParity(scenario) {
    const oracle = loadCompilerLoweringOracle();
    const expected = jsonClone(oracle.run({ threeDimensions: false, rules: scenario.rules }));
    const actual = jsonClone(oracle.run({ threeDimensions: true, rules: scenario.rules }));

    assert.deepStrictEqual(actual.errors, [], `${scenario.name} 3D errors`);
    assert.deepStrictEqual(expected.errors, [], `${scenario.name} 2D errors`);
    assert.deepStrictEqual(actual.snapshot, expected.snapshot, scenario.name);
}

function jsonClone(value) {
    return JSON.parse(JSON.stringify(value));
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

function loadCompilerLoweringOracle() {
    const compilerPath = path.join(__dirname, "../src/js/compiler3d.js");
    const compilerDir = path.dirname(compilerPath);
    const source = fs.readFileSync(compilerPath, "utf8");
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
module.exports.__loweringOracle = {
    run: function(input) {
        var errors = [];
        var state = makeParityState(input.threeDimensions);
        var previousLogError = logError;
        var previousLogErrorNoLine = logErrorNoLine;
        logError = function(message, lineNumber) {
            errors.push({ message: message, lineNumber: lineNumber });
        };
        logErrorNoLine = function(message) {
            errors.push({ message: message, lineNumber: null });
        };
        try {
            var compilerApi = Compiler3DOverlay;
            var internals = compilerApi.__compilerInternalsForTest;
            compilerApi.__setCompilerCarriersForTest(state);
            var rules = input.rules.map(cloneRuleForOracle);
            rules = internals.expandRulesWithPrefixes(state, rules);
            rules = internals.expandRulesWithTags(state, rules);
            rules = internals.expandRulesWithMultiDirectionObjects(state, rules);
            rules = internals.expandRulesWithMultipleDirections(state, rules);
            rules = internals.convertObjectsAndDirections(state, rules);
            state.rules = rules;
            if (input.threeDimensions) {
                internals.finalizeRulesFor3D(state);
                return { errors: errors, snapshot: snapshot3DRules(state.rules3d.groups) };
            }
            internals.finalizeRulesFor2D(state);
            return { errors: errors, snapshot: snapshot2DRules(state.rules) };
        } finally {
            logError = previousLogError;
            logErrorNoLine = previousLogErrorNoLine;
        }
    }
};

function makeParityState(threeDimensions) {
    var movBits = threeDimensions ? 7 : 5;
    var movMask = threeDimensions ? 0x7f : 0x1f;
    return {
        STRIDE_OBJ: 1,
        STRIDE_MOV: 1,
        MOV_BITS: movBits,
        MOV_MASK: movMask,
        objectCount: 4,
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
        tags: {
            kind: ["red", "blue"]
        },
        mappings: {
            next: {
                fromKey: "kind",
                fromValues: ["red", "blue"],
                values: ["blue", "red"]
            }
        },
        collisionLayers: [
            ["background"],
            ["box:red", "box:blue", "wall"]
        ],
        objects: {
            background: { id: 0, layer: 0 },
            "box:red": { id: 1, layer: 1 },
            "box:blue": { id: 2, layer: 1 },
            wall: { id: 3, layer: 1 }
        },
        objectMasks: {
            background: mask(0),
            "box:red": mask(1),
            "box:blue": mask(2),
            wall: mask(3),
            crate: mask(1),
            box: mask(1, 2)
        },
        propertiesDict: {
            box: ["box:red", "box:blue"]
        },
        propertiesSingleLayer: {
            box: 1,
            crate: 1
        },
        aggregatesDict: {},
        layerMasks: [
            mask(0),
            mask(1, 2, 3)
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

function snapshot2DRules(groups) {
    return groups.map(function(group) {
        return group.map(function(rule) {
            return {
                groupNumber: rule.groupNumber,
                lineNumber: rule.lineNumber,
                patterns: rule.patterns.map(function(row) {
                    return row.map(snapshot2DCellPattern);
                })
            };
        });
    });
}

function snapshot3DRules(groups) {
    return groups.map(function(group) {
        return group.map(function(rule) {
            return {
                groupNumber: rule.groupNumber,
                lineNumber: rule.lineNumber,
                patterns: rule.patterns.map(function(row) {
                    return row.cells.map(function(cell) {
                        return snapshot3DCellPattern(cell.pattern);
                    });
                })
            };
        });
    });
}

function snapshot2DCellPattern(pattern) {
    return {
        objectsPresent: maskArray(pattern.objectsPresent),
        objectsMissing: maskArray(pattern.objectsMissing),
        anyObjectsPresent: pattern.anyObjectsPresent.map(maskArray),
        movementsPresent: maskArray(pattern.movementsPresent),
        movementsMissing: maskArray(pattern.movementsMissing),
        replacement: snapshot2DReplacement(pattern.replacement)
    };
}

function snapshot3DCellPattern(pattern) {
    return {
        objectsPresent: maskArray(pattern.objectsPresent),
        objectsMissing: maskArray(pattern.objectsMissing),
        anyObjectsPresent: pattern.anyObjectsPresent.map(maskArray),
        movementsPresent: project3DMovementMask(pattern.movementsPresent),
        movementsMissing: project3DMovementMask(pattern.movementsMissing),
        replacement: snapshot3DReplacement(pattern.replacement)
    };
}

function snapshot2DReplacement(replacement) {
    if (!replacement)
        return null;
    return {
        objectsClear: maskArray(replacement.objectsClear),
        objectsSet: maskArray(replacement.objectsSet),
        movementsClear: maskArray(replacement.movementsClear),
        movementsSet: maskArray(replacement.movementsSet),
        movementsLayerMask: maskArray(replacement.movementsLayerMask),
        randomEntityMask: maskArray(replacement.randomMask),
        randomDirMask: maskArray(replacement.randomDirMask)
    };
}

function snapshot3DReplacement(replacement) {
    if (!replacement)
        return null;
    return {
        objectsClear: maskArray(replacement.objectsClear),
        objectsSet: maskArray(replacement.objectsSet),
        movementsClear: project3DMovementMask(replacement.movementsClear),
        movementsSet: project3DMovementMask(replacement.movementsSet),
        movementsLayerMask: project3DMovementMask(replacement.movementsLayerMask),
        randomEntityMask: maskArray(replacement.randomEntityMask),
        randomDirMask: project3DMovementMask(replacement.randomDirMask)
    };
}

function maskArray(maskValue) {
    return Array.from(maskValue && maskValue.data || maskValue || []);
}

function project3DMovementMask(maskValue) {
    var source = maskArray(maskValue);
    var projected = [];
    for (var wordIndex = 0; wordIndex < source.length; wordIndex++) {
        var value = source[wordIndex] || 0;
        var out = 0;
        for (var layer = 0; layer < 4; layer++) {
            var chunk = (value >>> (layer * 7)) & 0x7f;
            out |= (chunk & 0x1f) << (layer * 5);
        }
        projected.push(out);
    }
    return projected;
}

function mask() {
    var bitvec = new BitVec(1);
    for (var i = 0; i < arguments.length; i++)
        bitvec.ibitset(arguments[i]);
    return bitvec;
}
`;

    vm.createContext(context);
    const injectedHooks = hooks.replace("module.exports.__loweringOracle", "Compiler3DOverlay.__loweringOracle");
    const injectionPoint = "\nreturn Compiler3DOverlay;";
    assert(source.includes(injectionPoint), "compiler3d.js IIFE export boundary changed");
    const sourceWithHooks = source.replace(injectionPoint, "\n" + injectedHooks + injectionPoint);
    vm.runInContext(sourceWithHooks, context, { filename: compilerPath });
    return context.Compiler3DOverlay.__loweringOracle;
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

testTaggedMappingRuleLoweringMatches2DOracle();
testPropertyAndSynonymRuleLoweringMatches2DOracle();

console.log("compiler lowering 2D parity tests passed");
