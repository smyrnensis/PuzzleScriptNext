const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const cellMasks = require("../src/js/cell_masks.js");

function load2DCellPatternOracle() {
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
            URL: "test://cell-masks",
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
        curLevelNo: 0,
        curlevelTarget: null,
        solvedSections: [],
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        consolePrint: function() {},
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
        CellMasks: cellMasks
    };

    const hooks = `
module.exports.__cellPatternOracle = {
    reset: function(strideObj, strideMov) {
        STRIDE_OBJ = strideObj;
        STRIDE_MOV = strideMov;
    },
    mask: function(values) {
        return new BitVec(new Int32Array(values));
    },
    makePattern: function(row) {
        return new CellPattern(row);
    },
    matches: function(pattern, index, objects, movements) {
        return pattern.matches(index, objects, movements);
    },
    replacementSnapshot: function(options) {
        STRIDE_OBJ = options.strideObj;
        STRIDE_MOV = options.strideMov;
        _o1 = new BitVec(STRIDE_OBJ);
        _o2 = new BitVec(STRIDE_OBJ);
        _o2_5 = new BitVec(STRIDE_OBJ);
        _o3 = new BitVec(STRIDE_OBJ);
        _o4 = new BitVec(STRIDE_OBJ);
        _o5 = new BitVec(STRIDE_OBJ);
        _m1 = new BitVec(STRIDE_MOV);
        _m2 = new BitVec(STRIDE_MOV);
        _m3 = new BitVec(STRIDE_MOV);

        var cell = new BitVec(new Int32Array(options.cell));
        var movements = new BitVec(new Int32Array(options.movements));
        curLevel = {
            layerCount: options.layerCount || 1,
            height: 1,
            rigidGroupIndexMask: options.initialRigidGroupMask ? [new BitVec(new Int32Array(options.initialRigidGroupMask))] : [],
            rigidMovementAppliedMask: options.initialRigidAppliedMask ? [new BitVec(new Int32Array(options.initialRigidAppliedMask))] : [],
            colCellContents: [new BitVec(STRIDE_OBJ)],
            rowCellContents: [new BitVec(STRIDE_OBJ)],
            mapCellContents: new BitVec(STRIDE_OBJ),
            getCellInto: function(_index, target) {
                return cell.cloneInto(target);
            },
            getMovements: function() {
                return movements.clone();
            },
            setCell: function(_index, value) {
                cell = value.clone();
            },
            setMovements: function(_index, value) {
                movements = value.clone();
            }
        };
        state = {
            objectCount: options.objectCount || 32,
            groupNumber_to_RigidGroupIndex: options.groupNumberToRigidGroupIndex || {},
            idDict: options.idDict || {},
            objects: options.objectsByName || [],
            layerMasks: (options.layerMasks || []).map(function(mask) {
                return new BitVec(new Int32Array(mask));
            })
        };
        RandomGen.uniform = function() { return options.uniform === undefined ? 0 : options.uniform; };
        sfxCreateMask = new BitVec(STRIDE_OBJ);
        sfxDestroyMask = new BitVec(STRIDE_OBJ);
        sfxCreateList = [];
        sfxDestroyList = [];

        var replacement = new CellReplacement([
            new BitVec(new Int32Array(options.replacement.objectsClear)),
            new BitVec(new Int32Array(options.replacement.objectsSet)),
            new BitVec(new Int32Array(options.replacement.movementsClear)),
            new BitVec(new Int32Array(options.replacement.movementsSet)),
            new BitVec(new Int32Array(options.replacement.movementsLayerMask)),
            new BitVec(new Int32Array(options.replacement.randomEntityMask || [0])),
            new BitVec(new Int32Array(options.replacement.randomDirMask || [0]))
        ]);
        var pattern = new CellPattern([
            new BitVec(STRIDE_OBJ),
            new BitVec(STRIDE_OBJ),
            [],
            new BitVec(STRIDE_MOV),
            new BitVec(STRIDE_MOV),
            replacement
        ]);
        var changed = pattern.replace({
            isRigid: !!options.isRigid,
            groupNumber: options.groupNumber || 0
        }, 0);
        return {
            changed: changed,
            cell: Array.prototype.slice.call(cell.data),
            movements: Array.prototype.slice.call(movements.data),
            rigidGroupMask: curLevel.rigidGroupIndexMask[0] ? Array.prototype.slice.call(curLevel.rigidGroupIndexMask[0].data) : null,
            rigidAppliedMask: curLevel.rigidMovementAppliedMask[0] ? Array.prototype.slice.call(curLevel.rigidMovementAppliedMask[0].data) : null,
            sfxCreate: Array.prototype.slice.call(sfxCreateMask.data),
            sfxDestroy: Array.prototype.slice.call(sfxDestroyMask.data),
            sfxCreateList: sfxCreateList.slice(),
            sfxDestroyList: sfxDestroyList.slice()
        };
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__cellPatternOracle;
}

function makeSharedPattern(scenario) {
    return {
        objectsPresent: new Int32Array(scenario.pattern.objectsPresent),
        objectsMissing: new Int32Array(scenario.pattern.objectsMissing),
        anyObjectsPresent: scenario.pattern.anyObjectsPresent.map(mask => new Int32Array(mask)),
        movementsPresent: new Int32Array(scenario.pattern.movementsPresent),
        movementsMissing: new Int32Array(scenario.pattern.movementsMissing)
    };
}

function makeOraclePattern(oracle, scenario) {
    return oracle.makePattern([
        oracle.mask(scenario.pattern.objectsPresent),
        oracle.mask(scenario.pattern.objectsMissing),
        scenario.pattern.anyObjectsPresent.map(mask => oracle.mask(mask)),
        oracle.mask(scenario.pattern.movementsPresent),
        oracle.mask(scenario.pattern.movementsMissing),
        null
    ]);
}

function runScenario(oracle, scenario) {
    oracle.reset(scenario.strideObj, scenario.strideMov);

    const objects = new Int32Array(scenario.objects);
    const movements = new Int32Array(scenario.movements);
    const sharedPattern = makeSharedPattern(scenario);
    const oraclePattern = makeOraclePattern(oracle, scenario);

    const sharedResults = scenario.indices.map(index => {
        return cellMasks.matchesCellAt(index, objects, movements, sharedPattern, {
            strideObj: scenario.strideObj,
            strideMov: scenario.strideMov
        });
    });
    const oracleResults = scenario.indices.map(index => {
        return Boolean(oracle.matches(oraclePattern, index, objects, movements));
    });

    assert.deepStrictEqual(sharedResults, scenario.expected, `${scenario.name} shared expected`);
    assert.deepStrictEqual(oracleResults, scenario.expected, `${scenario.name} 2D expected`);
    assert.deepStrictEqual(sharedResults, oracleResults, `${scenario.name} shared equals 2D`);
}

function runReplacementScenario(oracle, scenario) {
    const sharedCell = new Int32Array(scenario.cell);
    const sharedMovements = new Int32Array(scenario.movements);
    const sharedChanged = cellMasks.applyCellReplacementMasks(sharedCell, sharedMovements, {
        objectsClear: new Int32Array(scenario.replacement.objectsClear),
        objectsSet: new Int32Array(scenario.replacement.objectsSet),
        movementsClear: new Int32Array(scenario.replacement.movementsClear),
        movementsSet: new Int32Array(scenario.replacement.movementsSet),
        movementsLayerMask: new Int32Array(scenario.replacement.movementsLayerMask),
        randomEntityMask: new Int32Array(scenario.replacement.randomEntityMask || [0]),
        randomDirMask: new Int32Array(scenario.replacement.randomDirMask || [0])
    }, {
        strideObj: scenario.strideObj,
        layerCount: scenario.layerCount || 1,
        movementBits: scenario.movementBits || 5,
        movementMask: scenario.movementMask || 0x1f,
        directionCount: scenario.directionCount || 4,
        uniform: function() { return scenario.uniform === undefined ? 0 : scenario.uniform; },
        idDict: scenario.idDict,
        objects: scenario.objectsByName,
        layerMasks: (scenario.layerMasks || []).map(mask => new Int32Array(mask))
    });

    const sharedSnapshot = {
        changed: sharedChanged,
        cell: Array.from(sharedCell),
        movements: Array.from(sharedMovements)
    };
    const oracleSnapshot = oracle.replacementSnapshot(scenario);
    const sharedRigid = cellMasks.applyRigidReplacementMasks(
        scenario.initialRigidGroupMask ? new Int32Array(scenario.initialRigidGroupMask) : null,
        scenario.initialRigidAppliedMask ? new Int32Array(scenario.initialRigidAppliedMask) : null,
        { movementsLayerMask: new Int32Array(scenario.replacement.movementsLayerMask) },
        {
            isRigid: !!scenario.isRigid,
            rigidGroupIndex: scenario.rigidGroupIndex || 0,
            layerCount: scenario.layerCount || 1,
            movementBits: scenario.movementBits || 5,
            strideMov: scenario.strideMov
        }
    );
    const expectedShared = Object.assign({}, scenario.expectedShared);
    if (scenario.expectedRigid) {
        expectedShared.rigidChanged = scenario.expectedRigid.changed;
        expectedShared.rigidGroupMask = scenario.expectedRigid.groupMask;
        expectedShared.rigidAppliedMask = scenario.expectedRigid.appliedMask;
    }
    const sharedWithRigid = Object.assign({}, sharedSnapshot);
    if (scenario.expectedRigid) {
        sharedWithRigid.rigidChanged = sharedRigid.changed;
        sharedWithRigid.rigidGroupMask = Array.from(sharedRigid.groupMask);
        sharedWithRigid.rigidAppliedMask = Array.from(sharedRigid.appliedMask);
    }

    assert.deepStrictEqual(sharedWithRigid, expectedShared, `${scenario.name} shared expected`);
    const oracleExpectedShape = {
        changed: oracleSnapshot.changed,
        cell: oracleSnapshot.cell,
        movements: oracleSnapshot.movements,
        sfxCreate: oracleSnapshot.sfxCreate,
        sfxDestroy: oracleSnapshot.sfxDestroy,
        sfxCreateList: oracleSnapshot.sfxCreateList,
        sfxDestroyList: oracleSnapshot.sfxDestroyList
    };
    if (scenario.expectedRigid) {
        oracleExpectedShape.rigidGroupMask = oracleSnapshot.rigidGroupMask;
        oracleExpectedShape.rigidAppliedMask = oracleSnapshot.rigidAppliedMask;
    }
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(oracleExpectedShape)),
        scenario.expected2D,
        `${scenario.name} 2D expected`
    );
    const oracleMaskShape = {
        cell: oracleSnapshot.cell,
        movements: oracleSnapshot.movements
    };
    const sharedMaskShape = {
        cell: sharedSnapshot.cell,
        movements: sharedSnapshot.movements
    };
    if (!scenario.expectedRigid) {
        oracleMaskShape.changed = oracleSnapshot.changed;
        sharedMaskShape.changed = sharedSnapshot.changed;
    }
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(oracleMaskShape)),
        sharedMaskShape,
        `${scenario.name} shared equals 2D masks`
    );
}

const scenarios = [
    {
        name: "required object bits must all be present",
        strideObj: 1,
        strideMov: 1,
        objects: [0b101010, 0b001010],
        movements: [0, 0],
        pattern: {
            objectsPresent: [0b100010],
            objectsMissing: [0],
            anyObjectsPresent: [],
            movementsPresent: [0],
            movementsMissing: [0]
        },
        indices: [0, 1],
        expected: [true, false]
    },
    {
        name: "missing object bits reject matching cells",
        strideObj: 1,
        strideMov: 1,
        objects: [0b0011, 0b0001],
        movements: [0, 0],
        pattern: {
            objectsPresent: [0b0001],
            objectsMissing: [0b0010],
            anyObjectsPresent: [],
            movementsPresent: [0],
            movementsMissing: [0]
        },
        indices: [0, 1],
        expected: [false, true]
    },
    {
        name: "any object masks require one candidate bit",
        strideObj: 1,
        strideMov: 1,
        objects: [0b10000, 0b00010],
        movements: [0, 0],
        pattern: {
            objectsPresent: [0],
            objectsMissing: [0],
            anyObjectsPresent: [[0b10100]],
            movementsPresent: [0],
            movementsMissing: [0]
        },
        indices: [0, 1],
        expected: [true, false]
    },
    {
        name: "movement masks match independently from objects",
        strideObj: 1,
        strideMov: 1,
        objects: [0b1, 0b1, 0b1],
        movements: [0x0104, 0x0200, 0x0102],
        pattern: {
            objectsPresent: [0b1],
            objectsMissing: [0],
            anyObjectsPresent: [],
            movementsPresent: [0x0100],
            movementsMissing: [0x0002]
        },
        indices: [0, 1, 2],
        expected: [true, false, false]
    },
    {
        name: "multiword object and movement strides use indexed cell offsets",
        strideObj: 2,
        strideMov: 2,
        objects: [
            0b1, 0,
            0, 0b10
        ],
        movements: [
            0x0001, 0,
            0, 0x0200
        ],
        pattern: {
            objectsPresent: [0, 0b10],
            objectsMissing: [0b1, 0],
            anyObjectsPresent: [[0, 0b10]],
            movementsPresent: [0, 0x0200],
            movementsMissing: [0x0001, 0]
        },
        indices: [0, 1],
        expected: [false, true]
    }
];

const oracle = load2DCellPatternOracle();
scenarios.forEach(scenario => runScenario(oracle, scenario));

const replacementScenarios = [
    {
        name: "replacement applies object and movement clear set masks",
        strideObj: 1,
        strideMov: 1,
        objectCount: 5,
        cell: [0b0011],
        movements: [0x0104],
        replacement: {
            objectsClear: [0b0001],
            objectsSet: [0b0100],
            movementsClear: [0x0004],
            movementsSet: [0x0200],
            movementsLayerMask: [0]
        },
        expectedShared: {
            changed: true,
            cell: [0b0110],
            movements: [0x0300]
        },
        expected2D: {
            changed: true,
            cell: [0b0110],
            movements: [0x0300],
            sfxCreate: [0b0100],
            sfxDestroy: [0b0001],
            sfxCreateList: [{ posIndex: 0, objId: 2 }],
            sfxDestroyList: [{ posIndex: 0, objId: 0 }]
        }
    },
    {
        name: "replacement movement layer mask clears post movements",
        strideObj: 1,
        strideMov: 1,
        objectCount: 5,
        cell: [0b0010],
        movements: [0x0304],
        replacement: {
            objectsClear: [0],
            objectsSet: [0],
            movementsClear: [0x0004],
            movementsSet: [0x0200],
            movementsLayerMask: [0x0100]
        },
        expectedShared: {
            changed: true,
            cell: [0b0010],
            movements: [0x0200]
        },
        expected2D: {
            changed: true,
            cell: [0b0010],
            movements: [0x0200],
            sfxCreate: [0],
            sfxDestroy: [0],
            sfxCreateList: [],
            sfxDestroyList: []
        }
    },
    {
        name: "replacement reports unchanged masks",
        strideObj: 1,
        strideMov: 1,
        objectCount: 5,
        cell: [0b0010],
        movements: [0x0200],
        replacement: {
            objectsClear: [0b0001],
            objectsSet: [0b0010],
            movementsClear: [0x0001],
            movementsSet: [0x0200],
            movementsLayerMask: [0]
        },
        expectedShared: {
            changed: false,
            cell: [0b0010],
            movements: [0x0200]
        },
        expected2D: {
            changed: false,
            cell: [0b0010],
            movements: [0x0200],
            sfxCreate: [0],
            sfxDestroy: [0],
            sfxCreateList: [],
            sfxDestroyList: []
        }
    },
    {
        name: "random entity replacement chooses an object and clears its layer",
        strideObj: 1,
        strideMov: 1,
        movementBits: 5,
        movementMask: 0x1f,
        objectCount: 5,
        cell: [0b0011],
        movements: [0x0042],
        uniform: 0,
        idDict: { 2: "box" },
        objectsByName: { box: { layer: 1 } },
        layerMasks: [
            [0b0001],
            [0b1110]
        ],
        replacement: {
            objectsClear: [0],
            objectsSet: [0],
            movementsClear: [0],
            movementsSet: [0],
            movementsLayerMask: [0],
            randomEntityMask: [0b0100]
        },
        expectedShared: {
            changed: true,
            cell: [0b0101],
            movements: [0x0002]
        },
        expected2D: {
            changed: true,
            cell: [0b0101],
            movements: [0x0002],
            sfxCreate: [0b0100],
            sfxDestroy: [0b0010],
            sfxCreateList: [{ posIndex: 0, objId: 2 }],
            sfxDestroyList: [{ posIndex: 0, objId: 1 }]
        }
    },
    {
        name: "randomdir replacement picks a 2D direction bit per marked layer",
        strideObj: 1,
        strideMov: 1,
        layerCount: 2,
        movementBits: 5,
        movementMask: 0x1f,
        directionCount: 4,
        objectCount: 5,
        cell: [0b0010],
        movements: [0],
        uniform: 0.5,
        replacement: {
            objectsClear: [0],
            objectsSet: [0],
            movementsClear: [0],
            movementsSet: [0],
            movementsLayerMask: [0],
            randomDirMask: [1 << 5]
        },
        expectedShared: {
            changed: true,
            cell: [0b0010],
            movements: [1 << 7]
        },
        expected2D: {
            changed: true,
            cell: [0b0010],
            movements: [1 << 7],
            sfxCreate: [0],
            sfxDestroy: [0],
            sfxCreateList: [],
            sfxDestroyList: []
        }
    },
    {
        name: "rigid replacement records group and applied movement layer masks",
        strideObj: 1,
        strideMov: 1,
        layerCount: 2,
        movementBits: 5,
        objectCount: 5,
        cell: [0b0010],
        movements: [0],
        isRigid: true,
        groupNumber: 7,
        rigidGroupIndex: 0,
        groupNumberToRigidGroupIndex: { 7: 0 },
        replacement: {
            objectsClear: [0],
            objectsSet: [0],
            movementsClear: [0],
            movementsSet: [0],
            movementsLayerMask: [0x3e0]
        },
        expectedShared: {
            changed: false,
            cell: [0b0010],
            movements: [0]
        },
        expectedRigid: {
            changed: true,
            groupMask: [0x20],
            appliedMask: [0x3e0]
        },
        expected2D: {
            changed: true,
            cell: [0b0010],
            movements: [0],
            rigidGroupMask: [0x20],
            rigidAppliedMask: [0x3e0],
            sfxCreate: [0],
            sfxDestroy: [0],
            sfxCreateList: [],
            sfxDestroyList: []
        }
    },
    {
        name: "rigid replacement does not change when group was already recorded",
        strideObj: 1,
        strideMov: 1,
        layerCount: 2,
        movementBits: 5,
        objectCount: 5,
        cell: [0b0010],
        movements: [0],
        isRigid: true,
        groupNumber: 7,
        rigidGroupIndex: 0,
        groupNumberToRigidGroupIndex: { 7: 0 },
        initialRigidGroupMask: [0x20],
        initialRigidAppliedMask: [0],
        replacement: {
            objectsClear: [0],
            objectsSet: [0],
            movementsClear: [0],
            movementsSet: [0],
            movementsLayerMask: [0x3e0]
        },
        expectedShared: {
            changed: false,
            cell: [0b0010],
            movements: [0]
        },
        expectedRigid: {
            changed: false,
            groupMask: [0x20],
            appliedMask: [0]
        },
        expected2D: {
            changed: false,
            cell: [0b0010],
            movements: [0],
            rigidGroupMask: [0x20],
            rigidAppliedMask: [0],
            sfxCreate: [0],
            sfxDestroy: [0],
            sfxCreateList: [],
            sfxDestroyList: []
        }
    },
    {
        name: "rigid replacement does not change when movement layer was already applied",
        strideObj: 1,
        strideMov: 1,
        layerCount: 2,
        movementBits: 5,
        objectCount: 5,
        cell: [0b0010],
        movements: [0],
        isRigid: true,
        groupNumber: 7,
        rigidGroupIndex: 0,
        groupNumberToRigidGroupIndex: { 7: 0 },
        initialRigidGroupMask: [0],
        initialRigidAppliedMask: [0x3e0],
        replacement: {
            objectsClear: [0],
            objectsSet: [0],
            movementsClear: [0],
            movementsSet: [0],
            movementsLayerMask: [0x3e0]
        },
        expectedShared: {
            changed: false,
            cell: [0b0010],
            movements: [0]
        },
        expectedRigid: {
            changed: false,
            groupMask: [0],
            appliedMask: [0x3e0]
        },
        expected2D: {
            changed: false,
            cell: [0b0010],
            movements: [0],
            rigidGroupMask: [0],
            rigidAppliedMask: [0x3e0],
            sfxCreate: [0],
            sfxDestroy: [0],
            sfxCreateList: [],
            sfxDestroyList: []
        }
    }
];

replacementScenarios.forEach(scenario => runReplacementScenario(oracle, scenario));

console.log("cell mask 2D parity tests passed");
