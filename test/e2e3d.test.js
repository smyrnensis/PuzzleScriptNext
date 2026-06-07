const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ThreeDimensionLevels = require("../src/js/levels3d.js");
const gameRuntime = require("../src/js/game_runtime3d.js");
const renderFrame = require("../src/js/render_frame3d.js");

function testPuzzleScriptTextCompilesAndRunsOne3DTurnWithoutRendering() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D E2E",
        "three_dimensions",
        "tween_length 0.5",
        "tween_snap 5",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "rules",
        "[ player ] -> [ right player ]",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.metadata.three_dimensions, true);
    assert.strictEqual(state.metadata.tween_length, 0.5);
    assert.strictEqual(state.levels.length, 1);
    assert.strictEqual(state.levels[0].is3d, true);
    assert.strictEqual(state.rules3d.groups.length, 1);
    assert(Array.isArray(state.rules3d.groups[0]));
    assert.deepStrictEqual(state.rules, []);
    assert.deepStrictEqual(state.lateRules, []);
    assert.deepStrictEqual(state.rigidGroups, []);
    assert.deepStrictEqual(state.loopPoint, {});
    assert.deepStrictEqual(state.lateLoopPoint, {});

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    assert.deepStrictEqual(runtime.board.movementTween, { enabled: true });
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [3]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [1]);

    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.moved, true);
    assert.strictEqual(result.changed, true);
    assert.deepStrictEqual(result.movedEntities, { "p1-l1": runtime.board.directionBits.right });
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [3]);
    assert.deepStrictEqual(Array.from(runtime.board.getMovements(0)), [0]);
    assert.deepStrictEqual(Array.from(runtime.board.getMovements(1)), [0]);

    const frame = renderFrame.buildSessionTurnRenderFrame3D({
        session: { runtime, state },
        turn: result,
        turns: [result]
    }, { state });
    assert.strictEqual(frame.effects.tween.enabled, true);
    assert.strictEqual(frame.effects.tween.lengthMs, 500);
    assert.deepStrictEqual(frame.effects.tween.movedEntities, { "p1-l1": runtime.board.directionBits.right });
}

function testPuzzleScriptTextCompiles3DObjectSpriteRowsLikeStacked2DSprites() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Sprite E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white black",
        "01",
        ".0",
        ";",
        "10",
        "0.",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(state.objects.p.spritematrix, [
        [0, 1],
        [-1, 0]
    ]);
    assert.deepStrictEqual(state.objects.p.sprite3matrix, [
        [
            [0, 1],
            [1, 0]
        ],
        [
            [-1, 0],
            [0, -1]
        ]
    ]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const playerVisual = frame.objects[state.objects.p.id].visual;

    assert.strictEqual(playerVisual.kind, "sprite3matrix");
    assert.deepStrictEqual(playerVisual.voxels.size, { width: 2, height: 2, depth: 2 });
    assert.deepStrictEqual(playerVisual.voxels.cells, [
        { col: 0, row: 0, slice: 0, color: "#ffffff" },
        { col: 0, row: 0, slice: 1, color: "#000000" },
        { col: 1, row: 0, slice: 0, color: "#000000" },
        { col: 1, row: 0, slice: 1, color: "#ffffff" },
        { col: 0, row: 1, slice: 1, color: "#ffffff" },
        { col: 1, row: 1, slice: 0, color: "#ffffff" }
    ]);
}

function testPuzzleScriptTextUsesSpriteSizeFor3DWidthHeightAndSliceCountForDepth() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Sprite Size E2E",
        "three_dimensions",
        "sprite_size 3",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white",
        "000",
        "0.0",
        "000",
        ";",
        "0.0",
        "...",
        "0.0",
        ";",
        "000",
        "0.0",
        "000",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.sprite_size, 3);
    assert.deepStrictEqual(state.objects.b.spritematrix, [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const playerVisual = frame.objects[state.objects.p.id].visual;

    assert.strictEqual(playerVisual.kind, "sprite3matrix");
    assert.deepStrictEqual(playerVisual.voxels.size, { width: 3, height: 3, depth: 3 });
    assert.deepStrictEqual(frame.spriteGrid, { width: 3, height: 3, depth: 3 });
}

function testPuzzleScriptTextUsesSpriteSizeForOmitted3DSpriteAscii() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Sprite Default E2E",
        "three_dimensions",
        "sprite_size 3",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(sprite3Depth(state.objects.b.sprite3matrix), 3);
    assert.strictEqual(sprite3Depth(state.objects.p.sprite3matrix), 3);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const playerVisual = frame.objects[state.objects.p.id].visual;

    assert.strictEqual(playerVisual.kind, "sprite3matrix");
    assert.deepStrictEqual(playerVisual.voxels.size, { width: 3, height: 3, depth: 3 });
    assert.strictEqual(playerVisual.voxels.cells.length, 27);
    assert.deepStrictEqual(frame.spriteGrid, { width: 3, height: 3, depth: 3 });
}

function testPuzzleScriptTextUsesSpriteSizeSevenFor3DRenderContract() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Sprite Size Seven E2E",
        "three_dimensions",
        "sprite_size 7",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.sprite_size, 7);
    assert.strictEqual(sprite3Depth(state.objects.b.sprite3matrix), 7);
    assert.strictEqual(sprite3Depth(state.objects.p.sprite3matrix), 7);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const playerVisual = frame.objects[state.objects.p.id].visual;

    assert.strictEqual(playerVisual.kind, "sprite3matrix");
    assert.deepStrictEqual(playerVisual.voxels.size, { width: 7, height: 7, depth: 7 });
    assert.strictEqual(playerVisual.voxels.cells.length, 343);
    assert.deepStrictEqual(frame.spriteGrid, { width: 7, height: 7, depth: 7 });
}

function testPuzzleScriptTextCompiles3DSpriteAlphaAndTransparentDots() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Sprite Alpha E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "#00000033",
        "0.",
        "..",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    assert.deepStrictEqual(frame.objects[state.objects.p.id].visual.voxels.cells, [
        { col: 0, row: 0, slice: 0, color: "#000000", alpha: 0x33 / 255 }
    ]);
}

function testPuzzleScriptTextCompiles3DCameraPreludeLikeExistingPreludeMetadata() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Camera Prelude E2E",
        "three_dimensions",
        "perspective_camera",
        "camera_angle 45 35",
        "camera_view_angle 50",
        "camera_zoom 1.25",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.metadata.perspective_camera, true);
    assert.deepStrictEqual(state.metadata.camera_angle, { yaw: 45, pitch: 35 });
    assert.strictEqual(state.metadata.camera_view_angle, 50);
    assert.strictEqual(state.metadata.camera_zoom, 1.25);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.deepStrictEqual(frame.view, {
        projection: "perspective",
        yaw: 45,
        pitch: 35,
        cameraZoom: 1.25,
        cameraViewAngle: 50,
        backgroundColor: "#000000",
        shade: true,
        visibility: "all",
        slice: null,
        cameraCenter: null,
        visibleRegion: null,
        renderRegion: null
    });
}

function testPuzzleScriptTextRejectsCameraDistanceAs3DCameraPrelude() {
    const { compiler, errors } = loadCompilerForE2ETest();
    compiler.loadFile([
        "title 3D Camera Prelude E2E",
        "three_dimensions",
        "camera_distance 12",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "levels",
        "p"
    ].join("\n"));

    assert(errors.some(error => /CAMERA_DISTANCE is not supported/.test(error.message)), JSON.stringify(errors));
}

function testPuzzleScriptTextCompilesAndQueues3DCommandsLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Command E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "rules",
        "[ player ] -> [ player ] win again checkpoint",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(state.rules3d.groups[0][0].commands, [["win"], ["again"], ["checkpoint"]]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.deepStrictEqual(result.commandQueue, ["win", "again", "checkpoint"]);
    assert.deepStrictEqual(result.commandArtifacts.queue, ["win", "again", "checkpoint"]);
    assert.strictEqual(result.sessionArtifacts.winRequested, true);
    assert.strictEqual(result.sessionArtifacts.againRequested, true);
    assert.strictEqual(result.sessionArtifacts.checkpointRequested, true);
    assert.strictEqual(result.commandArtifacts.sourceRules[0].lineNumber, 26);
    assert.strictEqual(result.commandsChanged, true);
    assert.strictEqual(result.changed, true);
}

function testPuzzleScriptTextCompilesAndAppliesWinConditions3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Wincondition E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "winconditions",
        "some player",
        "",
        "levels",
        "pb",
        "",
        "b"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.rules3d.winConditions.length, 1);

    const session = gameRuntime.createSessionFromState3D(state);
    const result = gameRuntime.processSessionTurn3D(session, null);

    assert.strictEqual(result.sessionState.levelIndex, 1);
    assert.strictEqual(session.completed, false);
}

function testPuzzleScriptTextCompilesAndAppliesGlobal3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Global E2E",
        "three_dimensions",
        "local_radius 0",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "c crate",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, crate",
        "",
        "rules",
        "global [ crate ] -> [ player ] message global",
        "",
        "levels",
        "pbbbc"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.rules3d.groups[0][0].globalRule, true);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(result.commandQueue, ["message"]);
    assert.strictEqual(result.commandArtifacts.messageText, "global");
    assert.deepStrictEqual(Array.from(runtime.board.getCell(4)), [3]);
}

function testPuzzleScriptTextCompilesAndRunsStartLoop3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Loop E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "c crate",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, crate, wall",
        "",
        "rules",
        "startloop",
        "[ crate ] -> [ wall ]",
        "[ player ] -> [ crate ]",
        "endloop",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(state.rules3d.loopPoint, { 2: 0 });

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [9]);
}

function testPuzzleScriptTextCompilesAndRunsGosub3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Gosub E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "c crate",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, crate, wall",
        "",
        "rules",
        "[ player ] -> [ player ] gosub sub",
        "[ player ] -> [ crate ] message after",
        "subroutine sub",
        "[ player ] -> [ wall ] message sub",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.rules3d.groups[0][0].commands[0][0], "gosub");
    assert.strictEqual(state.rules3d.groups[0][0].commands[0][1], 2);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [9]);
    assert.deepStrictEqual(result.commandQueue, ["message"]);
    assert.strictEqual(result.commandArtifacts.messageText, "sub");
}

function testPuzzleScriptTextCompilesAndRunsEllipsis3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Ellipsis E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "c crate",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, crate, wall",
        "",
        "rules",
        "[ player | ... | crate ] -> [ wall | ... | crate ]",
        "",
        "levels",
        "pbbbc"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.rules3d.groups[0][0].patterns[0].ellipsisCount, 1);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [9]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(4)), [5]);
}

function testPuzzleScriptTextCompilesAndAppliesRandomObject3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Random Object E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "a crate",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player",
        "crate",
        "",
        "rules",
        "[ player ] -> [ player random a ]",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(Array.from(state.rules3d.groups[0][0].patterns[0].cells[0].pattern.replacement.randomEntityMask), [4]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.changed, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [7]);
}

function testPuzzleScriptTextCompilesAndAppliesRandomRuleGroup3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Random Rule Group E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "a crate",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "q",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player",
        "a, q",
        "",
        "rules",
        "random [ player ] -> [ player a ] message first",
        "+ [ player ] -> [ player q ] message second",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.rules3d.groups.length, 1);
    assert.strictEqual(state.rules3d.groups[0][0].randomRule, true);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    runtime.board.uniform = () => 0.99;
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [11]);
    assert.deepStrictEqual(result.commandQueue, ["message"]);
    assert.strictEqual(result.commandArtifacts.messageText, "second");
}

function testPuzzleScriptTextCompilesAndAppliesRandomDir3DWithSixDirections() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D RandomDir E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "rules",
        "[ player ] -> [ randomdir player ]",
        "",
        "levels",
        "pbb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(Array.from(state.rules3d.groups[0][0].patterns[0].cells[0].pattern.replacement.randomDirMask), [1 << 7]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    runtime.board.uniform = () => 5 / 6;
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, false);
    assert.strictEqual(result.moved, false);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [3]);
    assert.deepStrictEqual(Array.from(runtime.board.getMovements(0)), [0]);
}

function testPuzzleScriptTextCompilesAndRollsBackRigid3DLike2D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Rigid E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, wall",
        "",
        "rules",
        "rigid [ player ] -> [ right player ]",
        "",
        "levels",
        "pwb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(state.rigidGroupIndex_to_GroupIndex, [0]);
    assert.strictEqual(state.groupNumber_to_RigidGroupIndex[state.rules3d.groups[0][0].groupNumber], 0);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.bannedGroups[0], true);
    assert.strictEqual(result.rulesChanged, false);
    assert.strictEqual(result.moved, false);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [3]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [5]);
}

function testPuzzleScriptTextBansMultipleRigidGroupsBeforeFallback3D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Multi Rigid E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "g goal",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, wall, goal",
        "",
        "rules",
        "rigid [ player ] -> [ right player ]",
        "======",
        "rigid [ player ] -> [ left player ]",
        "======",
        "[ player ] -> [ goal ]",
        "",
        "levels",
        "wpb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(state.rigidGroupIndex_to_GroupIndex, [0, 1]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.bannedGroups[0], true);
    assert.strictEqual(result.bannedGroups[1], true);
    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [5]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [9]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(2)), [1]);
}

function testPuzzleScriptTextCompilesAndRunsLate3DLike2DPhase() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Late E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "collisionlayers",
        "background",
        "player, wall",
        "",
        "rules",
        "[ player ] -> [ right player ]",
        "late [ player ] -> [ wall ]",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.rules3d.groups.length, 1);
    assert.strictEqual(state.rules3d.lateGroups.length, 1);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.moved, true);
    assert.strictEqual(result.lateRulesChanged, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [1]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [5]);
}

function testPuzzleScriptTextCompilesAndReturnsCreateDestroySfxArtifacts3D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D SFX E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "sounds",
        "wall create 33",
        "player destroy 44",
        "",
        "collisionlayers",
        "background",
        "player, wall",
        "",
        "rules",
        "[ player ] -> [ wall ]",
        "",
        "levels",
        "pb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.deepStrictEqual(state.sfx_CreationMasks.map(entry => ({ objId: entry.objId, seed: entry.seed })), [
        { objId: 2, seed: "33" }
    ]);
    assert.deepStrictEqual(state.sfx_DestructionMasks.map(entry => ({ objId: entry.objId, seed: entry.seed })), [
        { objId: 1, seed: "44" }
    ]);

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, null);

    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.deepStrictEqual(result.sfxArtifacts.playSeeds, ["33", "44"]);
    assert.deepStrictEqual(result.sfxArtifacts.createSeeds, ["33"]);
    assert.deepStrictEqual(result.sfxArtifacts.destroySeeds, ["44"]);
}

function testPuzzleScriptTextCompilesAndReturnsMovementSfxArtifacts3D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Movement SFX E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "sounds",
        "player move right 55",
        "",
        "collisionlayers",
        "background",
        "player",
        "",
        "rules",
        "",
        "levels",
        "pbb"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, "right");

    assert.strictEqual(result.moved, true);
    assert.deepStrictEqual(result.sfxArtifacts.canMoveSeeds, ["55"]);
    assert.deepStrictEqual(result.sfxArtifacts.playSeeds, ["55"]);
}

function testPuzzleScriptTextCompilesAndReturnsCantMoveSfxArtifacts3D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D CantMove SFX E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "p player",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "w wall",
        "white",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "",
        "sounds",
        "player cantmove right 66",
        "",
        "collisionlayers",
        "background",
        "player, wall",
        "",
        "rules",
        "",
        "levels",
        "pw"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, "right");

    assert.strictEqual(result.moved, false);
    assert.deepStrictEqual(result.sfxArtifacts.cantMoveSeeds, ["66"]);
    assert.deepStrictEqual(result.sfxArtifacts.playSeeds, ["66"]);
}

function testPuzzleScriptTextCompilesRelativePushCarrierForFront3D() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const state = compiler.loadFile([
        "title 3D Relative Push Carrier E2E",
        "three_dimensions",
        "",
        "objects",
        "b background",
        "black",
        "",
        "p player",
        "white",
        "",
        "c box",
        "white",
        "",
        "g goal",
        "white",
        "",
        "collisionlayers",
        "background",
        "goal",
        "player, box",
        "",
        "rules",
        "[ > player | box ] -> [ > player | > box ]",
        "",
        "winconditions",
        "all box on goal",
        "",
        "levels",
        "g",
        "c",
        "p"
    ].join("\n"));

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");

    const frontRule = state.rules3d.groups[0].find(rule => rule.direction === "front");
    assert(frontRule, "relative push did not expand to a front-facing 3D rule");
    assert.deepStrictEqual(frontRule.patterns[0].cells.map(cell => cell.offset), [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -1 }
    ]);
    assert.deepStrictEqual(
        frontRule.patterns[0].cells.map(cell => Array.from(cell.pattern.replacement.movementsSet)),
        [[524288], [524288]]
    );

    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const result = gameRuntime.processTurn3D(runtime, "front");

    assert.strictEqual(result.moved, true);
    assert.strictEqual(result.rulesChanged, true);
    assert.strictEqual(result.boardChanged, true);
    assert.strictEqual(result.sessionArtifacts.winRequested, true);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(0)), [11]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(1)), [5]);
    assert.deepStrictEqual(Array.from(runtime.board.getCell(2)), [1]);
}

function testMicroban3DFixtureCompilesWith3DSpritesAndLevels() {
    const { compiler, errors } = loadCompilerForE2ETest();
    const source = fs.readFileSync(path.join(__dirname, "../src/demo/3d microban.txt"), "utf8");
    const state = compiler.loadFile(source);

    assert.deepStrictEqual(errors, []);
    assert(state, "compiler returned no state");
    assert.strictEqual(state.metadata.three_dimensions, true);
    assert.deepStrictEqual(state.metadata.camera_angle, { yaw: 0, pitch: 60 });
    assert.strictEqual(state.levels.length, 7);
    const playable3DLevels = state.levels.filter(level => level.is3d);
    assert.strictEqual(playable3DLevels.length, 3);
    assert(playable3DLevels.every(level => level.height === 2), "Microban 3D playable levels should keep a solid slice above a visible floor slice");
    assert.strictEqual(state.levels[0].message, "level 1 of 3");
    assert.strictEqual(state.levels[6].message, "congratulations!");
    assert(source.includes("Background\ntransparent"), "Microban 3D should keep Background transparent");
    assert(
        !source.includes("Background\ntransparent\n....."),
        "Microban 3D should not give Background explicit sprite ASCII"
    );
    assert(source.includes(". = Background"), "Microban 3D should keep dot as the empty-cell carrier");
    assert(source.includes("f = Floor"), "Microban 3D should use an explicit Floor glyph for visible floor cells");
    assert(source.includes("T = Floor and Target"), "Microban 3D should keep visible target markers on the floor slice");
    assert(source.includes("G = Goal"), "Microban 3D should use invisible semantic Goal markers on the solid slice");
    assert(source.includes("* = Box and Goal"), "Microban 3D should encode initial target occupancy without mixing Floor into solid glyphs");
    assert.notStrictEqual(state.objects.floor.layer, state.objects.background.layer);
    assert.notStrictEqual(state.objects.target.layer, state.objects.floor.layer);
    assert.notStrictEqual(state.objects.goal.layer, state.objects.target.layer);
    assert.strictEqual(sprite3VisibleCellCount(state.objects.goal.sprite3matrix), 0);
    const level1Session = gameRuntime.createSessionFromState3D(state, { levelIndex: 1 });
    let goalCount = 0;
    let floorTargetCount = 0;
    let initiallyOccupiedGoalCount = 0;
    for (let index = 0; index < level1Session.runtime.board.cellCount; index++) {
        const cell = level1Session.runtime.board.getCell(index);
        if (maskHasObject(cell, state.objects.goal.id)) {
            goalCount++;
            assert.strictEqual(ThreeDimensionLevels.indexToCoord3(index, level1Session.runtime.board).y, 0);
            if (maskHasObject(cell, state.objects.box.id))
                initiallyOccupiedGoalCount++;
        }
        if (maskHasObject(cell, state.objects.target.id)) {
            floorTargetCount++;
            assert.strictEqual(ThreeDimensionLevels.indexToCoord3(index, level1Session.runtime.board).y, 1);
        }
    }
    assert.strictEqual(goalCount, 2);
    assert.strictEqual(floorTargetCount, 2);
    assert.strictEqual(initiallyOccupiedGoalCount, 1);
    assert(state.objects.box.sprite3matrix, "box should use a sliced 3D sprite");
    assert.strictEqual(state.objects.box.sprite3matrix[0][0].length, state.sprite_size);
    for (const name of Object.keys(state.objects)) {
        const object = state.objects[name];
        assert.strictEqual(
            sprite3Depth(object.sprite3matrix),
            state.sprite_size,
            `Microban 3D object "${name}" should use sprite_size slices`
        );
    }
    assert(state.rules3d.groups[0].some(rule => rule.direction === "front"));
}

function test3DDemoFixturesUseExplicitFloorLayer() {
    const fixturePaths = [
        "../src/demo/3d microban.txt"
    ];

    for (const fixturePath of fixturePaths) {
        const { compiler, errors } = loadCompilerForE2ETest();
        const source = fs.readFileSync(path.join(__dirname, fixturePath), "utf8");
        const state = compiler.loadFile(source);

        assert.deepStrictEqual(errors, [], `${fixturePath} should compile without errors`);
        assert(state.objects.background, `${fixturePath} should keep semantic Background`);
        assert(state.objects.floor, `${fixturePath} should define explicit visual Floor`);
        assert.notStrictEqual(
            state.objects.background.layer,
            state.objects.floor.layer,
            `${fixturePath} should not use Background as the visible floor layer`
        );
    }
}

function loadCompilerForE2ETest() {
    const errors = [];

    global.ThreeDimensionLevels = ThreeDimensionLevels;
    global.debugSwitch = "";
    global.debugMode = false;
    global.defaultDebugMode = false;
    global.defaultVerboseLogging = false;
    global.verbose_logging = false;
    global.throttle_movement = false;
    global.cache_console_messages = false;
    global.IDE = false;
    global.unitTesting = true;
    global.canSetHTMLColors = false;
    global.MOV_BITS = 0;
    global.MOV_MASK = 0;
    global.STRIDE_OBJ = 0;
    global.STRIDE_MOV = 0;
    global.colorPalettes = {
        arnecolors: {
            black: "#000000",
            white: "#ffffff",
            gray: "#555555",
            darkgray: "#555555",
            yellow: "#ffff55",
            orange: "#ff5500",
            green: "#55aa00",
            lightgreen: "#aaffaa",
            darkblue: "#0000aa",
            blue: "#5555ff",
            brown: "#aa5500",
            darkbrown: "#663300"
        }
    };
    global.colorPalettesAliases = {};
    global.wordwrap = text => [text];
    global.deepClone = value => JSON.parse(JSON.stringify(value));
    global.applyTransforms = () => {};
    global.reg_commandwords = /^(afx[\w:=+-.]+|sfx\d+|cancel|checkpoint|restart|win|message|again|undo|nosave|quit|zoomscreen|flickscreen|smoothscreen|again_interval|realtime_interval|key_repeat_interval|noundo|norestart|background_color|text_color|goto|message_text_align|status|gosub|link|log|color_palette)$/i;
    global.commandargs_table = ["message", "goto", "status", "gosub", "log"];
    global.soundverbs_directional = ["move", "cantmove"];
    global.soundverbs_movement = ["action"];
    global.soundverbs_other = ["create", "destroy"];
    global.twiddleable_params = [
        "background_color", "text_color", "key_repeat_interval", "realtime_interval", "again_interval",
        "flickscreen", "zoomscreen", "smoothscreen", "noundo", "norestart", "message_text_align", "color_palette"
    ];
    global.consolePrint = () => {};
    global.consoleError = message => errors.push({ message, lineNumber: null });
    global.logWarning = () => {};
    global.logWarningNoLine = () => {};
    global.wordAlreadyDeclared = (state, name) => state.names.includes(name)
        || Object.prototype.hasOwnProperty.call(state.objects, name)
        || state.legend_synonyms.some(entry => entry[0] === name)
        || state.legend_properties.some(entry => entry[0] === name)
        || state.legend_aggregates.some(entry => entry[0] === name);
    global.getObjectRefs = (state, name) => {
        if (Object.prototype.hasOwnProperty.call(state.objects, name))
            return [name];
        const synonym = state.legend_synonyms.find(entry => entry[0] === name);
        return synonym ? [synonym[1]] : null;
    };
    global.getObjectUndefs = (state, name) => global.getObjectRefs(state, name) ? [] : [name];
    global.createObjectRef = () => false;
    global.BitVec = TestBitVec;
    global.Level = TestLevel;
    global.CellPattern = TestCellPattern;
    global.CellReplacement = TestCellReplacement;
    global.Rule = TestRule;
    global.ellipsisPattern = {};

    global.logError = (message, lineNumber) => errors.push({ message, lineNumber });
    global.logErrorNoLine = message => errors.push({ message, lineNumber: null });

    global.window = {
        CodeMirror: {
            defineMode: (_name, modeFactory) => {
                global.__puzzleModeFactory = modeFactory;
                global.codeMirrorFn = modeFactory;
            },
            StringStream: TestStringStream
        }
    };
    global.CodeMirror = global.window.CodeMirror;

    delete require.cache[require.resolve("../src/js/parser3d.js")];
    require("../src/js/parser3d.js");
    assert(global.codeMirrorFn, "parser3d.js did not expose a CodeMirror mode factory");

    delete require.cache[require.resolve("../src/js/compiler3d.js")];
    const compiler = require("../src/js/compiler3d.js");
    return { compiler, errors };
}

function sprite3Depth(matrix) {
    let depth = 0;
    for (const row of matrix || []) {
        for (const col of row || []) {
            if (Array.isArray(col))
                depth = Math.max(depth, col.length);
        }
    }
    return depth;
}

function maskHasObject(mask, id) {
    return !!(mask[id >> 5] & (1 << (id & 31)));
}

function sprite3VisibleCellCount(matrix) {
    let count = 0;
    for (const row of matrix || []) {
        for (const col of row || []) {
            for (const value of col || []) {
                if (value >= 0)
                    count++;
            }
        }
    }
    return count;
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

function TestLevel() {}

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

class TestStringStream {
    constructor(string) {
        this.string = string;
        this.pos = 0;
        this.start = 0;
        this.lineStart = 0;
        this.guardCount = 0;
    }

    sol() {
        this.guard();
        return this.pos === 0;
    }

    eol() {
        this.guard();
        return this.pos >= this.string.length;
    }

    eatWhile(regex) {
        this.guard();
        while (!this.eol() && regex.test(this.string[this.pos]))
            this.pos++;
    }

    eatSpace() {
        this.eatWhile(/[ \t]/);
    }

    peek() {
        this.guard();
        return this.string[this.pos];
    }

    next() {
        this.guard();
        return this.string[this.pos++];
    }

    match(pattern, shouldConsume) {
        this.guard();
        shouldConsume = shouldConsume !== false;
        const rest = this.string.slice(this.pos);
        if (typeof pattern === "string") {
            const matched = rest.startsWith(pattern);
            if (matched && shouldConsume)
                this.pos += pattern.length;
            return matched;
        }

        const match = rest.match(pattern);
        if (!match || match.index !== 0)
            return null;
        if (match[0].length === 0)
            return null;
        if (shouldConsume)
            this.pos += match[0].length;
        return match;
    }

    skipToEnd() {
        this.guard();
        this.pos = this.string.length;
    }

    guard() {
        this.guardCount++;
        assert(this.guardCount < 1000, `StringStream stalled on line: ${this.string}`);
    }
}

testPuzzleScriptTextCompilesAndRunsOne3DTurnWithoutRendering();
testPuzzleScriptTextCompiles3DObjectSpriteRowsLikeStacked2DSprites();
testPuzzleScriptTextUsesSpriteSizeFor3DWidthHeightAndSliceCountForDepth();
testPuzzleScriptTextUsesSpriteSizeForOmitted3DSpriteAscii();
testPuzzleScriptTextUsesSpriteSizeSevenFor3DRenderContract();
testPuzzleScriptTextCompiles3DSpriteAlphaAndTransparentDots();
testPuzzleScriptTextCompiles3DCameraPreludeLikeExistingPreludeMetadata();
testPuzzleScriptTextRejectsCameraDistanceAs3DCameraPrelude();
testPuzzleScriptTextCompilesAndRunsLate3DLike2DPhase();
testPuzzleScriptTextCompilesAndQueues3DCommandsLike2D();
testPuzzleScriptTextCompilesAndAppliesWinConditions3DLike2D();
testPuzzleScriptTextCompilesAndAppliesGlobal3DLike2D();
testPuzzleScriptTextCompilesAndRunsStartLoop3DLike2D();
testPuzzleScriptTextCompilesAndRunsGosub3DLike2D();
testPuzzleScriptTextCompilesAndRunsEllipsis3DLike2D();
testPuzzleScriptTextCompilesAndAppliesRandomObject3DLike2D();
testPuzzleScriptTextCompilesAndAppliesRandomRuleGroup3DLike2D();
testPuzzleScriptTextCompilesAndAppliesRandomDir3DWithSixDirections();
testPuzzleScriptTextCompilesAndRollsBackRigid3DLike2D();
testPuzzleScriptTextBansMultipleRigidGroupsBeforeFallback3D();
testPuzzleScriptTextCompilesAndReturnsCreateDestroySfxArtifacts3D();
testPuzzleScriptTextCompilesAndReturnsMovementSfxArtifacts3D();
testPuzzleScriptTextCompilesAndReturnsCantMoveSfxArtifacts3D();
testPuzzleScriptTextCompilesRelativePushCarrierForFront3D();
testMicroban3DFixtureCompilesWith3DSpritesAndLevels();
test3DDemoFixturesUseExplicitFloorLayer();

console.log("3d e2e tests passed");
