const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeBitVecClass() {
    return class BitVec {
        constructor(init) {
            this.data = init instanceof Int32Array ? new Int32Array(init) : new Int32Array(init || 1);
        }
        ibitset(bit) {
            this.data[bit >> 5] |= 1 << (bit & 31);
        }
        iclear(mask) {
            const data = mask.data || mask;
            for (let i = 0; i < this.data.length; i++)
                this.data[i] &= ~data[i];
        }
        get(bit) {
            return (this.data[bit >> 5] & (1 << (bit & 31))) !== 0;
        }
        equals(other) {
            const data = other.data || other;
            return this.data.length === data.length && this.data.every((value, index) => value === data[index]);
        }
        bitsClearInArray(mask) {
            for (let i = 0; i < this.data.length; i++) {
                if ((this.data[i] & mask[i]) !== 0)
                    return false;
            }
            return true;
        }
        bitsSetInArray(mask) {
            for (let i = 0; i < this.data.length; i++) {
                if ((this.data[i] & mask[i]) !== this.data[i])
                    return false;
            }
            return true;
        }
        clone() {
            return new BitVec(this.data);
        }
    };
}

function makeBoard(width = 2, height = 2, depth = 2, sourceCells) {
    const cells = new Int32Array(sourceCells || width * height * depth);
    return {
        width,
        height,
        depth,
        layerCount: 2,
        cells,
        coordToIndex(x, y, z) {
            return x * height * depth + y * depth + z;
        },
        getCell(index) {
            return new Int32Array([cells[index]]);
        },
        getCellInto(index, target) {
            const data = target.data || target;
            data[0] = cells[index];
            return target;
        },
        setCell(index, cell) {
            const data = cell.data || cell;
            cells[index] = data[0];
        }
    };
}

function loadInputOutputContext() {
    const BitVec = makeBitVecClass();
    const backgroundMask = new BitVec(1);
    backgroundMask.ibitset(0);
    const board = makeBoard();
    const sourceLevel = {
        is3d: true,
        width: 2,
        height: 2,
        depth: 2,
        objects: new Int32Array(board.cells.length)
    };
    let context;
    context = {
        console,
        Math,
        Int32Array,
        HTMLCanvasElement: function HTMLCanvasElement() {},
        document: {
            addEventListener() {}
        },
        window: {
            addEventListener() {},
            requestAnimationFrame() {}
        },
        canvas: {
            addEventListener() {},
            focus() {}
        },
        GameRuntime3D: {
            createRuntimeFromState3D(gameState, options) {
                const level = options.slotsOptions.level;
                return {
                    board: makeBoard(level.width, level.height, level.depth, level.objects)
                };
            }
        },
        BitVec,
        STRIDE_OBJ: 1,
        state: {
            levels: [sourceLevel],
            glyphDict: {
                ".": [0],
                p: [1]
            },
            layerMasks: [backgroundMask],
            backgroundid: 0,
            backgroundlayer: 0
        },
        curLevelNo: 0,
        curLevel: {
            is3d: true,
            width: 2,
            height: 2,
            depth: 2
        },
        levelEditorOpened: true,
        levelEditor3DSlice: 0,
        puzzle3DSession: {
            runtime: {
                board
            }
        },
        screenwidth: 4,
        screenheight: 6,
        editorRowCount: 1,
        glyphImages: ["dot", "player"],
        glyphImagesCorrespondance: [".", "p"],
        glyphSelectedIndex: 1,
        mouseCoordX: 0,
        mouseCoordY: 0,
        canvasResizeCalls: 0,
        redrawCalls: 0,
        getPlayableLevels(gameState) {
            return gameState.levels;
        },
        canvasResize() {
            context.canvasResizeCalls++;
        },
        redraw() {
            context.redrawCalls++;
        },
        consolePrint() {}
    };
    context.HTMLCanvasElement.prototype = {};
    vm.createContext(context);
    const inputOutputSource = fs.readFileSync(path.join(__dirname, "../src/js/inputoutput3d.js"), "utf8");
    const levelEditor3DSource = fs.readFileSync(path.join(__dirname, "../src/js/level_editor3d.js"), "utf8");
    vm.runInContext(inputOutputSource, context, { filename: "inputoutput.js" });
    vm.runInContext(levelEditor3DSource, context, { filename: "level_editor3d.js" });
    return { context, board, sourceLevel };
}

function testSliceViewAndEditing() {
    const { context, board, sourceLevel } = loadInputOutputContext();

    assert.strictEqual(context.is3DLevelEditorActive(), true);
    const view = context.getLevelEditor3DViewLevel();
    assert.strictEqual(view.width, 2);
    assert.strictEqual(view.height, 2);
    assert.strictEqual(view.getCellInto(0).get(0), false);

    context.mouseCoordY = -2;
    context.mouseCoordX = context.screenwidth - 3;
    context.levelEditorClick({}, true);
    assert.strictEqual(context.levelEditor3DSlice, 1);
    assert.strictEqual(context.canvasResizeCalls, 1);

    context.mouseCoordX = 1;
    context.mouseCoordY = 1;
    context.levelEditorClick({}, true);

    const editedIndex = board.coordToIndex(1, 1, 1);
    assert.strictEqual(board.cells[editedIndex], (1 << 0) | (1 << 1));
    assert.strictEqual(sourceLevel.objects[editedIndex], (1 << 0) | (1 << 1));
    assert.strictEqual(context.redrawCalls, 1);
}

function testPrepare3DEditorCreatesSessionAtEntry() {
    const { context, board } = loadInputOutputContext();
    const calls = [];
    context.puzzle3DSession = null;
    context.Puzzle3DPlayHost = {
        openLevelEditor(state, levelIndex) {
            calls.push(["openLevelEditor", state, levelIndex]);
            context.puzzle3DSession = {
                runtime: {
                    board
                }
            };
            return true;
        }
    };

    assert.strictEqual(context.isCurrentLevelEditor3D(), true);
    assert.strictEqual(context.is3DLevelEditorActive(), false);
    assert.strictEqual(context.prepareLevelEditorForCurrentLevel(), true);
    assert.deepStrictEqual(calls, [["openLevelEditor", context.state, 0]]);
    assert.strictEqual(context.is3DLevelEditorActive(), true);
}

function testResizeAppliesToAllSlices() {
    const { context, sourceLevel } = loadInputOutputContext();

    context.mouseCoordX = -1;
    context.mouseCoordY = 0;
    context.levelEditorClick({}, true);

    assert.strictEqual(sourceLevel.width, 3);
    assert.strictEqual(sourceLevel.depth, 2);
    assert.strictEqual(context.puzzle3DSession.runtime.board.width, 3);

    const board = context.puzzle3DSession.runtime.board;
    for (let y = 0; y < board.height; y++) {
        assert.strictEqual(board.cells[board.coordToIndex(0, y, 0)], 1 << 0);
    }

    context.mouseCoordX = 0;
    context.mouseCoordY = -1;
    context.levelEditorClick({}, true);

    assert.strictEqual(sourceLevel.width, 3);
    assert.strictEqual(sourceLevel.depth, 3);
    assert.strictEqual(context.puzzle3DSession.runtime.board.depth, 3);
}

function testSliceInsertionChanges3DHeight() {
    const { context, sourceLevel } = loadInputOutputContext();
    const oldBoard = context.puzzle3DSession.runtime.board;
    oldBoard.cells[oldBoard.coordToIndex(1, 0, 1)] = 7;

    context.mouseCoordY = -2;
    context.mouseCoordX = -1;
    context.levelEditorClick({}, true);

    assert.strictEqual(sourceLevel.height, 3);
    assert.strictEqual(context.levelEditor3DSlice, 0);
    assert.strictEqual(context.puzzle3DSession.runtime.board.height, 3);
    assert.strictEqual(context.puzzle3DSession.runtime.board.cells[context.puzzle3DSession.runtime.board.coordToIndex(1, 0, 1)], 1 << 0);
    assert.strictEqual(context.puzzle3DSession.runtime.board.cells[context.puzzle3DSession.runtime.board.coordToIndex(1, 1, 1)], 7);

    context.mouseCoordY = -2;
    context.mouseCoordX = context.screenwidth - 2;
    context.levelEditorClick({}, true);

    assert.strictEqual(sourceLevel.height, 4);
    assert.strictEqual(context.levelEditor3DSlice, 3);
    assert.strictEqual(context.puzzle3DSession.runtime.board.height, 4);
}

testSliceViewAndEditing();
testPrepare3DEditorCreatesSessionAtEntry();
testResizeAppliesToAllSlices();
testSliceInsertionChanges3DHeight();
console.log("editor 3D level editor tests passed");
