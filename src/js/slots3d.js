(function(root) {
    "use strict";

    const ruleFramesApi = getRuleFramesApi();
    const metadataSlotsApi = getMetadataSlotsApi();

    function buildSlots3D(state, options) {
        const opts = options || {};
        const level = opts.level || firstLevel3(state);
        const metadata = opts.metadata || state && state.metadata || {};
        const defaultMetadata = opts.defaultMetadata || state && state.default_metadata || {};
        const ruleFrames = opts.ruleFrames || ruleFramesApi.RULE_FRAMES;

        if (!level)
            throw new Error("3D slots require a compiled 3D level from three_dimensions LEVELS.");
        if (!level.is3d)
            throw new Error("3D slots require a 3D level shape.");

        return {
            compiler: buildCompilerSlot(state, metadata),
            core: {
                frame: buildFrameSlot(ruleFrames),
                directions: buildDirectionsSlot(),
                board: buildBoardSlot(level, state, metadata),
                rules: buildRulesSlot(opts.rules || state && state.rules3d, ruleFrames),
                timers: metadataSlotsApi.buildTimerSlot(metadata),
                lifecycle: metadataSlotsApi.buildLifecycleSlot(metadata)
            },
            session: metadataSlotsApi.buildSessionSlot(metadata),
            input: metadataSlotsApi.buildInputSlot(metadata, opts.input),
            renderer: metadataSlotsApi.buildRendererSlot(metadata),
            mutation: metadataSlotsApi.buildMutationSlot(metadata, defaultMetadata),
            upper: metadataSlotsApi.buildUpperSlot(metadata)
        };
    }

    function firstLevel3(state) {
        if (!state || !Array.isArray(state.levels) || state.levels.length === 0)
            return null;
        return state.levels[0];
    }

    function buildCompilerSlot(state, metadata) {
        return {
            caseSensitive: !!(state && state.case_sensitive),
            debug: metadata.debug !== undefined,
            verboseLogging: metadata.verbose_logging !== undefined
        };
    }

    function buildFrameSlot(ruleFrames) {
        return {
            axes: {
                x: { positive: "right", negative: "left" },
                y: { positive: "down", negative: "up" },
                z: { positive: "back", negative: "front" }
            },
            standardRuleFrame: ruleFramesApi.STANDARD_RULE_FRAME,
            ruleFrames: {
                expansion: "proper-orthogonal-frames",
                count: ruleFrames.length,
                includeReflections: false,
                frames: ruleFrames
            },
            indexOrder: "z-fastest",
            coordToIndex: "x * height * depth + y * depth + z"
        };
    }

    function buildDirectionsSlot() {
        return {
            absolute: ["left", "right", "front", "back", "up", "down"],
            deltas: buildDirectionDeltasSlot(),
            aggregates: {
                horizontal: ["left", "right"],
                depth: ["front", "back"],
                vertical: ["up", "down"],
                planar: ["left", "right", "front", "back"],
                orthogonal: ["left", "right", "front", "back", "up", "down"]
            },
            relativeMarkers: ruleFramesApi.RELATIVE_MARKERS
        };
    }

    function buildBoardSlot(level, state, metadata) {
        const cellCount = level.cellCount || level.n_tiles || level.width * level.height * level.depth;
        const strideObj = level.strideObj || level.STRIDE_OBJ || Math.floor(level.objects.length / cellCount);
        const layerCount = level.layerCount || state && state.collisionLayers && state.collisionLayers.length || 0;
        const movementBits = level.MOV_BITS || state && state.MOV_BITS || 7;
        const movementMask = level.MOV_MASK || state && state.MOV_MASK || ((1 << movementBits) - 1);
        const strideMov = level.strideMov
            || level.STRIDE_MOV
            || state && state.STRIDE_MOV
            || Math.ceil(layerCount * movementBits / 32);

        return {
            width: level.width,
            height: level.height,
            depth: level.depth,
            cellCount,
            layerCount,
            strideObj,
            strideMov,
            movementBits,
            movementMask,
            movementTween: {
                enabled: !!(metadata && metadata.tween_length !== undefined)
            },
            directionBits: buildDirectionBitsSlot(),
            deltas: buildDirectionDeltasSlot(),
            cells: level.objects,
            movements: level.movements,
            playerMask: state && state.playerMask ? new Int32Array(state.playerMask.data || state.playerMask) : null,
            layerMasks: buildLayerMasksSlot(state, strideObj, layerCount),
            objectLayers: buildObjectLayersSlot(state),
            objectCount: state && state.objectCount || strideObj * 32,
            sfxCreationMasks: cloneSfxEntries(state && state.sfx_CreationMasks),
            sfxDestructionMasks: cloneSfxEntries(state && state.sfx_DestructionMasks),
            sfxMovementMasks: cloneNestedSfxEntries(state && state.sfx_MovementMasks),
            sfxMovementFailureMasks: cloneSfxEntries(state && state.sfx_MovementFailureMasks),
            rigidGroupIndexToGroupIndex: state && state.rigidGroupIndex_to_GroupIndex || [],
            groupNumberToRigidGroupIndex: state && state.groupNumber_to_RigidGroupIndex || {},
            background: {
                id: level.backgroundid,
                layer: level.backgroundlayer
            },
            sourceLevel: level
        };
    }

    function buildRulesSlot(rules, ruleFrames) {
        return {
            directionSet: ["left", "right", "front", "back", "up", "down", "action"],
            ruleFrames,
            groups: rules && rules.groups || [],
            lateGroups: rules && rules.lateGroups || [],
            loopPoint: rules && rules.loopPoint || {},
            lateLoopPoint: rules && rules.lateLoopPoint || {},
            subroutines: rules && rules.subroutines || [],
            winConditions: rules && rules.winConditions || []
        };
    }

    function buildInputSlot(metadata, inputOptions) {
        return metadataSlotsApi.buildInputSlot(metadata, inputOptions);
    }

    function buildDirectionBitsSlot() {
        return {
            up: 1,
            down: 2,
            left: 4,
            right: 8,
            action: 16,
            front: 32,
            back: 64
        };
    }

    function buildDirectionDeltasSlot() {
        return Object.assign({ action: [0, 0, 0] }, ruleFramesApi.DIRECTIONS);
    }

    function updateSlotsMetadata3D(slots, metadata, defaultMetadata) {
        return metadataSlotsApi.updateMetadataSlots(slots, metadata, defaultMetadata);
    }

    function buildLayerMasksSlot(state, strideObj, layerCount) {
        if (state && Array.isArray(state.layerMasks)) {
            return state.layerMasks.map(mask => new Int32Array(mask.data || mask));
        }

        if (!state || !state.objects || !state.idDict || !layerCount)
            return [];

        const masks = [];
        for (let layer = 0; layer < layerCount; layer++)
            masks.push(new Int32Array(strideObj));

        for (let id = 0; id < state.idDict.length; id++) {
            const name = state.idDict[id];
            const object = state.objects[name];
            if (!object || object.layer === undefined)
                continue;
            const word = id >> 5;
            const shift = id & 31;
            masks[object.layer][word] |= 1 << shift;
        }
        return masks;
    }

    function buildObjectLayersSlot(state) {
        if (!state || !state.objects || !state.idDict)
            return [];

        const layers = [];
        for (let id = 0; id < state.idDict.length; id++) {
            const name = state.idDict[id];
            const object = state.objects[name];
            layers[id] = object && object.layer !== undefined ? object.layer : null;
        }
        return layers;
    }

    function cloneSfxEntries(entries) {
        return (entries || []).map(entry => Object.assign({}, entry));
    }

    function cloneNestedSfxEntries(entries) {
        return (entries || []).map(group => cloneSfxEntries(group));
    }

    function getRuleFramesApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_frames3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleFrames3D;
    }

    function getMetadataSlotsApi() {
        if (typeof require === "function") {
            try {
                return require("./ps_metadata_slots.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.PSMetadataSlots;
    }

    const Slots3D = {
        buildSlots3D,
        updateSlotsMetadata3D,
        buildFrameSlot,
        buildDirectionsSlot,
        buildBoardSlot,
        buildInputSlot
    };

    root.Slots3D = Slots3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = Slots3D;
})(typeof window !== "undefined" ? window : this);
