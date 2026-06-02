(function(root) {
    "use strict";

    const rulesApi = getRulesApi();
    const commandQueueApi = getCommandQueueApi();
    const sfxArtifactsApi = getSfxArtifactsApi();
    const metadataTwiddlingApi = getMetadataTwiddlingApi();
    const winConditionsApi = getWinConditionsApi();
    const turnRuntimeApi = getTurnRuntimeApi();
    const ruleApplicationApi = getRuleApplicationApi();

    function processTurn(runtime, inputDirection, options) {
        return turnRuntimeApi.processTurn(runtime, inputDirection, options, buildTurnHooks3D());
    }

    function buildTurnHooks3D() {
        return {
            getRules: getRuntimeRules3D,
            resetSfxState: resetSfxState3D,
            cloneBoardSource: cloneBoardSource3D,
            findPlayerPositions: findPlayerPositions3D,
            seedInputMovement,
            buildRuleOptions,
            createCommandState: commandQueueApi.createCommandState,
            applyRuleGroups,
            resolveMovements: resolveMovements3D,
            restoreBoardFromSource: restoreBoardFromSource3D,
            collectSfxArtifacts: collectTurnSfxArtifacts,
            evaluateWinConditions: evaluateWinConditions3D,
            boardChanged: boardChanged3D,
            isRequirePlayerMovementEnabled,
            hasPlayerAtPosition: hasPlayerAtPosition3D
        };
    }

    function getRuntimeRules3D(runtime, options) {
        return options && options.rules || runtime.rules || {};
    }

    function resetSfxState3D(runtime) {
        if (runtime.board.resetSfxState)
            runtime.board.resetSfxState();
    }

    function cloneBoardSource3D(runtime) {
        return runtime.board.cloneSource();
    }

    function findPlayerPositions3D(runtime, options) {
        return findPlayerPositions(runtime.board, options && options.playerMask || runtime.board.playerMask);
    }

    function resolveMovements3D(runtime) {
        return runtime.board.resolveMovements();
    }

    function restoreBoardFromSource3D(runtime, source) {
        runtime.board = replaceRuntimeBoard(runtime, source);
    }

    function evaluateWinConditions3D(runtime, winConditions) {
        return winConditionsApi.evaluateWinConditions(runtime.board, winConditions || []);
    }

    function boardChanged3D(startSource, runtime) {
        return boardObjectsChanged(startSource, runtime.board);
    }

    function hasPlayerAtPosition3D(runtime, position, options) {
        const playerMask = options && options.playerMask || runtime.board.playerMask;
        return anyBitsInCommon(runtime.board.getCell(position), playerMask);
    }

    function seedInputMovement(runtime, inputDirection, options) {
        if (inputDirection === undefined || inputDirection === null || inputDirection === "")
            return [];

        const playerMask = options.playerMask || runtime.board.playerMask;
        if (!playerMask)
            throw new Error("3D input movement requires a player mask.");

        return runtime.board.startMovement(playerMask, inputDirection);
    }

    function buildRuleOptions(runtime, options, inputPositions, playerPositionsAtTurnStart) {
        const opts = Object.assign({}, options || {});
        opts.runtime = runtime;
        if (opts.localRadius === undefined) {
            const lifecycle = runtime.slots && runtime.slots.core && runtime.slots.core.lifecycle;
            const localRadius = lifecycle && lifecycle.localRadius;
            if (localRadius && localRadius.value !== undefined)
                opts.localRadius = localRadius.value;
        }
        if (!opts.playerPositions) {
            opts.playerPositions = playerPositionsAtTurnStart
                ? playerPositionsAtTurnStart.slice()
                : findPlayerPositions(runtime.board, opts.playerMask || runtime.board.playerMask);
        }
        return opts;
    }

    function isRequirePlayerMovementEnabled(runtime, options) {
        if (options && options.requirePlayerMovement !== undefined)
            return !!options.requirePlayerMovement;
        const lifecycle = runtime && runtime.slots && runtime.slots.core && runtime.slots.core.lifecycle;
        return !!(lifecycle && lifecycle.requirePlayerMovement && lifecycle.requirePlayerMovement.enabled);
    }

    function findPlayerPositions(board, playerMask) {
        if (!board || !playerMask)
            return [];

        const mask = playerMask.data || playerMask;
        const positions = [];
        for (let index = 0; index < board.cellCount; index++) {
            if (anyBitsInCommon(board.getCell(index), mask))
                positions.push(index);
        }
        return positions;
    }

    function applyRuleGroups(board, groups, options, commandState, bannedGroups, control) {
        return ruleApplicationApi.applyRuleGroups(board, groups, options, commandState, bannedGroups, control, buildRuleApplicationHooks3D());
    }

    function applyRuleGroup(board, group, options, commandState) {
        return ruleApplicationApi.applyRuleGroup(board, group, options, commandState, buildRuleApplicationHooks3D());
    }

    function applyRandomRuleGroup(board, rules, options, commandState) {
        return ruleApplicationApi.applyRandomRuleGroup(board, rules, options, commandState, buildRuleApplicationHooks3D());
    }

    function boardObjectsChanged(startBoard, board) {
        const startCells = startBoard && (startBoard.cells || startBoard.objects);
        const currentCells = board && (board.cells || board.objects);
        if (!startCells || !currentCells)
            return false;
        if (startCells.length !== currentCells.length)
            return true;
        for (let i = 0; i < startCells.length; i++) {
            if (startCells[i] !== currentCells[i])
                return true;
        }
        return false;
    }

    function applyRule(board, rule, options, commandState) {
        return ruleApplicationApi.applyRule(board, rule, options, commandState, buildRuleApplicationHooks3D());
    }

    function buildRuleApplicationHooks3D() {
        return ruleApplicationApi.buildRuleApplicationHooks({
            queueCommands: queueRuleCommands3D,
            findPatternMatches: findPatternMatches3D,
            isMatchStillValid: function(board, match) {
                return rulesApi.isMatchStillValid(board, match);
            },
            applyMatchReplacements: function(board, match, rule) {
                return rulesApi.applyMatchReplacements(board, match, rule);
            }
        });
    }

    function buildCommandQueueHooks(runtime) {
        return {
            onQueued: function(command, rule) {
                applyMetadataCommand3D(runtime, command, rule);
            }
        };
    }

    function applyMetadataCommand3D(runtime, command, rule) {
        if (!runtime || !runtime.slots || !runtime.slots.mutation)
            return;
        const mutation = runtime.slots.mutation;
        const state = {
            metadata: mutation.metadata || {},
            default_metadata: mutation.defaultMetadata || {}
        };
        metadataTwiddlingApi.applyRuntimeMetadataCommand(state, command, rule, {
            onApplied: function() {
                const slotsApi = getSlotsApi();
                if (slotsApi && slotsApi.updateSlotsMetadata3D)
                    slotsApi.updateSlotsMetadata3D(runtime.slots, state.metadata, state.default_metadata);
            }
        });
    }

    function findPatternMatches3D(board, pattern, rule, options) {
        return rulesApi.findPatternMatches(board, pattern, {
            frames: options && options.frames,
            scanDirection: rule.direction,
            isGlobal: !!rule.globalRule,
            localRadius: options && options.localRadius,
            playerPositions: options && options.playerPositions
        });
    }

    function queueRuleCommands3D(commandState, rule, options) {
        commandQueueApi.queueCommands(commandState, rule, buildCommandQueueHooks(options && options.runtime));
    }

    function anyBitsInCommon(left, right) {
        const leftData = left.data || left;
        const rightData = right.data || right;
        const length = Math.min(leftData.length, rightData.length);
        for (let i = 0; i < length; i++) {
            if ((leftData[i] & rightData[i]) !== 0)
                return true;
        }
        return false;
    }

    function collectTurnSfxArtifacts(board) {
        if (board && board.board)
            board = board.board;
        return sfxArtifactsApi.collectSfxArtifacts({
            canMoveSeeds: board.sfxCanMoveSeeds || [],
            cantMoveSeeds: board.sfxCantMoveSeeds || [],
            animations: board.sfxAnimations || {},
            creationMasks: board.sfxCreationMasks || [],
            destructionMasks: board.sfxDestructionMasks || [],
            createMask: board.sfxCreateMask,
            destroyMask: board.sfxDestroyMask,
            createList: board.sfxCreateList || [],
            destroyList: board.sfxDestroyList || []
        });
    }

    function replaceRuntimeBoard(runtime, source) {
        const clonedSlots = runtime.slots;
        clonedSlots.core.board = source;
        const runtimeApi = getRuntimeApi();
        return runtimeApi.createRuntime3D(clonedSlots).board;
    }

    function getRulesApi() {
        if (typeof require === "function") {
            try {
                return require("./rules3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.Rules3D;
    }

    function getCommandQueueApi() {
        if (typeof require === "function") {
            try {
                return require("./command_queue.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.CommandQueue;
    }

    function getSfxArtifactsApi() {
        if (typeof require === "function") {
            try {
                return require("./sfx_artifacts.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.SfxArtifacts;
    }

    function getMetadataTwiddlingApi() {
        if (typeof require === "function") {
            try {
                return require("./runtime_metadata_twiddling.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuntimeMetadataTwiddling;
    }

    function getWinConditionsApi() {
        if (typeof require === "function") {
            try {
                return require("./win_conditions.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.WinConditions;
    }

    function getSlotsApi() {
        if (typeof require === "function") {
            try {
                return require("./slots3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.Slots3D;
    }

    function getRuntimeApi() {
        if (typeof require === "function") {
            try {
                return require("./runtime3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.Runtime3D;
    }

    function getTurnRuntimeApi() {
        if (typeof require === "function") {
            try {
                return require("./turn_runtime.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.TurnRuntime;
    }

    function getRuleApplicationApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_application.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleApplication;
    }

    const Turn3D = {
        processTurn,
        applyRuleGroups,
        applyRuleGroup,
        applyRule
    };

    root.Turn3D = Turn3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = Turn3D;
})(typeof window !== "undefined" ? window : this);
