const assert = require("assert");
const fs = require("fs");
const path = require("path");

const gameRuntime = require("../src/js/game_runtime3d.js");
const renderFrameContract = require("../src/js/render_frame_contract3d.js");
const renderFrame = require("../src/js/render_frame3d.js");
const tweenSemantics = require("../src/js/tween_semantics.js");
const threeRenderer = require("../src/js/three_renderer3d.js");

function testRenderFrameHasExplicitRendererAgnosticSchema() {
    const state = makeState();
    state.source = "this must not leak into the render contract";
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.model, "psnext-grid3");
    assert.strictEqual(frame.schemaVersion, 1);
    assert.deepStrictEqual(Object.keys(frame).sort(), [
        "cells",
        "drawPlan",
        "effects",
        "levelName",
        "model",
        "objects",
        "schemaVersion",
        "session",
        "size",
        "spriteGrid",
        "view"
    ]);
    assert(!Object.prototype.hasOwnProperty.call(frame, "source"));
    assert(!Object.prototype.hasOwnProperty.call(frame, "state"));
    assert(!Object.prototype.hasOwnProperty.call(frame, "runtime"));
    assert.deepStrictEqual(frame.view, {
        projection: "perspective",
        yaw: 0,
        pitch: 90,
        cameraZoom: 1,
        cameraViewAngle: 35,
        backgroundColor: "#000000",
        shade: true,
        visibility: "all",
        slice: null,
        cameraCenter: null,
        visibleRegion: null,
        renderRegion: null
    });
    assert.deepStrictEqual(frame.effects.tween, defaultTweenEffect());
    assert.strictEqual(renderFrame.validateRenderFrame3D(frame), frame);
    assert.strictEqual(renderFrameContract.validateRenderFrame3D(frame), frame);
}

function testRenderFrameUsesCompiledObjectMetadataAndBoardCells() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.model, "psnext-grid3");
    assert.deepStrictEqual(frame.size, {
        width: 2,
        height: 1,
        depth: 1,
        layerCount: 2,
        renderCellCount: 2
    });
    assert.strictEqual(frame.objects[0].name, "background");
    assert.strictEqual(frame.objects[0].layer, 0);
    assert.strictEqual(frame.objects[0].visual.kind, "spritematrix");
    assert.strictEqual(frame.objects[1].name, "player");
    assert.strictEqual(frame.objects[1].layer, 1);
    assert.deepStrictEqual(frame.cells.map(cell => cell.objectIds), [[0, 1], [0]]);
}

function testRenderFramePreservesPuzzleScriptNextDrawGroups() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.deepStrictEqual(frame.drawPlan.objectGroups, [
        { firstObjectId: 0, objectCount: 1 },
        { firstObjectId: 1, objectCount: 1 }
    ]);
    assert.deepStrictEqual(frame.drawPlan.cellOrder, [0, 1]);
}

function testThreeRendererBuildsInstanceGroupsFromRenderFrameOnly() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = JSON.parse(JSON.stringify(renderFrame.buildRenderFrame3D(runtime, state)));
    const instanceGroups = threeRenderer.buildInstances(frame);

    assert.strictEqual(
        instanceGroups.reduce((sum, group) => sum + group.items.length, 0),
        3
    );
    assert(instanceGroups.some(group => group.alpha === 1 && group.scale.y === 0.08), "compiled background layer should use floor geometry without implicit translucency");
    assert(instanceGroups.some(group => group.alpha === 1 && group.scale.y === 1), "foreground object should be opaque geometry");
}

function testThreeRendererRejectsNonFrameInputsBeforeTheyBecomeImplicitRuntimeAccess() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    const frameWithCompilerStateLeak = Object.assign({}, frame, { state });
    assert.throws(
        () => threeRenderer.buildInstances(frameWithCompilerStateLeak),
        /unexpected field state/
    );

    const frameWithImplicitCellFallback = Object.assign({}, frame, {
        drawPlan: Object.assign({}, frame.drawPlan, { cellOrder: frame.drawPlan.cellOrder.slice(0, 1) })
    });
    assert.throws(
        () => threeRenderer.buildInstances(frameWithImplicitCellFallback),
        /cellOrder must cover every render cell/
    );

    const frameWithRuntimeCellLeak = Object.assign({}, frame, {
        cells: frame.cells.concat([{ index: 2, x: 2, y: 0, z: 0, objectIds: [] }])
    });
    assert.throws(
        () => threeRenderer.buildInstances(frameWithRuntimeCellLeak),
        /cells length must equal/
    );
}

function testThreeRendererRejectsImplicitLayerPresentationFallback() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = JSON.parse(JSON.stringify(renderFrame.buildRenderFrame3D(runtime, state)));
    delete frame.objects[1].visual.presentation;

    assert.throws(
        () => threeRenderer.buildInstances(frame),
        /requires explicit supported visual presentation/
    );
}

function testRenderFrameLowersCameraPreludeMetadataToViewContract() {
    const state = makeState();
    state.metadata.perspective_camera = true;
    state.metadata.camera_angle = { yaw: 25, pitch: 40 };
    state.metadata.camera_view_angle = 50;
    state.metadata.camera_zoom = 1.25;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.deepStrictEqual(frame.view, {
        projection: "perspective",
        yaw: 25,
        pitch: 40,
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
    assert.strictEqual(frame.view.visibility, "all");
    assert.strictEqual(renderFrameContract.validateRenderFrame3D(frame), frame);
}

function testRenderFrameCarriesPuzzleScriptBackgroundColorToView() {
    const state = makeState();
    state.metadata.background_color = "white";
    state.bgcolor = "#123456";
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.view.backgroundColor, "#123456");
    assert.strictEqual(renderFrameContract.validateRenderFrame3D(frame), frame);

    delete state.bgcolor;
    const metadataFrame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(metadataFrame.view.backgroundColor, "#ffffff");
    assert.strictEqual(renderFrameContract.validateRenderFrame3D(metadataFrame), metadataFrame);
}

function testRenderFrameUses2DColorToHexForObjectColors() {
    const calls = [];
    const renderFrameApi = loadRenderFrameWithWindow({
        colorToHex(palette, color) {
            calls.push({ palette, color });
            return {
                black: "#000000",
                darkblue: "#1B2632"
            }[color] || color;
        }
    });
    const state = makeState();
    state.metadata.color_palette.darkblue = "#0000ff";
    state.objects.player.colors = ["darkblue"];

    const objects = renderFrameApi.buildRenderObjects3D(state);

    assert.strictEqual(objects[1].visual.color, "#1B2632");
    assert(calls.some(call => call.color === "darkblue"), "3D object color lowering must delegate color names to the shared 2D colorToHex helper");
}

function testPerspectiveZoomChangesDerivedCameraDistanceWithoutFrameCarrier() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const baseFrame = renderFrame.buildRenderFrame3D(runtime, state);
    const frame = Object.assign({}, baseFrame, {
        view: Object.assign({}, baseFrame.view, {
            projection: "perspective",
            cameraViewAngle: 35,
            cameraZoom: 1
        })
    });
    const canvas = { clientWidth: 640, clientHeight: 480 };
    const normal = threeRenderer.buildCamera(fakeThree(), frame, canvas);
    const zoomed = threeRenderer.buildCamera(fakeThree(), Object.assign({}, frame, {
        view: Object.assign({}, frame.view, { cameraZoom: 2 })
    }), canvas);
    const wide = threeRenderer.buildCamera(fakeThree(), Object.assign({}, frame, {
        view: Object.assign({}, frame.view, { cameraViewAngle: 70 })
    }), canvas);

    assert(!Object.prototype.hasOwnProperty.call(frame.view, "cameraDistance"));
    assert(zoomed.distanceFromOrigin < normal.distanceFromOrigin);
    assert(wide.distanceFromOrigin < normal.distanceFromOrigin);
}

function testThreeRendererFitsCameraToProjectedBoardBounds() {
    const state = makeState();
    state.levels[0] = Object.assign({}, state.levels[0], {
        width: 8,
        height: 1,
        depth: 5,
        cellCount: 40,
        n_tiles: 40,
        objects: new Int32Array(40).fill(1)
    });
    state.levels[0].objects[0] = 3;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const camera = threeRenderer.buildCamera(fakeThree(), frame, { clientWidth: 966, clientHeight: 768 });

    assert(camera.distanceFromOrigin < 20, "camera should fit to projected board bounds rather than a padded max-side radius");
    assert(camera.distanceFromOrigin > 8, "camera should still leave a small fit margin around the board");
}

function testThreeRendererUsesHighQualityCanvasDefaults() {
    const canvas = { width: 640, height: 480 };
    const enabled = new threeRenderer.Puzzle3DThreeRenderer(canvas);
    enabled.ensureRenderer(fakeThreeRendererOnly(), canvas);
    const disabled = new threeRenderer.Puzzle3DThreeRenderer(canvas, { antialias: false });
    disabled.ensureRenderer(fakeThreeRendererOnly(), canvas);
    const renderer = {
        ratios: [],
        setPixelRatio(value) {
            this.ratios.push(value);
        }
    };

    assert.strictEqual(enabled.renderer.options.antialias, true);
    assert.strictEqual(disabled.renderer.options.antialias, false);
    assert.strictEqual(threeRenderer.rendererPixelRatio({ pixelRatio: 3, maxPixelRatio: 2 }), 2);
    assert.strictEqual(threeRenderer.rendererPixelRatio({ pixelRatio: 0.5, maxPixelRatio: 2 }), 1);
    threeRenderer.setRendererPixelRatio(renderer, { pixelRatio: 1.75, maxPixelRatio: 2 });
    assert.deepStrictEqual(renderer.ratios, [1.75]);
}

function testRenderToCanvasReusesRendererForCanvasLifecycle() {
    const stats = {
        rendererConstructs: 0,
        rendererDisposals: 0,
        geometryDisposals: 0,
        materialDisposals: 0,
        renders: 0
    };
    const windowObject = {
        THREE: fakeRenderableThree(stats),
        devicePixelRatio: 1
    };
    const rendererApi = loadThreeRendererWithWindow(windowObject);
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const canvas = { width: 640, height: 480, clientWidth: 640, clientHeight: 480 };

    rendererApi.renderToCanvas(canvas, frame, { tweenElapsedMs: 0 });
    const firstRenderer = windowObject.puzzle3DThreeRenderer;
    rendererApi.renderToCanvas(canvas, frame, { tweenElapsedMs: 16 });

    assert.strictEqual(stats.rendererConstructs, 1, "input redraws must reuse the canvas WebGL renderer");
    assert.strictEqual(stats.renders, 2);
    assert.strictEqual(windowObject.puzzle3DThreeRenderer, firstRenderer);
    assert(stats.geometryDisposals > 0, "old per-frame geometry should be disposed before replacing the scene");
    assert(stats.materialDisposals > 0, "old per-frame materials should be disposed before replacing the scene");
}

function testObliqueCameraUsesWorldUpCarrier() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const obliqueFrame = Object.assign({}, frame, {
        view: Object.assign({}, frame.view, { yaw: 35, pitch: 25 })
    });
    const camera = threeRenderer.buildCamera(fakeThree(), obliqueFrame, { clientWidth: 640, clientHeight: 480 });

    assert(camera.position.y > 0);
    assertVectorAlmost(camera.upVector, { x: 0, y: 1, z: 0 });
}

function testTopDownCameraUsesYawAsSingularityFallbackOnly() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const camera = threeRenderer.buildCamera(fakeThree(), frame, { clientWidth: 640, clientHeight: 480 });
    const rotatedFrame = Object.assign({}, frame, {
        view: Object.assign({}, frame.view, { yaw: 90, pitch: 90 })
    });
    const rotatedCamera = threeRenderer.buildCamera(fakeThree(), rotatedFrame, { clientWidth: 640, clientHeight: 480 });

    assert.deepStrictEqual(frame.view, Object.assign({}, frame.view, { yaw: 0, pitch: 90 }));
    assert(Math.abs(camera.position.x) < 1e-9);
    assert(camera.position.y > 0);
    assert(Math.abs(camera.position.z) < 1e-9);
    assertVectorAlmost(camera.upVector, { x: 0, y: 0, z: -1 });
    assertVectorAlmost(rotatedCamera.upVector, { x: -1, y: 0, z: 0 });
}

function testRenderFrameLowersOrthographicCameraPreludeAsExplicitOptOut() {
    const state = makeState();
    state.metadata.orthographic_camera = true;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.view.projection, "orthographic");
    assert.strictEqual(renderFrameContract.validateRenderFrame3D(frame), frame);
}

function testRendererUsesVisibleRegionProjectedFrom2DViewportCarrier() {
    const state = makeState();
    const cells = new Int32Array(12).fill(1);
    cells[0] = 3;
    cells[4] = 3;
    state.levels[0] = Object.assign({}, state.levels[0], {
        width: 4,
        height: 1,
        depth: 3,
        cellCount: 12,
        n_tiles: 12,
        objects: cells
    });
    const session = gameRuntime.createSessionFromState3D(state);
    session.oldflickscreendat = [1, 1, 3, 2];

    const frame = renderFrame.buildSessionRenderFrame3D(session);
    const instanceGroups = threeRenderer.buildInstances(frame);
    const foreground = foregroundItems(instanceGroups);

    assert.deepStrictEqual(frame.view.visibleRegion, { x: 1, z: 1, width: 2, depth: 1 });
    assert.deepStrictEqual(frame.view.renderRegion, { x: 0, z: 0, width: 4, depth: 3 });
    assert.strictEqual(
        instanceGroups.reduce((sum, group) => sum + group.items.length, 0),
        14
    );
    assert(foreground.some(item => item.x === -0.5 && item.z === 0), "visible-region foreground should still be rendered around the logical screen");
    assert(foreground.some(item => item.x === -1.5 && item.z === -1), "off-screen foreground should remain renderable because an angled 3D camera may see it");
}

function testExplicitRenderRegionControlsCullingWithoutChangingLogicalScreen() {
    const state = makeState();
    const cells = new Int32Array(25).fill(1);
    cells[0] = 3;
    cells[6] = 3;
    cells[12] = 3;
    cells[18] = 3;
    cells[24] = 3;
    state.metadata.smoothscreen = {
        screenSize: { width: 3, height: 3 },
        boundarySize: { width: 3, height: 3 },
        cameraSpeed: 0.125
    };
    state.levels[0] = Object.assign({}, state.levels[0], {
        width: 5,
        height: 1,
        depth: 5,
        cellCount: 25,
        n_tiles: 25,
        objects: cells
    });
    const session = gameRuntime.createSessionFromState3D(state);
    session.oldflickscreendat = [1, 1, 4, 4];

    const defaultFrame = renderFrame.buildSessionRenderFrame3D(session);
    const clippedFrame = renderFrame.buildSessionRenderFrame3D(session, {
        view: {
            renderRegion: { x: 1, z: 1, width: 3, depth: 3 }
        }
    });
    const defaultGroups = threeRenderer.buildInstances(defaultFrame);
    const clippedGroups = threeRenderer.buildInstances(clippedFrame);

    assert.deepStrictEqual(defaultFrame.view.visibleRegion, { x: 1, z: 1, width: 3, depth: 3 });
    assert.deepStrictEqual(defaultFrame.view.renderRegion, { x: 0, z: 0, width: 5, depth: 5 });
    assert.deepStrictEqual(clippedFrame.view.visibleRegion, { x: 1, z: 1, width: 3, depth: 3 });
    assert.deepStrictEqual(clippedFrame.view.renderRegion, { x: 1, z: 1, width: 3, depth: 3 });
    assert.strictEqual(
        defaultGroups.reduce((sum, group) => sum + group.items.length, 0),
        30
    );
    assert.strictEqual(
        clippedGroups.reduce((sum, group) => sum + group.items.length, 0),
        12
    );
}

function testSmoothScreenCameraCenterStaysSeparateFromIntegerVisibleRegion() {
    const state = makeState();
    state.metadata.smoothscreen = {
        screenSize: { width: 3, height: 3 },
        boundarySize: { width: 1, height: 1 },
        cameraSpeed: 0.125
    };
    state.levels[0] = Object.assign({}, state.levels[0], {
        width: 5,
        height: 1,
        depth: 5,
        cellCount: 25,
        n_tiles: 25,
        objects: new Int32Array(25).fill(1)
    });
    const session = gameRuntime.createSessionFromState3D(state);
    session.oldflickscreendat = [1, 1, 4, 4];

    const frame = renderFrame.buildSessionRenderFrame3D(session, {
        view: {
            cameraCenter: { x: 2.25, z: 2.5 }
        }
    });

    assert.deepStrictEqual(frame.view.visibleRegion, { x: 1, z: 1, width: 3, depth: 3 });
    assert.deepStrictEqual(frame.view.cameraCenter, { x: 2.25, z: 2.5 });
}

function testThreeRendererPositionsCellsAgainstSmoothCameraCenter() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state, {
        view: {
            cameraCenter: { x: 0.25, z: 0 }
        }
    });

    const item = foregroundItem(threeRenderer.buildInstances(frame));

    assert.strictEqual(item.x, -0.25);
    assert.strictEqual(item.z, 0);
}

function testCameraDerivedRenderRegionAvoidsFullBoardScanOnLargeWorlds() {
    const state = makeState();
    state.metadata.camera_angle = { yaw: 35, pitch: 60 };
    const board = {
        width: 5000,
        height: 1,
        depth: 5000,
        layerCount: 2,
        objectCount: 2,
        cellCount: 5000 * 5000,
        coordToIndex(x, y, z) {
            return x * this.height * this.depth + y * this.depth + z;
        },
        getCell() {
            return new Int32Array([1]);
        }
    };

    const frame = renderFrame.buildRenderFrame3D({ board }, state, {
        view: {
            visibleRegion: { x: 2490, z: 2492, width: 20, depth: 15 },
            viewportAspect: 16 / 9
        }
    });

    assert(frame.view.renderRegion.width > frame.view.visibleRegion.width);
    assert(frame.view.renderRegion.depth > frame.view.visibleRegion.depth);
    assert(frame.view.renderRegion.width < board.width);
    assert(frame.view.renderRegion.depth < board.depth);
    assert.strictEqual(frame.size.renderCellCount, frame.view.renderRegion.width * frame.view.renderRegion.depth * board.height);
    assert.strictEqual(frame.cells.length, frame.size.renderCellCount);
    assert.strictEqual(frame.drawPlan.cellOrder.length, frame.size.renderCellCount);
    assert(frame.size.renderCellCount < board.cellCount / 1000, "candidate render cells should be derived from the camera footprint, not the whole board");
}

function testRenderFrameRejectsMalformedViewContract() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.throws(
        () => renderFrameContract.validateRenderFrame3D(Object.assign({}, frame, {
            view: Object.assign({}, frame.view, { projection: "fisheye" })
        })),
        /view\.projection/
    );
    assert.throws(
        () => renderFrameContract.validateRenderFrame3D(Object.assign({}, frame, {
            view: Object.assign({}, frame.view, { visibility: "all", slice: { axis: "y", index: 0 } })
        })),
        /view\.slice must be null/
    );
}

function testThreeRendererUsesFullCellSpritesWithoutImplicitPadding() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame);
    const foreground = instanceGroups.find(group => group.scale.y === 1);
    const background = instanceGroups.find(group => group.scale.y === 0.08);

    assert.deepStrictEqual(foreground.scale, { x: 1, y: 1, z: 1 });
    assert.deepStrictEqual(background.scale, { x: 1, y: 0.08, z: 1 });
}

function testThreeRendererKeepsOverlappingSolidsOnCellY() {
    const state = makeState();
    state.playerMask = new Int32Array([6]);
    state.layerMasks = [new Int32Array([1]), new Int32Array([2]), new Int32Array([4])];
    state.objectCount = 3;
    state.idDict = ["background", "crate", "player"];
    state.objects.crate = {
        id: 1,
        layer: 1,
        colors: ["white"],
        spritematrix: [[0]],
        spriteoffset: { x: 0, y: 0 }
    };
    state.objects.player.id = 2;
    state.objects.player.layer = 2;
    state.collisionLayers = [["background"], ["crate"], ["player"]];
    state.collisionLayerGroups = [
        { firstObjectNo: 0, numObjects: 1 },
        { firstObjectNo: 1, numObjects: 1 },
        { firstObjectNo: 2, numObjects: 1 }
    ];
    state.levels[0].layerCount = 3;
    state.levels[0].objects = new Int32Array([7, 1]);
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const solidItems = threeRenderer.buildInstances(frame)
        .filter(group => group.scale.y === 1)
        .flatMap(group => group.items);

    assert.strictEqual(solidItems.length, 2);
    assert.strictEqual(solidItems[0].y, solidItems[1].y);
}

function testThreeRendererSceneAdapterPreservesAsciiAxisContract() {
    const frame = {
        size: { width: 2, height: 2, depth: 2 }
    };
    const sceneA = threeRenderer.boardCellToScenePosition(frame, { x: 0, y: 0, z: 0 }, null);
    const sceneB = threeRenderer.boardCellToScenePosition(frame, { x: 1, y: 0, z: 0 }, null);
    const sceneC = threeRenderer.boardCellToScenePosition(frame, { x: 0, y: 0, z: 1 }, null);
    const sceneE = threeRenderer.boardCellToScenePosition(frame, { x: 0, y: 1, z: 0 }, null);

    assert.strictEqual(sceneB.x - sceneA.x, 1);
    assert.strictEqual(sceneB.y - sceneA.y, 0);
    assert.strictEqual(sceneB.z - sceneA.z, 0);
    assert.strictEqual(sceneC.x - sceneA.x, 0);
    assert.strictEqual(sceneC.y - sceneA.y, 0);
    assert.strictEqual(sceneC.z - sceneA.z, 1);
    assert.strictEqual(sceneE.x - sceneA.x, 0);
    assert.strictEqual(sceneE.y - sceneA.y, -1);
    assert.strictEqual(sceneE.z - sceneA.z, 0);
}

function testThreeRendererDefaultCameraProjectsBoardRightAndFrontWithInputCarriers() {
    const frame = {
        size: { width: 2, height: 2, depth: 2 }
    };
    const sceneA = threeRenderer.boardCellToScenePosition(frame, { x: 0, y: 0, z: 0 }, null);
    const sceneB = threeRenderer.boardCellToScenePosition(frame, { x: 1, y: 0, z: 0 }, null);
    const sceneC = threeRenderer.boardCellToScenePosition(frame, { x: 0, y: 0, z: 1 }, null);
    const basis = cameraBasis(threeRenderer.cameraVectorFromYawPitch(35, 25));
    const rightProjection = projectSubtract(sceneB, sceneA, basis);
    const backProjection = projectSubtract(sceneC, sceneA, basis);

    assert(rightProjection.x > 0, "A->B/right should project toward screen right");
    assert(backProjection.y < 0, "A->C/back should project away from the ArrowUp/front carrier");
}

function testRenderFrameUsesCompiledBackgroundLayerForFloorPresentation() {
    const state = makeState();
    state.playerMask = new Int32Array([4]);
    state.layerMasks = [new Int32Array([1]), new Int32Array([2]), new Int32Array([4])];
    state.objectCount = 3;
    state.idDict = ["background", "target", "player"];
    state.objects.target = {
        id: 1,
        layer: 1,
        colors: ["white"],
        spritematrix: [[0]],
        spriteoffset: { x: 0, y: 0 }
    };
    state.objects.player.id = 2;
    state.objects.player.layer = 2;
    state.collisionLayers = [["background"], ["target"], ["player"]];
    state.collisionLayerGroups = [
        { firstObjectNo: 0, numObjects: 1 },
        { firstObjectNo: 1, numObjects: 1 },
        { firstObjectNo: 2, numObjects: 1 }
    ];
    state.levels[0].layerCount = 3;
    state.levels[0].objects = new Int32Array([7, 1]);
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame);

    assert.strictEqual(frame.objects[0].visual.presentation, "floor");
    assert.strictEqual(frame.objects[1].visual.presentation, "solid");
    assert.strictEqual(frame.objects[2].visual.presentation, "solid");
    assert(instanceGroups.some(group => group.alpha === 1
        && group.scale.x === 1
        && group.scale.y === 0.08
        && group.scale.z === 1), "compiled background layer objects should render as floor surfaces");
}

function testRenderFrameUsesCompiledBackgroundLayerRatherThanLayerZero() {
    const state = makeState();
    state.backgroundlayer = 1;
    state.objects.background.layer = 1;
    state.objects.player.layer = 0;
    state.collisionLayers = [["player"], ["background"]];
    state.collisionLayerGroups = [
        { firstObjectNo: 1, numObjects: 1 },
        { firstObjectNo: 0, numObjects: 1 }
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.objects[0].visual.presentation, "floor");
    assert.strictEqual(frame.objects[1].visual.presentation, "solid");
}

function testRenderFrameKeepsNonBackgroundFloorNamedObjectsSolid() {
    const state = makeState();
    state.playerMask = new Int32Array([8]);
    state.layerMasks = [new Int32Array([1]), new Int32Array([6]), new Int32Array([8])];
    state.objectCount = 4;
    state.idDict = ["background", "floor", "target", "player"];
    state.objects.floor = {
        id: 1,
        layer: 1,
        colors: ["white"],
        spritematrix: [[0]],
        spriteoffset: { x: 0, y: 0 }
    };
    state.objects.target = {
        id: 2,
        layer: 1,
        colors: ["white"],
        spritematrix: [[0]],
        spriteoffset: { x: 0, y: 0 }
    };
    state.objects.player.id = 3;
    state.objects.player.layer = 2;
    state.collisionLayers = [["background"], ["floor", "target"], ["player"]];
    state.collisionLayerGroups = [
        { firstObjectNo: 0, numObjects: 1 },
        { firstObjectNo: 1, numObjects: 2 },
        { firstObjectNo: 3, numObjects: 1 }
    ];
    state.levels[0].layerCount = 3;
    state.levels[0].objects = new Int32Array([15, 3]);
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.objects[0].visual.presentation, "floor");
    assert.strictEqual(frame.objects[1].visual.presentation, "solid");
    assert.strictEqual(frame.objects[2].visual.presentation, "solid");
    assert.strictEqual(frame.objects[3].visual.presentation, "solid");
}

function testThreeRendererRequiresThreeInsteadOfCanvasFallback() {
    const state = makeState();
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const canvas = {
        width: 640,
        height: 480,
        getContext: () => {
            throw new Error("2D canvas fallback must not be used");
        }
    };
    const renderer = new threeRenderer.Puzzle3DThreeRenderer(canvas);

    assert.throws(
        () => renderer.render(frame),
        /requires Three\.js/
    );
}

function testRenderFrameProjects2DSpriteMatrixUsing2DSpriteRules() {
    const state = makeState();
    state.objects.player.colors = ["#111111", "#eeeeee", "transparent"];
    state.objects.player.spritematrix = [
        [0, -1, 1],
        [2, 1]
    ];
    state.objects.player.spriteoffset = { x: 1, y: -1 };
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const visual = frame.objects[1].visual;

    assert.strictEqual(visual.kind, "spritematrix");
    assert.deepStrictEqual(visual.offset, { x: 1, y: -1 });
    assert.deepStrictEqual(visual.voxels.size, { width: 3, height: 1, depth: 2 });
    assert.deepStrictEqual(visual.voxels.cells, [
        { col: 0, row: 0, slice: 0, color: "#111111" },
        { col: 2, row: 0, slice: 0, color: "#eeeeee" },
        { col: 1, row: 1, slice: 0, color: "#eeeeee" }
    ]);
}

function testRenderFrameKeepsSpriteDotsAsNoVoxels() {
    const state = makeState();
    state.objects.player.colors = ["#123456"];
    state.objects.player.sprite3matrix = [
        [[-1, -1], [-1, -1]],
        [[-1, -1], [-1, -1]]
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame);

    assert.deepStrictEqual(frame.objects[1].visual.voxels.cells, []);
    assert(!instanceGroups.some(group => group.color === "#123456"), "empty sprite voxels must not fall back to a solid fill");
}

function testRenderFrameCarriesHexAlphaIntoSpriteVoxels() {
    const state = makeState();
    state.objects.player.colors = ["#00000033", "#1234", "#12345600"];
    state.objects.player.sprite3matrix = [
        [[0], [1], [2]]
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const visual = frame.objects[1].visual;

    assert.deepStrictEqual(visual.voxels.cells, [
        { col: 0, row: 0, slice: 0, color: "#000000", alpha: 0x33 / 255 },
        { col: 1, row: 0, slice: 0, color: "#123", alpha: 0x44 / 255 }
    ]);
}

function testThreeRendererBuilds2DSpriteMatrixVoxelsWithoutPadding() {
    const state = makeState();
    state.objects.player.colors = ["#111111", "#eeeeee"];
    state.objects.player.spritematrix = [
        [0, -1],
        [1, 0]
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame);
    const foregroundCount = instanceGroups
        .filter(group => group.alpha === 1 && group.scale.y !== 0.08)
        .reduce((sum, group) => sum + group.items.length, 0);

    assert.strictEqual(foregroundCount, 3);
    assert(instanceGroups.some(group => {
        return group.alpha === 1
            && group.scale.x === 0.5
            && group.scale.y === 0.5
            && group.scale.z === 0.5;
    }), "2D sprite pixels should fill the cell span without implicit padding");
}

function testThreeRendererMergesContiguousSpriteVoxelsBeforeInstancing() {
    const state = makeState();
    state.objects.player.colors = ["#111111"];
    state.objects.player.sprite3matrix = [
        [[0, 0], [0, 0]],
        [[0, 0], [0, 0]]
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame);
    const mergedPlayer = instanceGroups.find(group => group.color === "#111111" && group.alpha === 1);

    assert(mergedPlayer, "expected one visible player voxel group");
    assert.strictEqual(mergedPlayer.items.length, 1);
    assert.deepStrictEqual(mergedPlayer.scale, { x: 1, y: 1, z: 1 });
}

function testThreeRendererVoxelMeshDrawsOnlyExposedFaces() {
    const state = makeState();
    state.objects.player.colors = ["#111111"];
    state.objects.player.sprite3matrix = [
        [[0, 0], [0, 0]],
        [[0, 0], [0, 0]]
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame, { voxelMesh: true });
    const playerMesh = instanceGroups.find(group => group.kind === "faces" && group.color === "#111111");

    assert(playerMesh, "expected player voxel mesh faces");
    assert.strictEqual(playerMesh.faces.length, 24);
    assert(!playerMesh.scale, "voxel mesh should not render as independent box instances");
}

function testThreeRendererVoxelMeshCullsInternalFacesAcrossCells() {
    const state = makeState();
    state.objects.player.colors = ["#111111"];
    state.levels[0].objects = new Int32Array([3, 3]);
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const instanceGroups = threeRenderer.buildInstances(frame, { voxelMesh: true });
    const playerMesh = instanceGroups.find(group => group.kind === "faces" && group.color === "#111111");

    assert(playerMesh, "expected player voxel mesh faces");
    assert.strictEqual(playerMesh.faces.length, 10);
}

function testThreeRendererVoxelMeshCullsInternalFacesAcrossFiveByFiveCellsOnXAndZ() {
    const xState = makeState();
    xState.objects.player.colors = ["#111111"];
    xState.objects.player.sprite3matrix = fullSprite3Matrix(5, 5, 5, 0);
    xState.levels[0] = Object.assign({}, xState.levels[0], {
        width: 2,
        height: 1,
        depth: 1,
        cellCount: 2,
        n_tiles: 2,
        objects: new Int32Array([3, 3])
    });
    const zState = makeState();
    zState.objects.player.colors = ["#111111"];
    zState.objects.player.sprite3matrix = fullSprite3Matrix(5, 5, 5, 0);
    zState.levels[0] = Object.assign({}, zState.levels[0], {
        width: 1,
        height: 1,
        depth: 2,
        cellCount: 2,
        n_tiles: 2,
        objects: new Int32Array([3, 3])
    });

    const xFaces = faceCountForColor(xState, "#111111");
    const zFaces = faceCountForColor(zState, "#111111");

    assert.strictEqual(xFaces, 250);
    assert.strictEqual(zFaces, 250);
}

function testThreeRendererVoxelMeshCullsFacesFromEachFaceCenterToPerspectiveCamera() {
    const state = makeState();
    state.metadata.camera_angle = { yaw: 0, pitch: 60 };
    state.objects.player.colors = ["#111111"];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const camera = threeRenderer.buildCamera(fakeThree(), frame, { clientWidth: 640, clientHeight: 480 });
    const mesh = threeRenderer.buildInstances(frame, {
        voxelMesh: true,
        cameraPosition: camera.position
    }).find(group => group.kind === "faces" && group.color === "#111111");
    const normals = mesh.faces.map(face => [face.normal.x, face.normal.y, face.normal.z].join(","));

    assert(normals.includes("0,1,0"), "top face should face the elevated camera");
    assert(normals.includes("0,0,1"), "back-facing screen side should face yaw 0 camera");
    assert(!normals.includes("0,0,-1"), "opposite z face should be culled from its own face center");
}

function testThreeRendererLeavesOpaqueGeometryDepthOrdered() {
    const source = fs.readFileSync(path.join(__dirname, "../src/js/three_renderer3d.js"), "utf8");

    assert(!source.includes("polygonOffset"), "3D opaque geometry should not be depth-biased by layer order");
    assert(!source.includes("mesh.renderOrder ="), "3D opaque geometry should use depth buffer, not layer renderOrder");
}

function testRenderFrameBuildsVoxelVisualsFromObjectOwnedSprite3D() {
    const state = makeState();
    state.objects.player.colors = ["#111111", "#eeeeee"];
    state.objects.player.sprite3matrix = [
        [[0, -1], [-1, 1]],
        [[-1, -1], [-1, -1]]
    ];
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const visual = frame.objects[1].visual;

    assert.strictEqual(visual.kind, "sprite3matrix");
    assert.deepStrictEqual(frame.spriteGrid, { width: 5, height: 5, depth: 5 });
    assert.deepStrictEqual(visual.voxels.size, { width: 2, height: 2, depth: 2 });
    assert.deepStrictEqual(visual.voxels.cells, [
        { col: 0, row: 0, slice: 0, color: "#111111" },
        { col: 1, row: 0, slice: 1, color: "#eeeeee" }
    ]);
}

function testRenderFrameDerivesFullSpriteGridDepthFrom3DSourceSprites() {
    const state = makeState();
    state.objects.player.colors = ["#111111"];
    state.objects.player.sprite3matrix = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0))
    );
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.deepStrictEqual(frame.spriteGrid, { width: 5, height: 5, depth: 5 });
    assert.deepStrictEqual(frame.objects[1].visual.voxels.size, { width: 5, height: 5, depth: 5 });
}

function testRenderFrameUsesSpriteSizeAsDefault3DGridDepth() {
    const state = makeState();
    state.sprite_size = 3;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.deepStrictEqual(frame.spriteGrid, { width: 3, height: 3, depth: 3 });
}

function testRenderFrameDoesNotUseStateSpriteSetFallback() {
    const state = makeState();
    state.spriteSet3D = {
        sprites: {
            player: {
                palette: ["#ffffff"],
                voxels: {
                    size: { width: 1, height: 1, depth: 1 },
                    slices: [["0"]]
                }
            }
        }
    };
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);

    assert.strictEqual(frame.objects[1].visual.kind, "spritematrix");
}

function testRenderFrameRejectsObjectsWithoutSourceOwnedSpriteMatrix() {
    const state = makeState();
    state.objects.player.spritematrix = [];
    const runtime = gameRuntime.createRuntimeFromState3D(state);

    assert.throws(
        () => renderFrame.buildRenderFrame3D(runtime, state),
        /requires object-owned sprite matrix data for "player"/
    );
}

function testRenderFrameRejectsImplicitPresentationForUnknownLayer() {
    const state = makeState();
    state.objects.player.layer = 2;
    const runtime = gameRuntime.createRuntimeFromState3D(state);

    assert.throws(
        () => renderFrame.buildRenderFrame3D(runtime, state),
        /cannot infer visual presentation for object "player" on layer 2/
    );
}

function testSessionRenderFrameCarriesSessionStateLike2DGraphicsReadState() {
    const state = makeState();
    const session = gameRuntime.createSessionFromState3D(state);
    session.checkpointSource = session.runtime.board.cloneSource();
    session.backups.push(session.runtime.board.cloneSource());

    const frame = renderFrame.buildSessionRenderFrame3D(session);

    assert.deepStrictEqual(frame.session, {
        levelIndex: 0,
        won: false,
        completed: false,
        hasCheckpoint: true,
        backupCount: 1,
        linkDepth: 0
    });
    assert.deepStrictEqual(frame.effects, {
        source: "none",
        changed: false,
        boardChanged: false,
        moved: false,
        inputDirection: undefined,
        turns: 0,
        commands: [],
        message: { requested: false, text: "" },
        status: { requested: false, text: "" },
        sfx: { playSeeds: [], animations: {} },
        tween: defaultTweenEffect()
    });
}

function testSessionTurnRenderFrameCarriesTurnEffectsLike2DGraphicsReadEffects() {
    const state = makeState();
    state.rules3d = {
        groups: [[
            {
                lineNumber: 1,
                commands: [["message", "hello"], ["status", "ready"], ["sfx0"]],
                patterns: [
                    {
                        frameExpansion: "none",
                        cells: [
                            {
                                offset: { x: 0, y: 0, z: 0 },
                                pattern: {
                                    objectsPresent: new Int32Array([2]),
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
        ]],
        lateGroups: []
    };
    const session = gameRuntime.createSessionFromState3D(state);
    const result = gameRuntime.processSessionTurn3D(session, null);

    const frame = renderFrame.buildSessionTurnRenderFrame3D(result);

    assert.deepStrictEqual(frame.session, {
        levelIndex: result.sessionState.levelIndex,
        won: result.sessionState.won,
        completed: result.sessionState.completed,
        hasCheckpoint: result.sessionState.hasCheckpoint,
        backupCount: result.sessionState.backupCount,
        linkDepth: result.sessionState.linkDepth
    });
    assert.strictEqual(frame.effects.source, "turn");
    assert.strictEqual(frame.effects.turns, 1);
    assert.deepStrictEqual(frame.effects.commands, ["message", "status", "sfx0"]);
    assert.deepStrictEqual(frame.effects.message, { requested: true, text: "hello" });
    assert.deepStrictEqual(frame.effects.status, { requested: true, text: "ready" });
    assert.deepStrictEqual(frame.effects.tween, defaultTweenEffect());
}

function testRenderFrameCarries2DStyleMovedEntitiesForTween() {
    const state = makeState();
    state.metadata.tween_length = 0.05;
    state.metadata.tween_snap = 5;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([3]));

    const frame = renderFrame.buildRenderFrame3D(runtime, state, {
        effects: {
            source: "turn",
            tween: {
                movedEntities: { "p1-l1": runtime.board.directionBits.right }
            }
        }
    });

    assert.deepStrictEqual(frame.effects.tween, Object.assign(defaultTweenEffect(), {
        enabled: true,
        lengthMs: 50,
        snap: 5,
        movedEntities: { "p1-l1": runtime.board.directionBits.right }
    }));
    assert.strictEqual(renderFrameContract.validateRenderFrame3D(frame), frame);
}

function testThreeRendererAppliesTweenWith2DFormulaToDisplayOnly() {
    const state = makeState();
    state.metadata.tween_length = 0.05;
    state.metadata.tween_snap = 5;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([3]));
    const frame = renderFrame.buildRenderFrame3D(runtime, state, {
        effects: {
            source: "turn",
            tween: {
                movedEntities: { "p1-l1": runtime.board.directionBits.right }
            }
        }
    });

    const atStart = foregroundItem(threeRenderer.buildInstances(frame, { tweenElapsedMs: 0 }));
    const atEnd = foregroundItem(threeRenderer.buildInstances(frame, { tweenElapsedMs: 50 }));

    assert.strictEqual(atStart.x, -0.5);
    assert.strictEqual(atEnd.x, 0.5);
    assert.deepStrictEqual(frame.cells.map(cell => cell.objectIds), [[0], [0, 1]]);
}

function testTweenAmountMatches2DGraphicsFormula() {
    const scenarios = [
        { elapsedMs: 0, lengthMs: 50, easing: "linear", snap: 5 },
        { elapsedMs: 12.5, lengthMs: 50, easing: "linear", snap: 5 },
        { elapsedMs: 25, lengthMs: 50, easing: "linear", snap: 10 },
        { elapsedMs: 25, lengthMs: 50, easing: "easeInQuad", snap: 5 },
        { elapsedMs: 25, lengthMs: 50, easing: "2", snap: 5 },
        { elapsedMs: 40, lengthMs: 50, easing: "easeOutCubic", snap: 8 },
        { elapsedMs: 50, lengthMs: 50, easing: "linear", snap: 5 },
        { elapsedMs: 75, lengthMs: 50, easing: "linear", snap: 5 }
    ];

    for (const scenario of scenarios) {
        assert.strictEqual(
            tweenSemantics.calculateMovementTweenAmount(scenario),
            calculate2DGraphicsMoveTweenOracle(scenario),
            JSON.stringify(scenario)
        );
    }
}

function testThreeRendererUses2DPrefixAndAppended3DMovementBitsForTween() {
    const state = makeState();
    state.metadata.tween_length = 0.05;
    state.metadata.tween_snap = 5;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([3]));
    const bits = runtime.board.directionBits;

    assert.deepStrictEqual(bits, {
        up: 1,
        down: 2,
        left: 4,
        right: 8,
        action: 16,
        front: 32,
        back: 64
    });

    const frame = renderFrame.buildRenderFrame3D(runtime, state, {
        effects: {
            source: "turn",
            tween: {
                movedEntities: {
                    "p1-l1": bits.front
                }
            }
        }
    });
    const start = foregroundItem(threeRenderer.buildInstances(frame, { tweenElapsedMs: 0 }));
    const end = foregroundItem(threeRenderer.buildInstances(frame, { tweenElapsedMs: 50 }));

    assert.strictEqual(start.z - end.z, 1);
    assert.strictEqual(frame.effects.tween.actionMask, 16);
    assert.strictEqual(frame.effects.tween.directionDeltas[16].x, 0);
    assert.strictEqual(frame.effects.tween.directionDeltas[32].z, -1);
    assert.strictEqual(frame.effects.tween.directionDeltas[64].z, 1);
}

function testThreeRendererApplies2DActionTweenAsFadeOnly() {
    const state = makeState();
    state.metadata.tween_length = 0.05;
    state.metadata.tween_snap = 5;
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    runtime.board.setCell(0, new Int32Array([1]));
    runtime.board.setCell(1, new Int32Array([3]));
    const frame = renderFrame.buildRenderFrame3D(runtime, state, {
        effects: {
            source: "turn",
            tween: {
                movedEntities: { "p1-l1": runtime.board.directionBits.action }
            }
        }
    });

    const atStart = onlyForegroundItem(threeRenderer.buildInstances(frame, { tweenElapsedMs: 0 }));
    const atEnd = foregroundItem(threeRenderer.buildInstances(frame, { tweenElapsedMs: 50 }));

    assert.strictEqual(atStart.x, 0.5);
    assert.strictEqual(atStart.alpha, 0);
    assert.strictEqual(atEnd.x, 0.5);
    assert.strictEqual(atEnd.alpha, 1);
    assert.deepStrictEqual(frame.cells.map(cell => cell.objectIds), [[0], [0, 1]]);
}

function calculate2DGraphicsMoveTweenOracle(options) {
    const easing = graphicsEasingFunction(options.easing || "linear");
    const snap = options.snap || 5;
    const tween = easing(1 - Math.max(0, Math.min(1, options.elapsedMs / options.lengthMs)));
    return Math.floor(tween * snap) / snap;
}

function graphicsEasingFunction(ease) {
    const key = ease in GRAPHICS_EASING_FUNCTIONS ? ease
        : Number(ease) in GRAPHICS_EASING_FUNCTIONS ? Number(ease)
        : "linear";
    return GRAPHICS_EASING_FUNCTIONS[key];
}

const GRAPHICS_EASING_FUNCTIONS = {
    linear: t => t,
    1: t => t,
    easeInQuad: t => t * t,
    2: t => t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    6: t => (--t) * t * t + 1
};

function foregroundItem(instanceGroups) {
    const group = instanceGroups.find(entry => entry.scale && entry.scale.y !== 0.08 && entry.alpha === 1);
    assert(group, "expected a foreground instance group");
    assert.strictEqual(group.items.length, 1);
    return group.items[0];
}

function foregroundItems(instanceGroups) {
    return instanceGroups
        .filter(entry => entry.scale && entry.scale.y !== 0.08 && entry.alpha === 1)
        .flatMap(entry => entry.items);
}

function onlyForegroundItem(instanceGroups) {
    const group = instanceGroups.find(entry => entry.scale && entry.scale.y !== 0.08);
    assert(group, "expected a foreground instance group");
    assert.strictEqual(group.items.length, 1);
    return Object.assign({ alpha: group.alpha }, group.items[0]);
}

function projectSubtract(to, from, basis) {
    const delta = {
        x: to.x - from.x,
        y: to.y - from.y,
        z: to.z - from.z
    };
    return {
        x: dot3(delta, basis.right),
        y: dot3(delta, basis.up)
    };
}

function cameraBasis(cameraPosition) {
    const forward = normalize3({
        x: -cameraPosition.x,
        y: -cameraPosition.y,
        z: -cameraPosition.z
    });
    const right = normalize3(cross3(forward, { x: 0, y: 1, z: 0 }));
    return {
        right,
        up: normalize3(cross3(right, forward))
    };
}

function cross3(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize3(vector) {
    const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length
    };
}

function assertVectorAlmost(actual, expected) {
    assert(Math.abs(actual.x - expected.x) < 1e-9, `expected x ${expected.x}, got ${actual.x}`);
    assert(Math.abs(actual.y - expected.y) < 1e-9, `expected y ${expected.y}, got ${actual.y}`);
    assert(Math.abs(actual.z - expected.z) < 1e-9, `expected z ${expected.z}, got ${actual.z}`);
}

function fullSprite3Matrix(width, height, depth, value) {
    return Array.from({ length: height }, () =>
        Array.from({ length: width }, () =>
            Array.from({ length: depth }, () => value)));
}

function faceCountForColor(state, color) {
    const runtime = gameRuntime.createRuntimeFromState3D(state);
    const frame = renderFrame.buildRenderFrame3D(runtime, state);
    const mesh = threeRenderer.buildInstances(frame, { voxelMesh: true })
        .find(group => group.kind === "faces" && group.color === color);
    assert(mesh, `expected face mesh for ${color}`);
    return mesh.faces.length;
}

function fakeThree() {
    class FakeCamera {
        constructor() {
            this.position = {
                set: (x, y, z) => {
                    this.position.x = x;
                    this.position.y = y;
                    this.position.z = z;
                    this.distanceFromOrigin = Math.hypot(x, y, z);
                }
            };
            this.up = {
                set: (x, y, z) => {
                    this.upVector = { x, y, z };
                }
            };
        }

        lookAt(x, y, z) {
            this.lookTarget = { x, y, z };
        }
    }

    return {
        PerspectiveCamera: class extends FakeCamera {
            constructor(fov, aspect, near, far) {
                super();
                this.fov = fov;
                this.aspect = aspect;
                this.near = near;
                this.far = far;
            }
        },
        OrthographicCamera: class extends FakeCamera {
            constructor(left, right, top, bottom, near, far) {
                super();
                this.left = left;
                this.right = right;
                this.top = top;
                this.bottom = bottom;
                this.near = near;
                this.far = far;
            }
        }
    };
}

function fakeThreeRendererOnly() {
    return {
        WebGLRenderer: class {
            constructor(options) {
                this.options = options;
            }
        }
    };
}

function fakeRenderableThree(stats) {
    function position() {
        return {
            x: 0,
            y: 0,
            z: 0,
            set(x, y, z) {
                this.x = x;
                this.y = y;
                this.z = z;
            },
            copy(other) {
                this.x = other.x;
                this.y = other.y;
                this.z = other.z;
            }
        };
    }

    class Camera {
        constructor() {
            this.position = position();
            this.up = position();
        }
        lookAt() {}
    }

    class Scene {
        constructor() {
            this.children = [];
        }
        add(child) {
            this.children.push(child);
        }
        traverse(visitor) {
            visitor(this);
            for (const child of this.children) {
                if (child && typeof child.traverse === "function")
                    child.traverse(visitor);
                else
                    visitor(child);
            }
        }
    }

    class DisposableGeometry {
        dispose() {
            stats.geometryDisposals++;
        }
    }

    class DisposableMaterial {
        constructor(options) {
            this.options = options;
        }
        dispose() {
            stats.materialDisposals++;
        }
    }

    class Mesh {
        constructor(geometry, material) {
            this.geometry = geometry;
            this.material = material;
        }
        traverse(visitor) {
            visitor(this);
        }
    }

    class InstancedMesh extends Mesh {
        constructor(geometry, material, count) {
            super(geometry, material);
            this.count = count;
            this.instanceMatrix = { needsUpdate: false };
        }
        setMatrixAt() {}
    }

    class Light {
        constructor() {
            this.position = position();
        }
    }

    return {
        FrontSide: 0,
        Color: class {
            constructor(value) {
                this.value = value;
            }
        },
        Scene,
        AmbientLight: Light,
        DirectionalLight: Light,
        PointLight: Light,
        PerspectiveCamera: class extends Camera {},
        OrthographicCamera: class extends Camera {},
        BoxGeometry: class extends DisposableGeometry {
            constructor(x, y, z) {
                super();
                this.scale = { x, y, z };
            }
        },
        BufferGeometry: class extends DisposableGeometry {
            setAttribute(name, attribute) {
                this[name] = attribute;
            }
        },
        BufferAttribute: class {
            constructor(array, size) {
                this.array = array;
                this.size = size;
            }
        },
        MeshLambertMaterial: DisposableMaterial,
        MeshBasicMaterial: DisposableMaterial,
        Mesh,
        InstancedMesh,
        Matrix4: class {
            makeTranslation(x, y, z) {
                this.translation = { x, y, z };
            }
        },
        WebGLRenderer: class {
            constructor(options) {
                this.options = options;
                stats.rendererConstructs++;
            }
            setPixelRatio() {}
            setSize() {}
            clearDepth() {}
            render() {
                stats.renders++;
            }
            dispose() {
                stats.rendererDisposals++;
            }
        }
    };
}

function loadThreeRendererWithWindow(windowObject) {
    const modulePath = path.join(__dirname, "../src/js/three_renderer3d.js");
    const resolved = require.resolve(modulePath);
    const previousWindow = global.window;
    delete require.cache[resolved];
    global.window = windowObject;
    const api = require(modulePath);
    delete require.cache[resolved];
    if (previousWindow === undefined)
        delete global.window;
    else
        global.window = previousWindow;
    return windowObject.Puzzle3DThreeRenderer || api;
}

function loadRenderFrameWithWindow(windowObject) {
    const modulePath = path.join(__dirname, "../src/js/render_frame3d.js");
    const resolved = require.resolve(modulePath);
    const previousWindow = global.window;
    delete require.cache[resolved];
    global.window = windowObject;
    const api = require(modulePath);
    delete require.cache[resolved];
    if (previousWindow === undefined)
        delete global.window;
    else
        global.window = previousWindow;
    return windowObject.Puzzle3DRenderFrame || api;
}

function defaultTweenEffect() {
    return {
        enabled: false,
        lengthMs: 0,
        easing: "linear",
        snap: 5,
        elapsedMs: 0,
        movedEntities: {},
        actionMask: 16,
        directionDeltas: {
            1: { x: 0, y: -1, z: 0 },
            2: { x: 0, y: 1, z: 0 },
            4: { x: -1, y: 0, z: 0 },
            8: { x: 1, y: 0, z: 0 },
            16: { x: 0, y: 0, z: 0 },
            32: { x: 0, y: 0, z: -1 },
            64: { x: 0, y: 0, z: 1 }
        }
    };
}

function makeState() {
    return {
        metadata: {
            color_palette: {
                black: "#000000",
                white: "#ffffff"
            }
        },
        default_metadata: {},
        playerMask: new Int32Array([2]),
        backgroundid: 0,
        backgroundlayer: 0,
        layerMasks: [new Int32Array([1]), new Int32Array([2])],
        objectCount: 2,
        idDict: ["background", "player"],
        objects: {
            background: {
                id: 0,
                layer: 0,
                colors: ["black"],
                spritematrix: [[0]],
                spriteoffset: { x: 0, y: 0 }
            },
            player: {
                id: 1,
                layer: 1,
                colors: ["white"],
                spritematrix: [[0]],
                spriteoffset: { x: 0, y: 0 }
            }
        },
        collisionLayers: [["background"], ["player"]],
        collisionLayerGroups: [
            {
                firstObjectNo: 0,
                numObjects: 1,
                dirFirst: "right",
                dirSecond: "down"
            },
            {
                firstObjectNo: 1,
                numObjects: 1,
                dirFirst: "right",
                dirSecond: "down"
            }
        ],
        rules3d: { groups: [], lateGroups: [] },
        levels: [
            {
                is3d: true,
                title: "test",
                width: 2,
                height: 1,
                depth: 1,
                cellCount: 2,
                n_tiles: 2,
                layerCount: 2,
                objects: new Int32Array([3, 1])
            }
        ]
    };
}

testRenderFrameHasExplicitRendererAgnosticSchema();
testRenderFrameUsesCompiledObjectMetadataAndBoardCells();
testRenderFramePreservesPuzzleScriptNextDrawGroups();
testThreeRendererBuildsInstanceGroupsFromRenderFrameOnly();
testThreeRendererRejectsNonFrameInputsBeforeTheyBecomeImplicitRuntimeAccess();
testThreeRendererRejectsImplicitLayerPresentationFallback();
testRenderFrameLowersCameraPreludeMetadataToViewContract();
testRenderFrameCarriesPuzzleScriptBackgroundColorToView();
testRenderFrameUses2DColorToHexForObjectColors();
testRenderFrameLowersOrthographicCameraPreludeAsExplicitOptOut();
testPerspectiveZoomChangesDerivedCameraDistanceWithoutFrameCarrier();
testThreeRendererFitsCameraToProjectedBoardBounds();
testThreeRendererUsesHighQualityCanvasDefaults();
testRenderToCanvasReusesRendererForCanvasLifecycle();
testObliqueCameraUsesWorldUpCarrier();
testTopDownCameraUsesYawAsSingularityFallbackOnly();
testRenderFrameRejectsMalformedViewContract();
testRendererUsesVisibleRegionProjectedFrom2DViewportCarrier();
testExplicitRenderRegionControlsCullingWithoutChangingLogicalScreen();
testSmoothScreenCameraCenterStaysSeparateFromIntegerVisibleRegion();
testThreeRendererPositionsCellsAgainstSmoothCameraCenter();
testCameraDerivedRenderRegionAvoidsFullBoardScanOnLargeWorlds();
testThreeRendererUsesFullCellSpritesWithoutImplicitPadding();
testThreeRendererKeepsOverlappingSolidsOnCellY();
testThreeRendererSceneAdapterPreservesAsciiAxisContract();
testThreeRendererDefaultCameraProjectsBoardRightAndFrontWithInputCarriers();
testRenderFrameUsesCompiledBackgroundLayerForFloorPresentation();
testRenderFrameUsesCompiledBackgroundLayerRatherThanLayerZero();
testRenderFrameKeepsNonBackgroundFloorNamedObjectsSolid();
testThreeRendererRequiresThreeInsteadOfCanvasFallback();
testRenderFrameProjects2DSpriteMatrixUsing2DSpriteRules();
testRenderFrameKeepsSpriteDotsAsNoVoxels();
testRenderFrameCarriesHexAlphaIntoSpriteVoxels();
testThreeRendererBuilds2DSpriteMatrixVoxelsWithoutPadding();
testThreeRendererMergesContiguousSpriteVoxelsBeforeInstancing();
testThreeRendererVoxelMeshDrawsOnlyExposedFaces();
testThreeRendererVoxelMeshCullsInternalFacesAcrossCells();
testThreeRendererVoxelMeshCullsInternalFacesAcrossFiveByFiveCellsOnXAndZ();
testThreeRendererVoxelMeshCullsFacesFromEachFaceCenterToPerspectiveCamera();
testThreeRendererLeavesOpaqueGeometryDepthOrdered();
testRenderFrameBuildsVoxelVisualsFromObjectOwnedSprite3D();
testRenderFrameDerivesFullSpriteGridDepthFrom3DSourceSprites();
testRenderFrameUsesSpriteSizeAsDefault3DGridDepth();
testRenderFrameDoesNotUseStateSpriteSetFallback();
testRenderFrameRejectsObjectsWithoutSourceOwnedSpriteMatrix();
testRenderFrameRejectsImplicitPresentationForUnknownLayer();
testSessionRenderFrameCarriesSessionStateLike2DGraphicsReadState();
testSessionTurnRenderFrameCarriesTurnEffectsLike2DGraphicsReadEffects();
testRenderFrameCarries2DStyleMovedEntitiesForTween();
testThreeRendererAppliesTweenWith2DFormulaToDisplayOnly();
testTweenAmountMatches2DGraphicsFormula();
testThreeRendererUses2DPrefixAndAppended3DMovementBitsForTween();
testThreeRendererApplies2DActionTweenAsFadeOnly();

console.log("3d render frame tests passed");
