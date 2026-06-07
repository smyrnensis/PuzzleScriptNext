const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadGraphicsPaletteContext() {
    const projectionSource = fs.readFileSync(path.join(__dirname, "../src/js/sprite_projection3d.js"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "../src/js/graphics3d.js"), "utf8");
    const context = {
        console,
        Math,
        textMode: false,
        IDE: false,
        canOpenEditor: false,
        textImages: {},
        state: {
            metadata: {},
            levels: [{ is3d: true }],
            objects: {
                player: {
                    id: 0,
                    colors: ["#000000", "#ff5500", "#ffffff", "#5555aa"],
                    spritematrix: [
                        [-1, -1, -1, -1, -1],
                        [-1, -1, -1, -1, -1],
                        [-1, 0, 0, 0, -1],
                        [-1, -1, -1, -1, -1],
                        [-1, -1, -1, -1, -1]
                    ],
                    sprite3matrix: [
                        [[-1, -1, 2], [-1, -1, 2], [-1, -1, 2], [-1, -1, 2], [-1, -1, 2]],
                        [[-1, -1, -1], [-1, -1, -1], [-1, -1, -1], [-1, -1, -1], [-1, -1, -1]],
                        [[-1, -1, -1], [0, 1, -1], [0, 1, -1], [0, 1, -1], [-1, -1, -1]]
                    ]
                }
            }
        },
        colorToHex(_palette, color) {
            return color;
        },
        document: {
            getElementById() {
                return {
                    parentNode: { clientWidth: 100, clientHeight: 100 },
                    getContext() {
                        return {};
                    }
                };
            }
        }
    };
    context.window = context;
    context.addEventListener = () => {};
    vm.createContext(context);
    vm.runInContext(projectionSource, context, { filename: "sprite_projection3d.js" });
    vm.runInContext(source, context, { filename: "graphics.js" });
    return context;
}

function test3DPaletteUsesTopDownSpriteProjection() {
    const context = loadGraphicsPaletteContext();

    assert.deepStrictEqual(
        plain(context.sprite3MatrixTopDownSprite(context.state.objects.player.sprite3matrix, context.state.objects.player.colors).dat),
        [
            [2, 2, 2, 2, 2],
            [-1, -1, -1, -1, -1],
            [-1, 0, 0, 0, -1]
        ]
    );

    context.createObjectSprites();
    assert.deepStrictEqual(
        plain(context.objectSprites[0].dat),
        [
            [2, 2, 2, 2, 2],
            [-1, -1, -1, -1, -1],
            [-1, 0, 0, 0, -1]
        ]
    );
}

function test3DPaletteProjectionMixesTransparentVoxels() {
    const context = loadGraphicsPaletteContext();
    const projected = context.sprite3MatrixTopDownSprite(
        [
            [[0, 1]]
        ],
        ["#00000080", "#ffffff"]
    );

    assert.deepStrictEqual(plain(projected.dat), [[2]]);
    assert.deepStrictEqual(plain(projected.colors), ["#00000080", "#ffffff", "#7f7f7f"]);
}

function test3DLayeredProjectionDrawsVolumeBeforeTopDownView() {
    const context = loadGraphicsPaletteContext();
    const projected = context.sprite3MatrixTopDownLayeredSprite([
        {
            matrix: [
                [[0, -1]]
            ],
            colors: ["#ff0000"]
        },
        {
            matrix: [
                [[-1, 0]]
            ],
            colors: ["#0000ff"]
        }
    ]);

    assert.deepStrictEqual(plain(projected.dat), [[0]]);
    assert.deepStrictEqual(plain(projected.colors), ["#ff0000"]);
}

function test3DLayeredProjectionOverwritesSameVoxelByLayerOrder() {
    const context = loadGraphicsPaletteContext();
    const projected = context.sprite3MatrixTopDownLayeredSprite([
        {
            matrix: [
                [[0]]
            ],
            colors: ["#ff0000"]
        },
        {
            matrix: [
                [[0]]
            ],
            colors: ["#0000ff"]
        }
    ]);

    assert.deepStrictEqual(plain(projected.dat), [[0]]);
    assert.deepStrictEqual(plain(projected.colors), ["#0000ff"]);
}

function test3DLayeredProjectionAlphaCompositesSameVoxelByLayerOrder() {
    const context = loadGraphicsPaletteContext();
    const projected = context.sprite3MatrixTopDownLayeredSprite([
        {
            matrix: [
                [[0]]
            ],
            colors: ["#ff0000"]
        },
        {
            matrix: [
                [[0]]
            ],
            colors: ["#0000ff80"]
        }
    ]);

    assert.deepStrictEqual(plain(projected.dat), [[0]]);
    assert.deepStrictEqual(plain(projected.colors), ["#7f0080"]);
}

function test3DLayeredProjectionAlphaCompositesTopDownDepth() {
    const context = loadGraphicsPaletteContext();
    const projected = context.sprite3MatrixTopDownLayeredSprite([
        {
            matrix: [
                [[0, 1]]
            ],
            colors: ["#0000ff80", "#ff0000"]
        }
    ]);

    assert.deepStrictEqual(plain(projected.dat), [[0]]);
    assert.deepStrictEqual(plain(projected.colors), ["#7f0080"]);
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

test3DPaletteUsesTopDownSpriteProjection();
test3DPaletteProjectionMixesTransparentVoxels();
test3DLayeredProjectionDrawsVolumeBeforeTopDownView();
test3DLayeredProjectionOverwritesSameVoxelByLayerOrder();
test3DLayeredProjectionAlphaCompositesSameVoxelByLayerOrder();
test3DLayeredProjectionAlphaCompositesTopDownDepth();
console.log("editor 3D sprite palette tests passed");
