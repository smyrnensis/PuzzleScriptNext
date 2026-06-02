(function(root) {
    "use strict";

    function buildTimerSlot(metadata) {
        const meta = metadata || {};
        return {
            again: {
                commandLoop: psSemantic("engine.processInput.again", true),
                timer: psSemantic("inputoutput.again_interval", false, "browser-loop-not-connected"),
                intervalMs: secondsToMs(meta.again_interval, 150)
            },
            realtime: {
                enabled: meta.realtime_interval !== undefined,
                timer: psSemantic("inputoutput.realtime_interval", false, "browser-loop-not-connected"),
                intervalMs: secondsToMs(meta.realtime_interval, 0)
            }
        };
    }

    function buildLifecycleSlot(metadata) {
        const meta = metadata || {};
        return {
            runRulesOnLevelStart: {
                enabled: meta.run_rules_on_level_start !== undefined,
                semantic: psSemantic("engine.loadLevel.run_rules_on_level_start", true)
            },
            requirePlayerMovement: {
                enabled: meta.require_player_movement !== undefined,
                semantic: psSemantic("engine.processInput.require_player_movement", true)
            },
            localRadius: {
                value: meta.local_radius,
                semantic: psSemantic("engine.ruleScan.local_radius", true)
            }
        };
    }

    function buildSessionSlot(metadata) {
        const meta = metadata || {};
        return {
            undo: { enabled: meta.noundo === undefined, allowLevelUndo: meta.allow_undo_level !== undefined },
            restart: { enabled: meta.norestart === undefined },
            levelSelect: {
                enabled: meta.level_select !== undefined,
                semantic: psSemantic("engine.titleFlow.level_select", false, "browser-title-flow-not-connected")
            },
            pause: {
                enabled: meta.enable_pause !== undefined,
                semantic: psSemantic("engine.titleFlow.enable_pause", false, "browser-title-flow-not-connected")
            },
            titleFlow: {
                skipTitleScreen: meta.skip_title_screen !== undefined,
                continueIsLevelSelect: meta.continue_is_level_select !== undefined,
                semantic: psSemantic("engine.titleFlow", false, "browser-title-flow-not-connected")
            },
            checkpoint: {
                semantic: psSemantic("engine.processInput.checkpoint", true)
            }
        };
    }

    function buildInputSlot(metadata, inputOptions) {
        const meta = metadata || {};
        const opts = inputOptions || {};
        return {
            bindings: {
                keyboard: {
                    keyToIntent: Object.assign({
                        w: "front",
                        a: "left",
                        s: "back",
                        d: "right"
                    }, opts.keyToIntent || {}),
                    unboundIntents: opts.unboundIntents || ["up", "down"]
                }
            },
            repeat: {
                throttle: meta.throttle_movement !== undefined,
                repeatMs: secondsToMs(meta.key_repeat_interval, 200)
            },
            sources: {
                keyboard: { enabled: meta.nokeyboard === undefined },
                action: { enabled: meta.noaction === undefined, noRepeat: meta.norepeat_action !== undefined },
                mouse: {
                    enabled: hasMouseMetadata(meta),
                    semantic: psSemantic("inputoutput.mouseInput", false, "3d-picking-and-input-adapter-not-connected")
                }
            }
        };
    }

    function buildRendererSlot(metadata) {
        const meta = metadata || {};
        return {
            viewport: {
                flickscreen: meta.flickscreen,
                zoomscreen: meta.zoomscreen,
                smoothscreen: meta.smoothscreen
            },
            tween: {
                enabled: meta.tween_length !== undefined,
                semantic: psSemantic("graphics.tween", false, "3d-render-adapter-not-connected"),
                lengthMs: secondsToMs(meta.tween_length, 0),
                easing: meta.tween_easing,
                snap: meta.tween_snap
            },
            palette: meta.color_palette,
            text: {
                statusLine: meta.status_line,
                textControls: meta.text_controls
            },
            assets: {
                customFont: meta.custom_font,
                loadImages: meta.load_images
            }
        };
    }

    function buildMutationSlot(metadata, defaultMetadata) {
        return {
            semantic: psSemantic("engine.runtime_metadata_twiddling", true),
            enabled: !!(metadata && metadata.runtime_metadata_twiddling !== undefined),
            metadata: metadata || {},
            defaultMetadata: defaultMetadata || {}
        };
    }

    function buildUpperSlot(metadata) {
        const meta = metadata || {};
        return {
            title: meta.title,
            author: meta.author,
            homepage: meta.homepage,
            exportOptions: meta.export_options
        };
    }

    function updateMetadataSlots(slots, metadata, defaultMetadata) {
        if (!slots || !slots.core)
            return slots;
        const currentMetadata = metadata || slots.mutation && slots.mutation.metadata || {};
        const currentDefaultMetadata = defaultMetadata || slots.mutation && slots.mutation.defaultMetadata || {};
        const inputOptions = slots.input && slots.input.bindings && slots.input.bindings.keyboard ? {
            keyToIntent: slots.input.bindings.keyboard.keyToIntent,
            unboundIntents: slots.input.bindings.keyboard.unboundIntents
        } : {};

        slots.core.timers = buildTimerSlot(currentMetadata);
        slots.core.lifecycle = buildLifecycleSlot(currentMetadata);
        slots.session = buildSessionSlot(currentMetadata);
        slots.input = buildInputSlot(currentMetadata, inputOptions);
        slots.renderer = buildRendererSlot(currentMetadata);
        slots.mutation = buildMutationSlot(currentMetadata, currentDefaultMetadata);
        slots.upper = buildUpperSlot(currentMetadata);
        return slots;
    }

    function secondsToMs(value, fallbackMs) {
        if (value === undefined || value === null || value === "")
            return fallbackMs;
        return Number(value) * 1000;
    }

    function hasMouseMetadata(metadata) {
        const meta = metadata || {};
        return meta.mouse_clicks !== undefined
            || meta.mouse_left !== undefined
            || meta.mouse_drag !== undefined
            || meta.mouse_up !== undefined
            || meta.mouse_right !== undefined
            || meta.mouse_rdrag !== undefined
            || meta.mouse_rup !== undefined;
    }

    function psSemantic(owner, implemented, reason) {
        const result = {
            owner,
            implemented: !!implemented
        };
        if (reason)
            result.reason = reason;
        return result;
    }

    const PSMetadataSlots = {
        buildTimerSlot,
        buildLifecycleSlot,
        buildSessionSlot,
        buildInputSlot,
        buildRendererSlot,
        buildMutationSlot,
        buildUpperSlot,
        updateMetadataSlots,
        secondsToMs,
        hasMouseMetadata,
        psSemantic
    };

    root.PSMetadataSlots = PSMetadataSlots;
    if (typeof module !== "undefined" && module.exports)
        module.exports = PSMetadataSlots;
})(typeof window !== "undefined" ? window : this);
