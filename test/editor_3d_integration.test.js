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
        { value: "3d microban", label: "Microban 3D" }
    ]);
    assert(fs.existsSync(path.join(root, "demo", "3d microban.txt")));
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

function testEditorLoads3DHostOnNormalCompilePath() {
    const html = read("editor.html");
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

function testStandaloneExportTemplateCarries3DHost() {
    const html = read("standalone.html");
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
    testEditorLoads3DHostOnNormalCompilePath();
    testStandaloneExportTemplateCarries3DHost();
    testBuildStandaloneExportsPuzzleScriptSourceText();
}

run();
console.log("editor 3D integration tests passed");
