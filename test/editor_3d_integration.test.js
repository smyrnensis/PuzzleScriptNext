const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "src");
const REQUIRED_3D_BROWSER_SCRIPTS = [
    "js/render_frame3d.js",
    "js/tween_semantics.js",
    "js/three_renderer3d.js",
    "js/sprite_projection3d.js",
    "js/level_editor3d.js",
    "js/play_host3d.js",
    "js/compiler_3d.js",
    "js/graphics3d.js",
    "js/inputoutput3d.js",
    "js/parser3d.js",
    "js/compiler3d.js"
];
const CLASSIC_BROWSER_COMPILER_HELPERS = [
    "getTag",
    "getMapping",
    "applyTransforms",
    "wordAlreadyDeclared",
    "isDeclaredAs",
    "getObjectRefs",
    "getObjectUndefs",
    "createObjectRef",
    "isColor",
    "colorToHex",
    "isSitelocked",
    "loadFile",
    "compile"
];
const CLASSIC_GLOBAL_HELPERS_USED_BY_BROWSER_SCRIPTS = [
    "getObjectRefs",
    "getObjectUndefs",
    "applyTransforms",
    "isColor",
    "colorToHex",
    "isSitelocked"
];

function read(relpath) {
    return fs.readFileSync(path.join(root, relpath), "utf8");
}

function scriptSources(html) {
    return Array.from(html.matchAll(/<script\b[^>]*\bsrc=(["'])(.*?)\1/gi), match => match[2].split(/[?#]/)[0]);
}

function optionsInOptgroup(html, label) {
    const optgroup = html.match(new RegExp(`<optgroup\\s+label=["']${escapeRegExp(label)}["'][^>]*>([\\s\\S]*?)</optgroup>`, "i"));
    assert(optgroup, `expected optgroup ${label}`);
    return Array.from(optgroup[1].matchAll(/<option\b[^>]*\bvalue=(["'])(.*?)\1[^>]*>(.*?)<\/option>/gi), match => ({
        value: match[2],
        label: match[3].trim()
    }));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertScriptsInclude(sources, requiredScripts) {
    for (const script of requiredScripts)
        assert(sources.includes(script), `expected browser script ${script}`);
}

function assertScriptOrder(sources, before, after) {
    const beforeIndex = sources.indexOf(before);
    const afterIndex = sources.indexOf(after);
    assert(beforeIndex >= 0, `expected ${before}`);
    assert(afterIndex >= 0, `expected ${after}`);
    assert(beforeIndex < afterIndex, `${before} must load before ${after}`);
}

function testEditorOffersCanonical3DDemos() {
    const html = read("editor.html");
    const options = optionsInOptgroup(html, "Puzzlescript Next 3D");

    assert.deepStrictEqual(options, [
        { value: "3d microban", label: "Microban 3D" },
        { value: "ladder", label: "ladder" }
    ]);
    assert(fs.existsSync(path.join(root, "demo", "3d microban.txt")));
    assert(fs.existsSync(path.join(root, "demo", "ladder.txt")));
}

function testEditorKeepsOriginalStarterWhileOffering3DDemo() {
    const editor = read("js/editor.js");
    const defaultDemo = read("demo/3d microban.txt");

    assert(editor.includes('const starterCodeFile = "next/starter.txt";'));
    assert(!editor.includes('const starterCodeFile = "3d microban.txt";'));
    assert(!editor.includes('window.location.protocol === "file:"'));
    assert(defaultDemo.includes("title Microban 3D"));
    assert(defaultDemo.includes("three_dimensions"));
}

function testOriginalBrowserPagesUseOriginal2DScripts() {
    const editorSources = scriptSources(read("editor.html"));
    assert(editorSources.includes("js/graphics.js"));
    assert(editorSources.includes("js/inputoutput.js"));
    assert(editorSources.includes("js/parser.js"));
    assert(editorSources.includes("js/compiler.js"));
    assert(editorSources.includes("js/toolbar.js"));
    assert(editorSources.includes("js/editor_3d_router.js"));
    assert(!editorSources.includes("js/graphics3d.js"));
    assert(!editorSources.includes("js/inputoutput3d.js"));
    assert(!editorSources.includes("js/parser3d.js"));
    assert(!editorSources.includes("js/compiler3d.js"));
    assert(!editorSources.includes("js/toolbar3d.js"));

    for (const file of ["play.html", "standalone.html"]) {
        const sources = scriptSources(read(file));
        assert(sources.includes("js/graphics.js"), `${file} should use original graphics.js`);
        assert(sources.includes("js/inputoutput.js"), `${file} should use original inputoutput.js`);
        assert(sources.includes("js/parser.js"), `${file} should use original parser.js`);
        assert(sources.includes("js/compiler.js"), `${file} should use original compiler.js`);
        assert(!sources.includes("js/graphics3d.js"), `${file} must not load graphics3d.js on the 2D path`);
        assert(!sources.includes("js/inputoutput3d.js"), `${file} must not load inputoutput3d.js on the 2D path`);
        assert(!sources.includes("js/parser3d.js"), `${file} must not load parser3d.js on the 2D path`);
        assert(!sources.includes("js/compiler3d.js"), `${file} must not load compiler3d.js on the 2D path`);
    }
}

function testEditor3DRouterMoves3DSourcesTo3DEditor() {
    const router = read("js/editor_3d_router.js");

    assert(router.includes("three_dimensions"));
    assert(router.includes("editor3d.html"));
    assert(router.includes("exampleDropdown"));
    assert(router.includes("Puzzlescript Next 3D"));
    assert(router.includes("root.loadGame = function(text, docompile, doclear)"));
}

function testEditor3DLoads3DHostOn3DCompilePath() {
    const html = read("editor3d.html");
    const sources = scriptSources(html);

    assertScriptsInclude(sources, REQUIRED_3D_BROWSER_SCRIPTS);
    assertScriptOrder(sources, "js/sprite_projection3d.js", "js/graphics3d.js");
    assertScriptOrder(sources, "js/inputoutput3d.js", "js/level_editor3d.js");
    assertScriptOrder(sources, "js/tween_semantics.js", "js/three_renderer3d.js");
    assert(html.includes("window.PUZZLE3D_THREE_MODULE_URL"));
    assertScriptOrder(sources, "js/compiler_3d.js", "js/compiler3d.js");
    assertScriptOrder(sources, "js/play_host3d.js", "js/compiler3d.js");
    assertScriptOrder(sources, "js/parser3d.js", "js/compiler3d.js");
}

function testPlay3DLoads3DHostOn3DCompilePath() {
    const html = read("play3d.html");
    const sources = scriptSources(html);

    assertScriptsInclude(sources, REQUIRED_3D_BROWSER_SCRIPTS);
    assertScriptOrder(sources, "js/compiler_3d.js", "js/compiler3d.js");
    assertScriptOrder(sources, "js/play_host3d.js", "js/compiler3d.js");
    assert(html.includes("editor3d.html?${hackArg}"));
}

function testReleaseBuildKeeps2DAnd3DBundlesSeparate() {
    const source = fs.readFileSync(path.join(root, "..", "compile.js"), "utf8");
    const editor2DSection = source.slice(source.indexOf("const editor2DFiles"), source.indexOf("const play2DFiles"));
    const play2DSection = source.slice(source.indexOf("const play2DFiles"), source.indexOf("const editor3DFiles"));
    const editor3DSection = source.slice(source.indexOf("const editor3DFiles"), source.indexOf("const play3DFiles"));
    const play3DSection = source.slice(source.indexOf("const play3DFiles"), source.indexOf("await writeMinifiedBundle"));

    for (const section of [editor2DSection, play2DSection]) {
        assert(section.includes("graphics.js"));
        assert(section.includes("inputoutput.js"));
        assert(section.includes("parser.js"));
        assert(section.includes("compiler.js"));
        assert(!section.includes("graphics3d.js"));
        assert(!section.includes("inputoutput3d.js"));
        assert(!section.includes("parser3d.js"));
        assert(!section.includes("compiler3d.js"));
    }
    for (const section of [editor3DSection, play3DSection]) {
        assert(section.includes("graphics3d.js"));
        assert(section.includes("inputoutput3d.js"));
        assert(section.includes("parser3d.js"));
        assert(section.includes("compiler3d.js"));
    }
    assert(source.includes('editor3d = editor3d.replace(/<!--___SCRIPTINSERT___-->/g, `<script src="js\\/scripts3d_compiled.js?build=${buildnum}"><\\/script>`);'));
    assert(source.includes('player3d = player3d.replace(/<!--___SCRIPTINSERT___-->/g, `<script src="js\\/scripts3d_play_compiled.js?build=${buildnum}"><\\/script>`);'));
}

function testCompilerOverlayPreservesClassicBrowserHelperContract() {
    const compiler = read("js/compiler3d.js");
    const parser = read("js/parser3d.js");

    assert(parser.includes("isColor(args[0])"), "parser3d should keep the classic color validation helper boundary");
    for (const helper of CLASSIC_BROWSER_COMPILER_HELPERS) {
        assert(
            compiler.includes(`    ${helper},`) || compiler.includes(`    ${helper}\n`),
            `compiler3d overlay must export classic browser helper ${helper}`
        );
        assert(
            compiler.includes(`var ${helper} = Compiler3DOverlay.${helper};`),
            `compiler3d overlay must rebind classic browser helper ${helper}`
        );
    }
    for (const helper of CLASSIC_GLOBAL_HELPERS_USED_BY_BROWSER_SCRIPTS) {
        assert(
            compiler.includes(`globalThis.${helper} = ${helper};`),
            `compiler3d overlay must expose browser-global helper ${helper}`
        );
    }
}

function testStandaloneExportTemplateCarries3DHost() {
    const html = read("standalone3d.html");
    const inlined = read("standalone_inlined.txt");
    const sources = scriptSources(html);

    assertScriptsInclude(sources, REQUIRED_3D_BROWSER_SCRIPTS);
    assertScriptOrder(sources, "js/sprite_projection3d.js", "js/graphics3d.js");
    assertScriptOrder(sources, "js/inputoutput3d.js", "js/level_editor3d.js");
    assertScriptOrder(sources, "js/tween_semantics.js", "js/three_renderer3d.js");
    assertScriptOrder(sources, "js/compiler_3d.js", "js/compiler3d.js");

    assert(inlined.includes("root.Puzzle3DRenderFrame"));
    assert(inlined.includes("root.PuzzleScriptTweenSemantics"));
    assert(inlined.includes("root.Puzzle3DThreeRenderer"));
    assert(inlined.includes("root.Puzzle3DPlayHost"));
    assert(!/<script\b[^>]*\bsrc=/i.test(inlined));
}

function testStandaloneExportTemplateUsesCurrent3DVisualRenderer() {
    const inlined = read("standalone_inlined.txt");
    const staleSymbols = [
        "classifyLayerPresentation3D",
        "presentationForLayer",
        "objectPresentation",
        "floorSpriteInstancesForObject",
        "surfaceScaleForPresentation"
    ];

    assert(inlined.includes("cameraProjection"), "standalone export should include current 3D renderer source");
    for (const symbol of staleSymbols)
        assert(!inlined.includes(symbol), `standalone export must not retain stale 3D visual renderer symbol ${symbol}`);
}

function testBuildStandaloneExportsPuzzleScriptSourceText() {
    const saved = [];
    const context = {
        console,
        self: {},
        Blob: function Blob(parts, options) {
            this.parts = parts;
            this.options = options;
        },
        XMLHttpRequest: function XMLHttpRequest() {
            this.open = () => {};
            this.send = () => {};
            this.readyState = 0;
            this.responseText = "";
        },
        saveAs: (blob, filename) => saved.push({ blob, filename }),
        consolePrint: () => {},
        state: {
            metadata: {
                title: "Export <3D>",
                homepage: "example.com"
            },
            bgcolor: "black",
            fgcolor: "white"
        },
        exportOptions: []
    };
    context.self.Blob = context.Blob;
    vm.createContext(context);
    vm.runInContext(read("js/buildStandalone.js"), context, { filename: "buildStandalone.js" });
    context.standalone_HTML_String = [
        "<html>",
        "<head><title>__GAMETITLE__</title></head>",
        "<body style=\"background:___BGCOLOR___\">",
        "<a href=\"__HOMEPAGE__\">__HOMEPAGE_STRIPPED_PROTOCOL__</a>",
        "<script>var source=\"__GAMEDAT__\";</script>",
        "</body>",
        "</html>"
    ].join("");

    context.buildStandalone(JSON.stringify("title $3D\nthree_dimensions"));

    assert.strictEqual(saved.length, 1);
    const html = saved[0].blob.parts.join("");
    assert.strictEqual(saved[0].filename, "Export _3D_.html");
    assert(html.includes("<title>Export &lt;3D&gt;</title>"));
    assert(html.includes('<a href="https://example.com">example.com</a>'));
    assert(html.includes('var source="title $3D\\nthree_dimensions";'));
}

function run() {
    testEditorOffersCanonical3DDemos();
    testEditorKeepsOriginalStarterWhileOffering3DDemo();
    testOriginalBrowserPagesUseOriginal2DScripts();
    testEditor3DRouterMoves3DSourcesTo3DEditor();
    testEditor3DLoads3DHostOn3DCompilePath();
    testPlay3DLoads3DHostOn3DCompilePath();
    testReleaseBuildKeeps2DAnd3DBundlesSeparate();
    testCompilerOverlayPreservesClassicBrowserHelperContract();
    testStandaloneExportTemplateCarries3DHost();
    testStandaloneExportTemplateUsesCurrent3DVisualRenderer();
    testBuildStandaloneExportsPuzzleScriptSourceText();
}

run();
console.log("editor 3D integration tests passed");
