(function(root) {
    "use strict";

    const TWIDDLEABLE_PARAMS = [
        "background_color",
        "text_color",
        "key_repeat_interval",
        "realtime_interval",
        "again_interval",
        "flickscreen",
        "zoomscreen",
        "smoothscreen",
        "noundo",
        "norestart",
        "message_text_align",
        "color_palette"
    ];

    function applyRuntimeMetadataCommand(target, command, rule, hooks) {
        const opts = hooks || {};
        const state = target && (target.state || target);
        if (!state || !state.metadata || !state.metadata.runtime_metadata_twiddling)
            return { applied: false };
        if (!command || !isTwiddleable(command[0], opts.twiddleableParams))
            return { applied: false };

        const key = command[0];
        let value = command[1];

        if (value === "wipe") {
            delete state.metadata[key];
            value = null;
        } else if (value === "default") {
            value = deepClone((state.default_metadata || {})[key]);
        }

        if (value != null)
            state.metadata[key] = value;

        if (key === "zoomscreen" || key === "flickscreen") {
            callHook(opts.twiddleMetaData, state, command, rule);
            callHook(opts.canvasResize, state, command, rule);
        }

        if (key === "smoothscreen") {
            if (value !== undefined) {
                callHook(opts.twiddleMetaData, state, command, rule);
                callHook(opts.initSmoothCamera, state, command, rule);
            } else {
                callHook(opts.disableSmoothscreen, state, command, rule);
            }
            callHook(opts.canvasResize, state, command, rule);
        }

        if (key === "color_palette") {
            callHook(opts.twiddleMetaData, state, command, rule);
            callHook(opts.regenSpriteImages, state, command, rule);
            callHook(opts.canvasResize, state, command, rule);
        }

        callHook(opts.twiddleMetadataExtras, state, command, rule);

        if (state.metadata.runtime_metadata_twiddling_debug) {
            const message = metadataLogMessage(key, value, command[1]);
            callHook(opts.consolePrintFromRule, message, rule, true);
            callHook(opts.canvasResize, state, command, rule);
        }

        callHook(opts.onApplied, {
            key,
            value,
            originalValue: command[1],
            state,
            rule
        });

        return {
            applied: true,
            key,
            value,
            originalValue: command[1]
        };
    }

    function isTwiddleable(key, params) {
        return (params || TWIDDLEABLE_PARAMS).indexOf(key) >= 0;
    }

    function metadataLogMessage(key, value, originalValue) {
        let log = "Metadata twiddled: Flag " + key + " set to " + value;
        if (value != originalValue)
            log += " (" + originalValue + ")";
        return log;
    }

    function callHook(fn) {
        if (typeof fn !== "function")
            return;
        return fn.apply(null, Array.prototype.slice.call(arguments, 1));
    }

    function deepClone(value) {
        if (value === undefined || value === null)
            return value;
        if (typeof structuredClone === "function")
            return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    const RuntimeMetadataTwiddling = {
        TWIDDLEABLE_PARAMS,
        applyRuntimeMetadataCommand,
        isTwiddleable,
        metadataLogMessage
    };

    root.RuntimeMetadataTwiddling = RuntimeMetadataTwiddling;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuntimeMetadataTwiddling;
})(typeof window !== "undefined" ? window : this);
