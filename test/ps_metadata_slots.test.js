const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const metadataSlots = require("../src/js/ps_metadata_slots.js");

function testBuildsTimerLifecycleAndSessionSemantics() {
    const metadata = {
        again_interval: "0.3",
        realtime_interval: "0.2",
        run_rules_on_level_start: true,
        require_player_movement: true,
        local_radius: 2,
        noundo: true,
        allow_undo_level: true,
        norestart: true,
        level_select: true,
        enable_pause: true,
        skip_title_screen: true,
        continue_is_level_select: true
    };

    const timers = metadataSlots.buildTimerSlot(metadata);
    const lifecycle = metadataSlots.buildLifecycleSlot(metadata);
    const session = metadataSlots.buildSessionSlot(metadata);

    assert.strictEqual(timers.again.intervalMs, 300);
    assert.strictEqual(timers.realtime.enabled, true);
    assert.deepStrictEqual(timers.realtime.timer, {
        owner: "inputoutput.realtime_interval",
        implemented: false,
        reason: "browser-loop-not-connected"
    });
    assert.strictEqual(lifecycle.runRulesOnLevelStart.enabled, true);
    assert.strictEqual(lifecycle.requirePlayerMovement.enabled, true);
    assert.strictEqual(lifecycle.localRadius.value, 2);
    assert.strictEqual(session.undo.enabled, false);
    assert.strictEqual(session.undo.allowLevelUndo, true);
    assert.strictEqual(session.restart.enabled, false);
    assert.strictEqual(session.levelSelect.enabled, true);
    assert.strictEqual(session.pause.enabled, true);
    assert.strictEqual(session.titleFlow.skipTitleScreen, true);
    assert.strictEqual(session.titleFlow.continueIsLevelSelect, true);
    assert.deepStrictEqual(session.checkpoint.semantic, {
        owner: "engine.processInput.checkpoint",
        implemented: true
    });
}

function testBuildsInputRendererMutationAndUpperSemantics() {
    const metadata = {
        key_repeat_interval: "0.125",
        throttle_movement: true,
        nokeyboard: true,
        noaction: true,
        norepeat_action: true,
        mouse_drag: "drag",
        tween_length: "0.05",
        tween_easing: "linear",
        tween_snap: 5,
        color_palette: { black: "#000000" },
        status_line: "status",
        text_controls: "controls",
        custom_font: "font.ttf",
        load_images: true,
        runtime_metadata_twiddling: true,
        title: "Title",
        author: "Author",
        homepage: "https://example.test",
        export_options: "opts"
    };

    const input = metadataSlots.buildInputSlot(metadata, {
        keyToIntent: { q: "up" },
        unboundIntents: []
    });
    const renderer = metadataSlots.buildRendererSlot(metadata);
    const mutation = metadataSlots.buildMutationSlot(metadata, { runtime_metadata_twiddling: true });
    const upper = metadataSlots.buildUpperSlot(metadata);

    assert.strictEqual(input.bindings.keyboard.keyToIntent.w, "front");
    assert.strictEqual(input.bindings.keyboard.keyToIntent.q, "up");
    assert.deepStrictEqual(input.bindings.keyboard.unboundIntents, []);
    assert.strictEqual(input.repeat.throttle, true);
    assert.strictEqual(input.repeat.repeatMs, 125);
    assert.strictEqual(input.sources.keyboard.enabled, false);
    assert.strictEqual(input.sources.action.enabled, false);
    assert.strictEqual(input.sources.action.noRepeat, true);
    assert.strictEqual(input.sources.mouse.enabled, true);
    assert.deepStrictEqual(input.sources.mouse.semantic, {
        owner: "inputoutput.mouseInput",
        implemented: false,
        reason: "3d-picking-and-input-adapter-not-connected"
    });

    assert.strictEqual(renderer.tween.enabled, true);
    assert.strictEqual(renderer.tween.lengthMs, 50);
    assert.strictEqual(renderer.tween.easing, "linear");
    assert.strictEqual(renderer.tween.snap, 5);
    assert.strictEqual(renderer.palette.black, "#000000");
    assert.strictEqual(renderer.text.statusLine, "status");
    assert.strictEqual(renderer.assets.customFont, "font.ttf");
    assert.strictEqual(mutation.enabled, true);
    assert.strictEqual(mutation.metadata, metadata);
    assert.deepStrictEqual(mutation.semantic, {
        owner: "engine.runtime_metadata_twiddling",
        implemented: true
    });
    assert.strictEqual(upper.title, "Title");
    assert.strictEqual(upper.author, "Author");
}

function testUpdateMetadataSlotsPreservesInputAdapterOptions() {
    const slots = {
        core: {},
        input: metadataSlots.buildInputSlot({}, {
            keyToIntent: { q: "up" },
            unboundIntents: []
        }),
        mutation: {
            metadata: {},
            defaultMetadata: {}
        }
    };

    metadataSlots.updateMetadataSlots(slots, {
        key_repeat_interval: "0.5",
        runtime_metadata_twiddling: true
    }, {});

    assert.strictEqual(slots.input.bindings.keyboard.keyToIntent.q, "up");
    assert.deepStrictEqual(slots.input.bindings.keyboard.unboundIntents, []);
    assert.strictEqual(slots.input.repeat.repeatMs, 500);
    assert.strictEqual(slots.mutation.enabled, true);
}

function testMetadataSlotsMatch2DEngineMetadataOracle() {
    const oracle = load2DMetadataSlotOracle();
    const scenarios = [
        {
            name: "default metadata",
            metadata: {}
        },
        {
            name: "timers and input flags",
            metadata: {
                again_interval: "0.25",
                realtime_interval: "0.4",
                key_repeat_interval: "0.125",
                throttle_movement: true,
                noundo: true,
                norestart: true,
                noaction: true,
                norepeat_action: true
            }
        },
        {
            name: "title and mouse flags",
            metadata: {
                level_select: true,
                enable_pause: true,
                skip_title_screen: true,
                continue_is_level_select: true,
                mouse_drag: "drag",
                tween_length: "0.05",
                runtime_metadata_twiddling: true
            }
        }
    ];

    for (const scenario of scenarios) {
        const metadata = scenario.metadata;
        const expected = JSON.parse(JSON.stringify(oracle.run(metadata)));
        const actual = metadataSlotSnapshot(metadata);
        assert.deepStrictEqual(actual, expected, scenario.name);
    }
}

function metadataSlotSnapshot(metadata) {
    const timers = metadataSlots.buildTimerSlot(metadata);
    const session = metadataSlots.buildSessionSlot(metadata);
    const input = metadataSlots.buildInputSlot(metadata);
    const renderer = metadataSlots.buildRendererSlot(metadata);
    const mutation = metadataSlots.buildMutationSlot(metadata, {});
    return {
        againIntervalMs: timers.again.intervalMs,
        realtimeEnabled: timers.realtime.enabled,
        realtimeIntervalMs: timers.realtime.intervalMs,
        repeatMs: input.repeat.repeatMs,
        throttleMovement: input.repeat.throttle,
        undoEnabled: session.undo.enabled,
        restartEnabled: session.restart.enabled,
        actionEnabled: input.sources.action.enabled,
        actionNoRepeat: input.sources.action.noRepeat,
        levelSelectEnabled: session.levelSelect.enabled,
        pauseEnabled: session.pause.enabled,
        skipTitleScreen: session.titleFlow.skipTitleScreen,
        continueIsLevelSelect: session.titleFlow.continueIsLevelSelect,
        mouseInputEnabled: input.sources.mouse.enabled,
        tweenEnabled: renderer.tween.enabled,
        tweenIntervalMs: renderer.tween.lengthMs,
        runtimeMetadataTwiddlingEnabled: mutation.enabled,
        continueOnContinue: session.titleFlow.skipTitleScreen || !session.titleFlow.continueIsLevelSelect,
        levelSelectOnContinue: session.titleFlow.continueIsLevelSelect,
        levelSelectOnLevelSelect: true
    };
}

function load2DMetadataSlotOracle() {
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
        CustomEvent: function CustomEvent(name, init) {
            this.type = name;
            this.detail = init && init.detail;
        },
        RNG: function RNG() { this.uniform = function() { return 0; }; },
        document: {
            URL: "test://metadata-slots",
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
        verbose_logging: false,
        unitTesting: true,
        IDE: false,
        canvas: null,
        levelEditorOpened: false,
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        storage_remove: function() {},
        consolePrint: function() {},
        consolePrintFromRule: function() {},
        addToDebugTimeline: function() { return 0; },
        htmlColor: function(_color, text) { return text; },
        htmlJump: function(lineNumber) { return String(lineNumber); },
        logWarning: function() {},
        consoleCacheDump: function() {},
        canvasResize: function() {},
        redraw: function() {},
        clearInputHistory: function() {},
        clearLocalStorage: function() {},
        tryLoadCustomFont: function() {},
        tryLoadImages: function() {},
        regenText: function() {},
        generateTitleScreen: function() {},
        drawMessageScreen: function() {},
        killAudioButton: function() {},
        showAudioButton: function() {},
        isSitelocked: function() { return false; },
        colorToHex: function(_palette, value) { return value || "#000000"; },
        deepClone: function(value) {
            return value == null ? value : JSON.parse(JSON.stringify(value));
        }
    };

    const hooks = `
module.exports.__metadataSlotOracle = {
    run: function(metadata) {
        state = {
            metadata: metadata || {},
            default_metadata: {},
            levels: [{}],
            sections: [{}]
        };
        autotick = 0;
        autotickinterval = 0;
        againinterval = 150;
        tweeninterval = 0;
        repeatinterval = 200;
        animateinterval = 0;
        twiddleMetadataExtras();

        titleSelection = MENUITEM_CONTINUE;
        var continueOnContinue = isContinueOptionSelected();
        var levelSelectOnContinue = isLevelSelectOptionSelected();
        titleSelection = MENUITEM_LEVELSELECT;
        var levelSelectOnLevelSelect = isLevelSelectOptionSelected();

        return {
            againIntervalMs: againinterval,
            realtimeEnabled: state.metadata.realtime_interval !== undefined,
            realtimeIntervalMs: autotickinterval,
            repeatMs: repeatinterval,
            throttleMovement: state.metadata.throttle_movement !== undefined,
            undoEnabled: state.metadata.noundo === undefined,
            restartEnabled: state.metadata.norestart === undefined,
            actionEnabled: state.metadata.noaction === undefined,
            actionNoRepeat: state.metadata.norepeat_action !== undefined,
            levelSelectEnabled: state.metadata.level_select !== undefined,
            pauseEnabled: state.metadata.enable_pause !== undefined,
            skipTitleScreen: state.metadata.skip_title_screen !== undefined,
            continueIsLevelSelect: state.metadata.continue_is_level_select !== undefined,
            mouseInputEnabled: !!IsMouseGameInputEnabled(),
            tweenEnabled: state.metadata.tween_length !== undefined,
            tweenIntervalMs: tweeninterval,
            runtimeMetadataTwiddlingEnabled: state.metadata.runtime_metadata_twiddling !== undefined,
            continueOnContinue: continueOnContinue,
            levelSelectOnContinue: levelSelectOnContinue,
            levelSelectOnLevelSelect: levelSelectOnLevelSelect
        };
    }
};
`;

    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__metadataSlotOracle;
}

testBuildsTimerLifecycleAndSessionSemantics();
testBuildsInputRendererMutationAndUpperSemantics();
testUpdateMetadataSlotsPreservesInputAdapterOptions();
testMetadataSlotsMatch2DEngineMetadataOracle();

console.log("ps metadata slot tests passed");
