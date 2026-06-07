const assert = require("assert");

const rules = require("../src/js/rules3d.js");
const slots = require("../src/js/slots3d.js");
const runtimeApi = require("../src/js/runtime3d.js");
const turn = require("../src/js/turn3d.js");

const MOVEMENT_MASK_3D = 0x7f;

function movementLayerMask3D() {
    return new Int32Array([MOVEMENT_MASK_3D]);
}

function testInputSeedsPlayerMovementThenResolvesLike2DTurnLoop() {
    const runtime = makeRuntime(2, 1, 1);
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, "right");

    assert.deepStrictEqual(result.inputPositions, [0]);
    assert.strictEqual(result.rulesChanged, false);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.moved, true);
    assert.strictEqual(result.changed, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [0]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [1]);
    assert.deepStrictEqual(Array.from(runtime.board.getMovements(0)), [0]);
}

function testRuleReplacementSeedsMovementBeforeResolution() {
    const runtime = makeRuntime(2, 1, 1, {
        rules: {
            groups: [
                makeMoveRightRule()
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.inputPositions.length, 0);
    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.moved, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [0]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [1]);
}

function testBlockedRuleSeededMovementIsClearedAfterResolution() {
    const runtime = makeRuntime(2, 1, 1, {
        rules: {
            groups: [
                makeMoveRightRule()
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, false);
    assert.strictEqual(result.moved, false);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
    assert.deepStrictEqual(Array.from(runtime.board.getMovements(0)), [0]);
}

function testLateGroupsRunAfterMovementResolutionLike2DTurnLoop() {
    const runtime = makeRuntime(2, 1, 1, {
        rules: {
            groups: [],
            lateGroups: [
                {
                    lineNumber: 2,
                    patterns: [
                        rules.makePattern([
                            {
                                offset: {},
                                pattern: rules.makeCellPattern({
                                    objectsPresent: new Int32Array([1]),
                                    replacement: rules.makeCellReplacement({
                                        objectsClear: new Int32Array([3]),
                                        objectsSet: new Int32Array([2])
                                    })
                                })
                            }
                        ])
                    ]
                }
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, "right");

    assert.strictEqual(result.moved, true);
    assert.strictEqual(result.lateRulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [0]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
}

function testCommandsAreQueuedAsTurnArtifactsLike2D() {
    const runtime = makeRuntime(1, 1, 1, {
        rules: {
            groups: [
                {
                    lineNumber: 10,
                    commands: [["message", "hello"], ["status", "ready"], ["goto", "next"], ["win"], ["again"], ["checkpoint"]],
                    patterns: [
                        rules.makePattern([
                            {
                                offset: {},
                                pattern: rules.makeCellPattern({
                                    objectsPresent: new Int32Array([1])
                                })
                            }
                        ])
                    ]
                }
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.deepStrictEqual(result.commandQueue, ["message", "status", "goto,next", "win", "again", "checkpoint"]);
    assert.strictEqual(result.commandArtifacts.messageText, "hello");
    assert.strictEqual(result.commandArtifacts.statusText, "ready");
    assert.strictEqual(result.sessionArtifacts.messageRequested, true);
    assert.strictEqual(result.sessionArtifacts.statusRequested, true);
    assert.strictEqual(result.sessionArtifacts.gotoTarget, "next");
    assert.strictEqual(result.sessionArtifacts.winRequested, true);
    assert.strictEqual(result.sessionArtifacts.againRequested, true);
    assert.strictEqual(result.sessionArtifacts.checkpointRequested, true);
    assert.strictEqual(result.commandArtifacts.sourceRules[0].lineNumber, 10);
    assert.strictEqual(result.commandsChanged, true);
    assert.strictEqual(result.changed, true);
}

function testMultiPatternRuleRequiresAllPatternsBeforeApplyingLike2D() {
    const runtime = makeRuntime(2, 1, 1, {
        rules: {
            groups: [
                {
                    lineNumber: 12,
                    patterns: [
                        rules.makePattern([
                            {
                                offset: {},
                                pattern: rules.makeCellPattern({
                                    objectsPresent: new Int32Array([1]),
                                    replacement: rules.makeCellReplacement({
                                        objectsClear: new Int32Array([1]),
                                        objectsSet: new Int32Array([2])
                                    })
                                })
                            }
                        ]),
                        rules.makePattern([
                            {
                                offset: {},
                                pattern: rules.makeCellPattern({
                                    objectsPresent: new Int32Array([2])
                                })
                            }
                        ])
                    ]
                }
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, false);
    assert.strictEqual(result.boardChanged, false);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1]);
}

function testMultiPatternRuleQueuesCommandsOnceForWholeRuleLike2D() {
    const runtime = makeRuntime(2, 1, 1, {
        rules: {
            groups: [
                {
                    lineNumber: 13,
                    commands: [["log", "matched"]],
                    patterns: [
                        rules.makePattern([
                            {
                                offset: {},
                                pattern: rules.makeCellPattern({
                                    objectsPresent: new Int32Array([1])
                                })
                            }
                        ]),
                        rules.makePattern([
                            {
                                offset: {},
                                pattern: rules.makeCellPattern({
                                    objectsPresent: new Int32Array([2])
                                })
                            }
                        ])
                    ]
                }
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, false);
    assert.strictEqual(result.boardChanged, false);
    assert.strictEqual(result.commandArtifacts.logs.length, 1);
    assert.strictEqual(result.commandArtifacts.logs[0].message, "matched");
}

function testRuntimeMetadataTwiddlingRunsWhenCommandIsQueuedLike2D() {
    const runtime = makeRuntime(1, 1, 1, {
        metadata: {
            runtime_metadata_twiddling: true,
            text_color: "white",
            noundo: true,
            key_repeat_interval: "0.2"
        },
        defaultMetadata: {
            text_color: "green",
            key_repeat_interval: "0.5"
        },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 44,
                        commands: [
                            ["text_color", "red"],
                            ["noundo", "wipe"],
                            ["key_repeat_interval", "default"]
                        ],
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1])
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.commandsChanged, true);
    assert.strictEqual(runtime.slots.mutation.metadata.text_color, "red");
    assert.strictEqual(runtime.slots.mutation.metadata.noundo, undefined);
    assert.strictEqual(runtime.slots.mutation.metadata.key_repeat_interval, "0.5");
    assert.strictEqual(runtime.slots.session.undo.enabled, true);
    assert.strictEqual(runtime.slots.input.repeat.repeatMs, 500);
}

function testRigidFailureRollsBackAndBansFailedRuleGroup() {
    const runtime = makeRuntime(2, 1, 1, {
        rigidGroupIndexToGroupIndex: [0],
        groupNumberToRigidGroupIndex: { 7: 0 },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 20,
                        groupNumber: 7,
                        rigid: true,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            movementsSet: new Int32Array([8]),
                                            movementsLayerMask: movementLayerMask3D()
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, false);
    assert.strictEqual(result.moved, false);
    assert.strictEqual(result.bannedGroups[0], true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
    assert.deepStrictEqual(Array.from(runtime.board.getMovements(0)), [0]);
}

function testRigidFailureRollsBackCommandArtifactsFromFailedSimulation() {
    const runtime = makeRuntime(2, 1, 1, {
        rigidGroupIndexToGroupIndex: [0],
        groupNumberToRigidGroupIndex: { 7: 0 },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 20,
                        groupNumber: 7,
                        rigid: true,
                        commands: [["message", "blocked"]],
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            movementsSet: new Int32Array([8]),
                                            movementsLayerMask: movementLayerMask3D()
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ],
                [
                    {
                        lineNumber: 21,
                        commands: [["win"]],
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1])
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.bannedGroups[0], true);
    assert.deepStrictEqual(result.commandQueue, ["win"]);
    assert.strictEqual(result.commandArtifacts.messageText, "");
    assert.strictEqual(result.commandArtifacts.sourceRules[0].lineNumber, 21);
}

function testSfxArtifactsAreReturnedForCreateDestroyLike2D() {
    const runtime = makeRuntime(1, 1, 1, {
        sfxCreationMasks: [{ objId: 1, seed: "33" }],
        sfxDestructionMasks: [{ objId: 0, seed: "44" }],
        rules: {
            groups: [
                [
                    {
                        lineNumber: 25,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            objectsClear: new Int32Array([1]),
                                            objectsSet: new Int32Array([2])
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.deepStrictEqual(result.sfxArtifacts.playSeeds, ["33", "44"]);
    assert.deepStrictEqual(result.sfxArtifacts.createSeeds, ["33"]);
    assert.deepStrictEqual(result.sfxArtifacts.destroySeeds, ["44"]);
    assert.deepStrictEqual(result.sfxArtifacts.animations, {});
    assert.strictEqual(result.changed, true);
}

function testSfxArtifactsAreReturnedForMovementAndCantMoveLike2D() {
    const movingRuntime = makeRuntime(2, 1, 1, {
        sfxMovementMasks: [[
            { objId: 0, directionMask: new Int32Array([8]), seed: "55" }
        ]]
    });
    movingRuntime.board.setCell(0, new Int32Array([1]));

    const movingResult = turn.processTurn(movingRuntime, "right");

    assert.strictEqual(movingResult.moved, true);
    assert.deepStrictEqual(movingResult.sfxArtifacts.canMoveSeeds, ["55"]);
    assert.deepStrictEqual(movingResult.sfxArtifacts.playSeeds, ["55"]);

    const blockedRuntime = makeRuntime(2, 1, 1, {
        sfxMovementFailureMasks: [
            { objId: 0, directionMask: new Int32Array([8]), seed: "66" }
        ]
    });
    blockedRuntime.board.setCell(0, new Int32Array([1]));
    blockedRuntime.board.setCell(1, new Int32Array([2]));

    const blockedResult = turn.processTurn(blockedRuntime, "right");

    assert.strictEqual(blockedResult.moved, false);
    assert.deepStrictEqual(blockedResult.sfxArtifacts.cantMoveSeeds, ["66"]);
    assert.deepStrictEqual(blockedResult.sfxArtifacts.playSeeds, ["66"]);
}

function testRigidFailureRollsBackSfxArtifactsFromFailedSimulation() {
    const runtime = makeRuntime(2, 1, 1, {
        sfxCreationMasks: [{ objId: 1, seed: "33" }],
        rigidGroupIndexToGroupIndex: [0],
        groupNumberToRigidGroupIndex: { 7: 0 },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 26,
                        groupNumber: 7,
                        rigid: true,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            objectsSet: new Int32Array([2]),
                                            movementsSet: new Int32Array([8]),
                                            movementsLayerMask: movementLayerMask3D()
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.bannedGroups[0], true);
    assert.deepStrictEqual(result.sfxArtifacts.playSeeds, []);
    assert.deepStrictEqual(result.sfxArtifacts.createSeeds, []);
    assert.deepStrictEqual(result.sfxArtifacts.animations, {});
}

function testRigidResimulationCanBanMultipleGroupsBeforeSettling() {
    const runtime = makeRuntime(3, 1, 1, {
        rigidGroupIndexToGroupIndex: [0, 1],
        groupNumberToRigidGroupIndex: { 7: 0, 8: 1 },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 30,
                        groupNumber: 7,
                        rigid: true,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            movementsSet: new Int32Array([8]),
                                            movementsLayerMask: movementLayerMask3D()
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ],
                [
                    {
                        lineNumber: 31,
                        groupNumber: 8,
                        rigid: true,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            movementsSet: new Int32Array([32]),
                                            movementsLayerMask: movementLayerMask3D()
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ],
                [
                    {
                        lineNumber: 32,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            objectsClear: new Int32Array([3]),
                                            objectsSet: new Int32Array([2])
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.bannedGroups[0], true);
    assert.strictEqual(result.bannedGroups[1], true);
    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [2]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(2)), [0]);
}

function testLateRulesRunOnlyAfterRigidResimulationSettles() {
    const runtime = makeRuntime(2, 1, 1, {
        rigidGroupIndexToGroupIndex: [0],
        groupNumberToRigidGroupIndex: { 7: 0 },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 40,
                        groupNumber: 7,
                        rigid: true,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            movementsSet: new Int32Array([8]),
                                            movementsLayerMask: movementLayerMask3D()
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ],
            lateGroups: [
                [
                    {
                        lineNumber: 41,
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            objectsClear: new Int32Array([3]),
                                            objectsSet: new Int32Array([2])
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.bannedGroups[0], true);
    assert.strictEqual(result.lateRulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [2]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
}

function testRandomRuleGroupAppliesOneFlattenedCandidateLike2D() {
    const runtime = makeRuntime(2, 1, 1, {
        rules: {
            groups: [
                [
                    {
                        lineNumber: 10,
                        randomRule: true,
                        commands: [["message", "first"]],
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            objectsClear: new Int32Array([1]),
                                            objectsSet: new Int32Array([2])
                                        })
                                    })
                                }
                            ])
                        ]
                    },
                    {
                        lineNumber: 20,
                        randomRule: true,
                        commands: [["message", "second"]],
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1]),
                                        replacement: rules.makeCellReplacement({
                                            objectsClear: new Int32Array([1]),
                                            objectsSet: new Int32Array([4])
                                        })
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.uniform = () => 0.99;
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [4]);
    assert.deepStrictEqual(result.commandQueue, ["message"]);
    assert.strictEqual(result.commandArtifacts.messageText, "second");
    assert.strictEqual(result.commandArtifacts.sourceRules[0].lineNumber, 20);
}

function testNormalRuleIsConstrainedByLocalRadiusLike2D() {
    const runtime = makeRuntime(5, 1, 1, {
        metadata: { local_radius: "0" },
        rules: {
            groups: [
                makeFarWallReplacementRule(false)
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(4, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, false);
    assert.deepStrictEqual(result.commandQueue, []);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(4)), [2]);
}

function testGlobalRuleBypassesLocalRadiusLike2D() {
    const runtime = makeRuntime(5, 1, 1, {
        metadata: { local_radius: "0" },
        rules: {
            groups: [
                makeFarWallReplacementRule(true)
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(4, new Int32Array([2]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(result.commandQueue, ["message"]);
    assert.strictEqual(result.commandArtifacts.messageText, "global");
    assert.deepStrictEqual(Array.from(runtime.board.getCell(4)), [1]);
}

function testWinConditionsAreEvaluatedByTurnPrimitiveLike2DCheckWin() {
    const runtime = makeRuntime(1, 1, 1, {
        rules: {
            groups: [],
            lateGroups: [],
            winConditions: [
                [0, new Int32Array([1]), new Int32Array([3]), 1, false, false]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null);

    assert.strictEqual(result.winConditionSatisfied, true);
    assert.strictEqual(result.sessionArtifacts.winRequested, true);
}

function testDontDoWinSuppressesTurnWinArtifactLike2DCheckWin() {
    const runtime = makeRuntime(1, 1, 1, {
        rules: {
            groups: [],
            lateGroups: [],
            winConditions: [
                [0, new Int32Array([1]), new Int32Array([3]), 1, false, false]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));

    const result = turn.processTurn(runtime, null, { dontDoWin: true });

    assert.strictEqual(result.winConditionSatisfied, true);
    assert.strictEqual(result.sessionArtifacts.winRequested, false);
}

function testRequirePlayerMovementCancelsBlockedInputLike2D() {
    const runtime = makeRuntime(2, 1, 1, {
        metadata: { require_player_movement: true },
        rules: {
            groups: [
                [
                    {
                        lineNumber: 80,
                        commands: [["message", "blocked"]],
                        patterns: [
                            rules.makePattern([
                                {
                                    offset: {},
                                    pattern: rules.makeCellPattern({
                                        objectsPresent: new Int32Array([1])
                                    })
                                }
                            ])
                        ]
                    }
                ]
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, "right");

    assert.strictEqual(result.requirePlayerMovementFailed, true);
    assert.strictEqual(result.changed, false);
    assert.deepStrictEqual(result.commandQueue, []);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
}

function testRequirePlayerMovementAllowsRuleRemovedPlayerFromStartLike2D() {
    const runtime = makeRuntime(2, 1, 1, {
        metadata: { require_player_movement: true },
        rules: {
            groups: [
                makeReplacePlayerWithWallRule()
            ]
        }
    });
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([2]));

    const result = turn.processTurn(runtime, "right");

    assert.strictEqual(result.requirePlayerMovementFailed, false);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [2]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [2]);
}

function makeMoveRightRule() {
    return {
        lineNumber: 1,
        patterns: [
            rules.makePattern([
                {
                    offset: {},
                    pattern: rules.makeCellPattern({
                        objectsPresent: new Int32Array([1]),
                        replacement: rules.makeCellReplacement({
                            movementsSet: new Int32Array([8])
                        })
                    })
                }
            ])
        ]
    };
}

function makeFarWallReplacementRule(globalRule) {
    return {
        lineNumber: 30,
        globalRule: !!globalRule,
        commands: [["message", "global"]],
        patterns: [
            rules.makePattern([
                {
                    offset: {},
                    pattern: rules.makeCellPattern({
                        objectsPresent: new Int32Array([2]),
                        replacement: rules.makeCellReplacement({
                            objectsClear: new Int32Array([2]),
                            objectsSet: new Int32Array([1])
                        })
                    })
                }
            ])
        ]
    };
}

function makeReplacePlayerWithWallRule() {
    return {
        lineNumber: 81,
        patterns: [
            rules.makePattern([
                {
                    offset: {},
                    pattern: rules.makeCellPattern({
                        objectsPresent: new Int32Array([1]),
                        replacement: rules.makeCellReplacement({
                            objectsClear: new Int32Array([3]),
                            objectsSet: new Int32Array([2])
                        })
                    })
                }
            ])
        ]
    };
}

function makeRuntime(width, height, depth, options) {
    const opts = options || {};
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

    return runtimeApi.createRuntime3D(slots.buildSlots3D({
        metadata: opts.metadata || {},
        default_metadata: opts.defaultMetadata || {},
        playerMask: new Int32Array([1]),
        layerMasks: [new Int32Array([3])],
        objectCount: 2,
        sfx_CreationMasks: opts.sfxCreationMasks || [],
        sfx_DestructionMasks: opts.sfxDestructionMasks || [],
        sfx_MovementMasks: opts.sfxMovementMasks || [],
        sfx_MovementFailureMasks: opts.sfxMovementFailureMasks || [],
        rigidGroupIndex_to_GroupIndex: opts.rigidGroupIndexToGroupIndex || [],
        groupNumber_to_RigidGroupIndex: opts.groupNumberToRigidGroupIndex || {},
        idDict: ["player", "wall"],
        objects: {
            player: { id: 0, layer: 0 },
            wall: { id: 1, layer: 0 }
        },
        rules3d: opts.rules,
        levels: [level]
    }));
}

testInputSeedsPlayerMovementThenResolvesLike2DTurnLoop();
testRuleReplacementSeedsMovementBeforeResolution();
testBlockedRuleSeededMovementIsClearedAfterResolution();
testLateGroupsRunAfterMovementResolutionLike2DTurnLoop();
testCommandsAreQueuedAsTurnArtifactsLike2D();
testMultiPatternRuleRequiresAllPatternsBeforeApplyingLike2D();
testMultiPatternRuleQueuesCommandsOnceForWholeRuleLike2D();
testRuntimeMetadataTwiddlingRunsWhenCommandIsQueuedLike2D();
testRigidFailureRollsBackAndBansFailedRuleGroup();
testRigidFailureRollsBackCommandArtifactsFromFailedSimulation();
testSfxArtifactsAreReturnedForCreateDestroyLike2D();
testSfxArtifactsAreReturnedForMovementAndCantMoveLike2D();
testRigidFailureRollsBackSfxArtifactsFromFailedSimulation();
testRigidResimulationCanBanMultipleGroupsBeforeSettling();
testLateRulesRunOnlyAfterRigidResimulationSettles();
testRandomRuleGroupAppliesOneFlattenedCandidateLike2D();
testNormalRuleIsConstrainedByLocalRadiusLike2D();
testGlobalRuleBypassesLocalRadiusLike2D();
testWinConditionsAreEvaluatedByTurnPrimitiveLike2DCheckWin();
testDontDoWinSuppressesTurnWinArtifactLike2DCheckWin();
testRequirePlayerMovementCancelsBlockedInputLike2D();
testRequirePlayerMovementAllowsRuleRemovedPlayerFromStartLike2D();

console.log("3d turn tests passed");
