#!/usr/bin/env node

/* 

Creates a highly compressed release build in bin of the contents of src

Before running, install node using the following command:

>npm install

Packages used:
npm i rimraf@3 compress-images web-resource-inliner ncp gifsicle@5.3.0 concat ycssmin terser gzipper html-minifier-terser glob@8

*/

const fs = require("fs");
const path = require('path');
const { execFileSync } = require('child_process');

const rimraf = require('rimraf');
const compress_images = require("compress-images");
var webResourceInliner = require("web-resource-inliner");
const ncp = require('ncp').ncp;
const gifsicle = require('gifsicle');
const concat = require('concat');
const cssmin = require('ycssmin').cssmin;
const { minify } = require("terser");
const { Compress } = require('gzipper');
const htmlminify = require('html-minifier-terser').minify;
const glob = require("glob")

const LOCAL_SCRIPT_TAG_RE = /<script src="js\/[A-Za-z0-9_\/.-]*\.js"><\/script>/g;
const STANDALONE_PLAY_CSS_RE = /<link rel="stylesheet" href="css\/play\.css">/g;
const STANDALONE_THREE_MODULE_URL_SCRIPT_RE = /<script>\s*window\.PUZZLE3D_THREE_MODULE_URL = new URL\("js\/vendor\/three\.module\.min\.js", document\.baseURI\)\.href;\s*<\/script>/g;

function removeStandaloneRawScriptsForCompiledBundle(html) {
    return html.replace(LOCAL_SCRIPT_TAG_RE, "");
}

function inlineStandaloneThreeModule(html) {
    return html.replace(STANDALONE_THREE_MODULE_URL_SCRIPT_RE, function() {
        const moduleSource = fs.readFileSync("./src/js/vendor/three.module.min.js", "utf8");
        return "<script>\n" + toClassicThreeModuleBridge(moduleSource) + "\n</script>";
    });
}

function toClassicThreeModuleBridge(moduleSource) {
    const exportMatch = moduleSource.match(/export\{([\s\S]*)\};?\s*$/);
    if (!exportMatch)
        throw new Error("Could not find the Three.js module export list.");

    const body = moduleSource.slice(0, exportMatch.index);
    const exportsObject = exportMatch[1].split(",").map(classicThreeExportEntry).join(",\n");
    return [
        "(function() {",
        "var __PuzzleScriptNextThreeRoot = typeof window !== \"undefined\" ? window : globalThis;",
        body,
        "__PuzzleScriptNextThreeRoot.THREE = {",
        exportsObject,
        "};",
        "})();"
    ].join("\n");
}

function classicThreeExportEntry(entry) {
    const parts = entry.trim().split(/\s+as\s+/);
    if (parts.length === 2)
        return JSON.stringify(parts[1]) + ": " + parts[0];
    return JSON.stringify(parts[0]) + ": " + parts[0];
}

//print all paths to all modules above
var lines = fs.readFileSync(".build/buildnumber.txt", encoding = 'utf-8');
var buildnum = parseInt(lines);
buildnum++;
// todo?
//const date = new Date();
//const buildnum = `${date.getFullYear()-2000}${date.getMonth()}${date.getDay()}`;
fs.writeFileSync(".build/buildnumber.txt", buildnum.toString(), encoding = 'utf-8');

//#node-qunit-phantomjs  tests/tests.html --timeout 40
console.log("===========================");
console.log('build number ' + buildnum)

var start = new Date()

console.log("removing bin")

rimraf.sync("./bin");
fs.mkdirSync('./bin');

console.log("Copying files")
ncp.limit = 16;
ncp("./src", "./bin/", function (err) {
    if (err) {
        return console.error(err);
    }
    console.log("echo optimizing pngs");

    rimraf.sync('./bin/images/*.png');

    (async () => {

        compress_images(
            "./src/images/*.png",
            "./bin/images/",
            { compress_force: false, statistic: false, autoupdate: true }, false,
            { jpg: { engine: "mozjpeg", command: ["-quality", "60"] } },
            { png: { engine: "pngcrush", command: ["-reduce", "-brute"] } },
            { svg: { engine: "svgo", command: "--multipass" } },
            { gif: { engine: "gifsicle", command: ["--colors", "64", "--use-col=web"] } },

            function (error, completed, statistic) {
                // console.log("-------------");
                // console.log(error);
                // console.log(completed);
                // console.log(statistic);
                // console.log("-------------");
            }
        );

        console.log('Optimizing gallery gifs');

        const galGifDir = "./bin/Gallery/gifs";

        fs.readdirSync(galGifDir).forEach(file => {
            if (fs.lstatSync(path.resolve(galGifDir, file)).isDirectory()) {
            } else {
                if (path.extname(file).toLowerCase() === ".gif") {
                    execFileSync(gifsicle, ['--batch', '-O2', galGifDir + "/" + file])
                }
            }
        });

        console.log('Optimizing documentation gifs');

        glob("./bin/Documentation/images/*.gif", {}, async function (er, files) {
            for (filename of files) {
                execFileSync(gifsicle, ['-O2', '-o', filename, filename]);
            }

            console.log('Images optimized');

            //remove ".bin/js dir if it exists"
            rimraf.sync('./bin/js');
            rimraf.sync('./bin/css');
            rimraf.sync('./bin/tests');
            
            fs.mkdirSync('./bin/js');
            fs.mkdirSync('./bin/css');

            const vendorJsDir = "./src/js/vendor";
            if (fs.existsSync(vendorJsDir)) {
                fs.mkdirSync("./bin/js/vendor", { recursive: true });
                for (const file of fs.readdirSync(vendorJsDir)) {
                    const src = path.join(vendorJsDir, file);
                    if (fs.lstatSync(src).isFile()) {
                        fs.copyFileSync(src, path.join("./bin/js/vendor", file));
                    }
                }
            }

            console.log('compressing css');

            await concat(["./src/css/docs.css",
                "./src/css/codemirror.css",
                "./src/css/midnight.css",
                "./src/css/console.css",
                "./src/css/gamecanvas.css",
                "./src/css/soundbar.css",
                "./src/css/layout.css",
                "./src/css/toolbar.css",
                "./src/css/dialog.css",
                "./src/css/show-hint.css"],
                "./bin/css/combined.css");

            console.log('css files concatenated')

            var css = fs.readFileSync("./bin/css/combined.css", encoding = 'utf8');
            var min = cssmin(css);
            fs.writeFileSync("./bin/css/combined.css", min, encoding = "utf8");

            var css = fs.readFileSync("./bin/Documentation/css/bootstrap.css", encoding = 'utf8');
            var min = cssmin(css);
            fs.writeFileSync("./bin/Documentation/css/bootstrap.css", min, encoding = "utf8");

            console.log("running js minification");

            async function writeMinifiedBundle(files, filename, mapFilename) {
                var corpus = {};
                for (var i = 0; i < files.length; i++) {
                    var fpath = files[i];
                    corpus["source/" + fpath.slice(9)] = fs.readFileSync(fpath, encoding = 'utf-8');
                }
                var result = await minify(
                    corpus,
                    {
                        sourceMap: {
                            filename,
                            url: mapFilename
                        }
                    });
                fs.writeFileSync('./bin/js/' + filename, result.code);
                fs.writeFileSync('./bin/js/' + mapFilename, result.map);
            }

            const editor2DFiles = [
                "./src/js/Blob.js",
                "./src/js/FileSaver.js",
                "./src/js/jsgif/LZWEncoder.js",
                "./src/js/jsgif/NeuQuant.js",
                "./src/js/jsgif/GIFEncoder.js",
                "./src/js/storagewrapper.js",
                "./src/js/debug.js",
                "./src/js/globalVariables.js",
                "./src/js/font.js",
                "./src/js/rng.js",
                "./src/js/riffwave.js",
                "./src/js/sfxr.js",
                "./src/js/codemirror/codemirror.js",
                "./src/js/codemirror/active-line.js",
                "./src/js/codemirror/dialog.js",
                "./src/js/codemirror/search.js",
                "./src/js/codemirror/searchcursor.js",
                "./src/js/codemirror/match-highlighter.js",
                "./src/js/codemirror/show-hint.js",
                "./src/js/codemirror/anyword-hint.js",
                "./src/js/codemirror/comment.js",
                "./src/js/colors.js",
                "./src/js/graphics.js",
                "./src/js/mobile.js",
                "./src/js/inputoutput.js",
                "./src/js/buildStandalone.js",
                "./src/js/engine.js",
                "./src/js/parser.js",
                "./src/js/editor.js",
                "./src/js/compiler.js",
                "./src/js/editor_3d_router.js",
                "./src/js/console.js",
                "./src/js/soundbar.js",
                "./src/js/toolbar.js",
                "./src/js/layout.js",
                "./src/js/addlisteners.js",
                "./src/js/addlisteners_editor.js",
                "./src/js/solver.js",
                "./src/js/FastPriorityQueue.js",
                "./src/js/makegif.js"];

            const play2DFiles = [
                "./src/js/storagewrapper.js",
                "./src/js/globalVariables.js",
                "./src/js/debug_off.js",
                "./src/js/font.js",
                "./src/js/rng.js",
                "./src/js/riffwave.js",
                "./src/js/sfxr.js",
                "./src/js/codemirror/stringstream.js",
                "./src/js/colors.js",
                "./src/js/graphics.js",
                "./src/js/engine.js",
                "./src/js/parser.js",
                "./src/js/compiler.js",
                "./src/js/inputoutput.js",
                "./src/js/mobile.js"];

            const editor3DFiles = [
                "./src/js/Blob.js",
                "./src/js/FileSaver.js",
                "./src/js/jsgif/LZWEncoder.js",
                "./src/js/jsgif/NeuQuant.js",
                "./src/js/jsgif/GIFEncoder.js",
                "./src/js/storagewrapper.js",
                "./src/js/debug.js",
                "./src/js/globalVariables.js",
                "./src/js/font.js",
                "./src/js/rng.js",
                "./src/js/riffwave.js",
                "./src/js/sfxr.js",
                "./src/js/codemirror/codemirror.js",
                "./src/js/codemirror/active-line.js",
                "./src/js/codemirror/dialog.js",
                "./src/js/codemirror/search.js",
                "./src/js/codemirror/searchcursor.js",
                "./src/js/codemirror/match-highlighter.js",
                "./src/js/codemirror/show-hint.js",
                "./src/js/codemirror/anyword-hint.js",
                "./src/js/codemirror/comment.js",
                "./src/js/colors.js",
                "./src/js/sprite_projection3d.js",
                "./src/js/graphics3d.js",
                "./src/js/mobile.js",
                "./src/js/inputoutput3d.js",
                "./src/js/level_editor3d.js",
                "./src/js/console.js",
                "./src/js/buildStandalone.js",
                "./src/js/command_queue.js",
                "./src/js/random_rule_groups.js",
                "./src/js/rule_groups.js",
                "./src/js/rule_grouping.js",
                "./src/js/rule_finalization.js",
                "./src/js/rule_lowering.js",
                "./src/js/rule_scan.js",
                "./src/js/rule_replacements.js",
                "./src/js/rule_application.js",
                "./src/js/cell_masks.js",
                "./src/js/sfx_artifacts.js",
                "./src/js/movement_resolution.js",
                "./src/js/runtime_metadata_twiddling.js",
                "./src/js/win_conditions.js",
                "./src/js/again_loop.js",
                "./src/js/turn_runtime.js",
                "./src/js/session_runtime.js",
                "./src/js/engine.js",
                "./src/js/parser3d.js",
                "./src/js/levels3d.js",
                "./src/js/rule_frames3d.js",
                "./src/js/cell_match3d.js",
                "./src/js/rules3d.js",
                "./src/js/ps_metadata_slots.js",
                "./src/js/slots3d.js",
                "./src/js/runtime3d.js",
                "./src/js/turn3d.js",
                "./src/js/game_runtime3d.js",
                "./src/js/render_frame_contract3d.js",
                "./src/js/render_frame3d.js",
                "./src/js/tween_semantics.js",
                "./src/js/three_renderer3d.js",
                "./src/js/play_host3d.js",
                "./src/js/compiler_3d.js",
                "./src/js/compiler3d.js",
                "./src/js/editor.js",
                "./src/js/soundbar.js",
                "./src/js/toolbar3d.js",
                "./src/js/layout.js",
                "./src/js/addlisteners.js",
                "./src/js/addlisteners_editor.js",
                "./src/js/makegif.js",
                "./src/js/solver.js",
                "./src/js/FastPriorityQueue.js"];

            const play3DFiles = [
                "./src/js/storagewrapper.js",
                "./src/js/globalVariables.js",
                "./src/js/debug_off.js",
                "./src/js/font.js",
                "./src/js/rng.js",
                "./src/js/riffwave.js",
                "./src/js/sfxr.js",
                "./src/js/codemirror/stringstream.js",
                "./src/js/colors.js",
                "./src/js/sprite_projection3d.js",
                "./src/js/graphics3d.js",
                "./src/js/command_queue.js",
                "./src/js/random_rule_groups.js",
                "./src/js/rule_groups.js",
                "./src/js/rule_grouping.js",
                "./src/js/rule_finalization.js",
                "./src/js/rule_lowering.js",
                "./src/js/rule_scan.js",
                "./src/js/rule_replacements.js",
                "./src/js/rule_application.js",
                "./src/js/cell_masks.js",
                "./src/js/sfx_artifacts.js",
                "./src/js/movement_resolution.js",
                "./src/js/runtime_metadata_twiddling.js",
                "./src/js/win_conditions.js",
                "./src/js/again_loop.js",
                "./src/js/turn_runtime.js",
                "./src/js/session_runtime.js",
                "./src/js/engine.js",
                "./src/js/parser3d.js",
                "./src/js/levels3d.js",
                "./src/js/rule_frames3d.js",
                "./src/js/cell_match3d.js",
                "./src/js/rules3d.js",
                "./src/js/ps_metadata_slots.js",
                "./src/js/slots3d.js",
                "./src/js/runtime3d.js",
                "./src/js/turn3d.js",
                "./src/js/game_runtime3d.js",
                "./src/js/render_frame_contract3d.js",
                "./src/js/render_frame3d.js",
                "./src/js/tween_semantics.js",
                "./src/js/three_renderer3d.js",
                "./src/js/play_host3d.js",
                "./src/js/compiler_3d.js",
                "./src/js/compiler3d.js",
                "./src/js/inputoutput3d.js",
                "./src/js/level_editor3d.js",
                "./src/js/mobile.js"];

            await writeMinifiedBundle(editor2DFiles, "scripts_compiled.js", "scripts_compiled.js.map");
            await writeMinifiedBundle(play2DFiles, "scripts_play_compiled.js", "scripts_play_compiled.js.map");
            await writeMinifiedBundle(editor3DFiles, "scripts3d_compiled.js", "scripts3d_compiled.js.map");
            await writeMinifiedBundle(play3DFiles, "scripts3d_play_compiled.js", "scripts3d_play_compiled.js.map");

            await ncp("./src/js", "./bin/js/source", function (err) {
                if (err) {
                    return console.error(err);
                }
            });

            console.log("compilation done");

            var editor = fs.readFileSync("./bin/editor.html", encoding = 'utf8');
            editor = editor.replace(/<script src="js\/[A-Za-z0-9_\/-]*\.js"><\/script>/g, "");
            editor = editor.replace(/<!--___SCRIPTINSERT___-->/g, `<script src="js\/scripts_compiled.js?build=${buildnum}"><\/script>`);
            editor = editor.replace(/<link rel="stylesheet" href="[A-Za-z0-9_\/-]*\.css">/g, '');
            editor = editor.replace(/<!--CSSREPLACE-->/g, '<link rel="stylesheet" href="css\/combined.css">');
            d = new Date();
            const monthname = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
            editor = editor.replace(/<!--BUILDNUMBER-->/g, `build ${buildnum.toString()}, ${d.getDate()}-${monthname[d.getMonth()]}-${d.getFullYear()}`);
            fs.writeFileSync("./bin/editor.html", editor, encoding = 'utf8');

            var editor3d = fs.readFileSync("./bin/editor3d.html", encoding = 'utf8');
            editor3d = editor3d.replace(/<script src="js\/[A-Za-z0-9_\/-]*\.js"><\/script>/g, "");
            editor3d = editor3d.replace(/<!--___SCRIPTINSERT___-->/g, `<script src="js\/scripts3d_compiled.js?build=${buildnum}"><\/script>`);
            editor3d = editor3d.replace(/<link rel="stylesheet" href="[A-Za-z0-9_\/-]*\.css">/g, '');
            editor3d = editor3d.replace(/<!--CSSREPLACE-->/g, '<link rel="stylesheet" href="css\/combined.css">');
            editor3d = editor3d.replace(/<!--BUILDNUMBER-->/g, `build ${buildnum.toString()}, ${d.getDate()}-${monthname[d.getMonth()]}-${d.getFullYear()}`);
            fs.writeFileSync("./bin/editor3d.html", editor3d, encoding = 'utf8');

            var player = fs.readFileSync("./bin/play.html", encoding = 'utf8');
            player = player.replace(/<script src="js\/[A-Za-z0-9_\/-]*\.js"><\/script>/g, "");
            player = player.replace(/<!--___SCRIPTINSERT___-->/g, `<script src="js\/scripts_play_compiled.js?build=${buildnum}"><\/script>`);
            fs.writeFileSync("./bin/play.html", player, encoding = 'utf8');

            var player3d = fs.readFileSync("./bin/play3d.html", encoding = 'utf8');
            player3d = player3d.replace(/<script src="js\/[A-Za-z0-9_\/-]*\.js"><\/script>/g, "");
            player3d = player3d.replace(/<!--___SCRIPTINSERT___-->/g, `<script src="js\/scripts3d_play_compiled.js?build=${buildnum}"><\/script>`);
            fs.writeFileSync("./bin/play3d.html", player3d, encoding = 'utf8');

            console.log("inlining standalone template")

            // src one first: standalone exports use the 3D host template.
            var standalone_raw = inlineStandaloneThreeModule(fs.readFileSync("./src/standalone3d.html", 'utf8'));

            webResourceInliner.html({
                fileContent: standalone_raw,
                relativeTo: 'src/',
            },
                function (err, inlined) {
                    if (err) {
                        console.log(err)
                    } else {
                        fs.writeFileSync("./src/standalone_inlined.txt", inlined);
                    }
                });

            //then bin one:
            standalone_raw = removeStandaloneRawScriptsForCompiledBundle(standalone_raw);
            standalone_raw = standalone_raw.replace(STANDALONE_PLAY_CSS_RE, "");
            standalone_raw = standalone_raw.replace(/<!--___SCRIPTINSERT___-->/g, '<script src="js\/scripts3d_play_compiled.js"><\/script>');
            webResourceInliner.html({
                fileContent: standalone_raw,
                relativeTo: 'bin/',
            },
                async function (err, inlined) {
                    if (err) {
                        console.log(err)
                    } else {
                        var minified = await htmlminify(inlined,
                            {
                                collapseBooleanAttributes: true,
                                collapseWhitespace: true,
                                minifyCSS: true,
                                minifyURLs: true,
                                removeAttributeQuotes: true,
                                removeComments: true,
                                removeEmptyAttributes: true,
                            });
                        fs.writeFileSync("./bin/standalone_inlined.txt", minified);
                    }

                    //delete ./bin/standalone.html
                    fs.unlinkSync("./bin/standalone.html");

                    console.log("compressing html");

                    glob("./bin/*.html", {}, async function (er, files) {
                        for (filename of files) {
                            var lines = fs.readFileSync(filename, encoding = 'utf8');
                            var result = await htmlminify(lines);
                            fs.writeFileSync(filename, result);
                        }
                    });

                    // (async function a() {

                    //     files = glob.sync("./bin/**/*.js");
                    //     files = files.concat(glob.sync("./bin/**/*.html"));
                    //     files = files.concat(glob.sync("./bin/**/*.css"));
                    //     files = files.concat(glob.sync("./bin/**/*.txt"));

                    //     for (var i=0;i<files.length;i++) {
                    //         var file = files[i];
                    //         var comp = new Compress(file);
                    //         await comp.run();
                    //     }

                    //     console.log("Files compressed. All good!");

                    // })();
                });

        });

    })();

});
