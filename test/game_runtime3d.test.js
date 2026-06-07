const assert = require("assert");

const gameRuntime = require("../src/js/game_runtime3d.js");

const MOV_MASK_3D = 0x7f;

function testCheckpointAndRestartRestoreSessionBoard() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1])
    ]));

    gameRuntime.applySessionArtifacts3D(session, { checkpointRequested: true });
    session.runtime.board.setCell(0, new Int32Array([2]));
    gameRuntime.applySessionArtifacts3D(session, { restartRequested: true });

    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [1]);
    assert.strictEqual(session.levelIndex, 0);
}

function testGotoSwitchesSessionLevelAndRestartTarget() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1]),
        new Int32Array([2])
    ], null, [{ firstLevel: 1 }]));

    gameRuntime.applySessionArtifacts3D(session, { gotoTarget: "0" });

    assert.strictEqual(session.levelIndex, 1);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);

    session.runtime.board.setCell(0, new Int32Array([1]));
    gameRuntime.applySessionArtifacts3D(session, { restartRequested: true });
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);
}

function testWinAdvancesOrCompletesSession() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1]),
        new Int32Array([2])
    ]));

    gameRuntime.applySessionArtifacts3D(session, { winRequested: true });

    assert.strictEqual(session.levelIndex, 1);
    assert.strictEqual(session.completed, false);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);

    gameRuntime.applySessionArtifacts3D(session, { winRequested: true });
    assert.strictEqual(session.completed, true);
}

function testWinConditionsAdvanceSessionLikeWinCommand() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1]),
        new Int32Array([2])
    ], {
        groups: [],
        lateGroups: [],
        winConditions: [
            [0, new Int32Array([1]), new Int32Array([3]), 1, false, false]
        ]
    }));

    const result = gameRuntime.processSessionTurn3D(session, null);

    assert.strictEqual(result.sessionState.levelIndex, 1);
    assert.strictEqual(session.completed, false);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);
}

function testSessionTailUses2DCommandPriority() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1]),
        new Int32Array([2])
    ], null, [{ firstLevel: 1 }]));

    gameRuntime.applySessionArtifacts3D(session, {
        queue: ["goto,0", "restart"],
        gotoTarget: "0",
        restartRequested: true
    });

    assert.strictEqual(session.levelIndex, 1);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);

    gameRuntime.applySessionArtifacts3D(session, {
        queue: ["win", "checkpoint", "again"],
        winRequested: true,
        checkpointRequested: true,
        againRequested: true
    }, { boardChanged: true });

    assert.strictEqual(session.completed, true);
    assert.strictEqual(session.checkpointSource, null);
}

function testAgainCommandWithoutBoardChangeDoesNotLoop() {
    const state = makeState([new Int32Array([1])], {
        groups: [
            [
                {
                    lineNumber: 1,
                    commands: [["again"]],
                    patterns: [
                        {
                            frameExpansion: "none",
                            cells: [
                                {
                                    offset: { x: 0, y: 0, z: 0 },
                                    pattern: {
                                        objectsPresent: new Int32Array([1]),
                                        objectsMissing: new Int32Array([0]),
                                        anyObjectsPresent: [],
                                        movementsPresent: new Int32Array([0]),
                                        movementsMissing: new Int32Array([0]),
                                        replacement: null
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        ]
    });
    const session = gameRuntime.createSessionFromState3D(state);

    const result = gameRuntime.processSessionTurn3D(session, null);

    assert.strictEqual(result.turns.length, 1);
    assert.strictEqual(result.turn.sessionArtifacts.againRequested, true);
}

function testAgainCommandWithBoardChangeRequiresNoInputProbeLike2D() {
    const state = makeState([new Int32Array([1])], {
        groups: [
            [
                {
                    lineNumber: 1,
                    commands: [["again"]],
                    patterns: [
                        {
                            frameExpansion: "none",
                            cells: [
                                {
                                    offset: { x: 0, y: 0, z: 0 },
                                    pattern: {
                                        objectsPresent: new Int32Array([1]),
                                        objectsMissing: new Int32Array([0]),
                                        anyObjectsPresent: [],
                                        movementsPresent: new Int32Array([0]),
                                        movementsMissing: new Int32Array([0]),
                                        replacement: {
                                            objectsClear: new Int32Array([3]),
                                            objectsSet: new Int32Array([2]),
                                            movementsClear: new Int32Array([0]),
                                            movementsSet: new Int32Array([0]),
                                            movementsLayerMask: new Int32Array([0]),
                                            randomEntityMask: new Int32Array([0]),
                                            randomDirMask: new Int32Array([0])
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        ]
    });
    const session = gameRuntime.createSessionFromState3D(state);

    const result = gameRuntime.processSessionTurn3D(session, null);

    assert.strictEqual(result.turns.length, 1);
    assert.strictEqual(result.turn.sessionArtifacts.againRequested, true);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);
}

function testDeferredAgainReturnsAfterOneBrowserTurn() {
    const state = makeState([new Int32Array([1])], {
        groups: [[
            makeReplaceAndAgainRule(1, 2)
        ]],
        lateGroups: []
    });
    const session = gameRuntime.createSessionFromState3D(state);

    const result = gameRuntime.processSessionTurn3D(session, "right", {
        deferAgain: true
    });

    assert.strictEqual(result.turns.length, 1);
    assert.strictEqual(result.againScheduled, false);
    assert.strictEqual(result.tailPlan.againRequested, true);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);
}

function testDeferredWinDoesNotAdvanceBrowserSessionImmediately() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1]),
        new Int32Array([2])
    ]));

    const plan = gameRuntime.applySessionArtifacts3D(session, {
        queue: ["win"],
        winRequested: true
    }, { boardChanged: true }, {
        deferWin: true
    });

    assert.strictEqual(plan.winRequested, true);
    assert.strictEqual(plan.winDeferred, true);
    assert.strictEqual(session.won, true);
    assert.strictEqual(session.levelIndex, 0);
    assert.strictEqual(session.completed, false);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [1]);
}

function testRunRulesOnLevelStartRunsAtSessionLevelCreation() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1, 0])
    ], {
        groups: [[makeMoveRightRule()]],
        lateGroups: []
    }, null, {
        run_rules_on_level_start: true
    }));

    assert.deepStrictEqual(Array.from(session.runtime.board.cells), [0, 1]);
    assert.deepStrictEqual(Array.from(session.restartSource.cells), [1, 0]);
    assert.strictEqual(session.history.length, 1);
}

function testRunRulesOnLevelStartRerunsAfterRestart() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1, 0])
    ], {
        groups: [[makeMoveRightRule()]],
        lateGroups: []
    }, null, {
        run_rules_on_level_start: true
    }));
    session.runtime.board.setCell(0, new Int32Array([2]));
    session.runtime.board.setCell(1, new Int32Array([0]));

    gameRuntime.applySessionArtifacts3D(session, { restartRequested: true });

    assert.deepStrictEqual(Array.from(session.runtime.board.cells), [0, 1]);
}

function testOldFlickScreenDatUses2DShapeOver3DXZPlaneAndRestoresWithSessionSources() {
    const session = gameRuntime.createSessionFromState3D(makeState([
        new Int32Array([1, 0, 0, 0, 0, 0])
    ], null, null, {
        flickscreen: [2, 2]
    }, {
        width: 3,
        height: 1,
        depth: 2
    }));

    assert.deepStrictEqual(session.oldflickscreendat, [0, 0, 2, 2]);
    assert.deepStrictEqual(session.restartSource.oldflickscreendat, [0, 0, 2, 2]);

    session.oldflickscreendat = [1, 1, 3, 2];
    gameRuntime.applySessionArtifacts3D(session, { checkpointRequested: true });
    session.oldflickscreendat = [0, 0, 1, 1];
    gameRuntime.applySessionArtifacts3D(session, { restartRequested: true });

    assert.deepStrictEqual(session.oldflickscreendat, [1, 1, 3, 2]);
}

function testRebuildSessionPreservesCurrentBoardAndUsesNewRules() {
    const oldState = makeState([new Int32Array([1])]);
    const newState = makeState([new Int32Array([2])], {
        groups: [[makeReplaceAndAgainRule(1, 2)]],
        lateGroups: []
    });
    const session = gameRuntime.createSessionFromState3D(oldState);

    gameRuntime.rebuildSessionFromState3D(session, newState);

    assert.strictEqual(session.state, newState);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [1]);
    assert.strictEqual(session.backups.length, 0);

    const result = gameRuntime.processSessionTurn3D(session, null);
    assert.strictEqual(result.turn.rulesChanged, true);
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);

    gameRuntime.applySessionArtifacts3D(session, { restartRequested: true });
    assert.deepStrictEqual(Array.from(session.runtime.board.getCell(0)), [2]);
}

function makeReplaceAndAgainRule(fromMask, toMask) {
    return {
        lineNumber: 200 + fromMask,
        commands: [["again"]],
        patterns: [
            {
                frameExpansion: "none",
                cells: [
                    {
                        offset: { x: 0, y: 0, z: 0 },
                        pattern: {
                            objectsPresent: new Int32Array([fromMask]),
                            objectsMissing: new Int32Array([0]),
                            anyObjectsPresent: [],
                            movementsPresent: new Int32Array([0]),
                            movementsMissing: new Int32Array([0]),
                            replacement: {
                                objectsClear: new Int32Array([3]),
                                objectsSet: new Int32Array([toMask]),
                                movementsClear: new Int32Array([0]),
                                movementsSet: new Int32Array([0]),
                                movementsLayerMask: new Int32Array([0]),
                                randomEntityMask: new Int32Array([0]),
                                randomDirMask: new Int32Array([0])
                            }
                        }
                    }
                ]
            }
        ]
    };
}

function makeMoveRightRule() {
    return {
        lineNumber: 100,
        patterns: [
            {
                frameExpansion: "none",
                cells: [
                    {
                        offset: { x: 0, y: 0, z: 0 },
                        pattern: {
                            objectsPresent: new Int32Array([1]),
                            objectsMissing: new Int32Array([0]),
                            anyObjectsPresent: [],
                            movementsPresent: new Int32Array([0]),
                            movementsMissing: new Int32Array([0]),
                            replacement: {
                                objectsClear: new Int32Array([0]),
                                objectsSet: new Int32Array([0]),
                                movementsClear: new Int32Array([0]),
                                movementsSet: new Int32Array([8]),
                                movementsLayerMask: new Int32Array([MOV_MASK_3D]),
                                randomEntityMask: new Int32Array([0]),
                                randomDirMask: new Int32Array([0])
                            }
                        }
                    }
                ]
            }
        ]
    };
}

function makeState(levelCells, rules3d, sections, metadata, dimensions) {
    const size = Object.assign({ width: null, height: 1, depth: 1 }, dimensions || {});
    return {
        metadata: metadata || {},
        default_metadata: {},
        playerMask: new Int32Array([1]),
        layerMasks: [new Int32Array([3])],
        objectCount: 2,
        idDict: ["player", "wall"],
        objects: {
            player: { id: 0, layer: 0 },
            wall: { id: 1, layer: 0 }
        },
        sections: sections || [],
        collisionLayers: [["player", "wall"]],
        rules3d: rules3d || { groups: [], lateGroups: [] },
        levels: levelCells.map((cells, index) => ({
            is3d: true,
            title: `Level ${index}`,
            width: size.width || cells.length,
            height: size.height,
            depth: size.depth,
            cellCount: cells.length,
            n_tiles: cells.length,
            layerCount: 1,
            objects: new Int32Array(cells)
        }))
    };
}

testCheckpointAndRestartRestoreSessionBoard();
testGotoSwitchesSessionLevelAndRestartTarget();
testWinAdvancesOrCompletesSession();
testWinConditionsAdvanceSessionLikeWinCommand();
testSessionTailUses2DCommandPriority();
testAgainCommandWithoutBoardChangeDoesNotLoop();
testAgainCommandWithBoardChangeRequiresNoInputProbeLike2D();
testDeferredAgainReturnsAfterOneBrowserTurn();
testDeferredWinDoesNotAdvanceBrowserSessionImmediately();
testRunRulesOnLevelStartRunsAtSessionLevelCreation();
testRunRulesOnLevelStartRerunsAfterRestart();
testOldFlickScreenDatUses2DShapeOver3DXZPlaneAndRestoresWithSessionSources();
testRebuildSessionPreservesCurrentBoardAndUsesNewRules();

console.log("3d game runtime tests passed");
