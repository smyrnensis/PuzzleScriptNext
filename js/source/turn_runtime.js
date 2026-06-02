(function(root) {
    "use strict";

    const commandQueueApi = getCommandQueueApi();

    function processTurn(runtime, inputDirection, options, hooks) {
        const opts = options || {};
        const api = hooks || {};
        if (!runtime || !runtime.board)
            throw new Error("Turn processing requires a runtime with a board.");
        requireHook(api, "getRules");
        requireHook(api, "cloneBoardSource");
        requireHook(api, "createCommandState");
        requireHook(api, "applyRuleGroups");
        requireHook(api, "resolveMovements");
        requireHook(api, "restoreBoardFromSource");
        requireHook(api, "collectSfxArtifacts");
        requireHook(api, "evaluateWinConditions");
        requireHook(api, "boardChanged");

        const rules = api.getRules(runtime, opts);
        if (api.resetSfxState)
            api.resetSfxState(runtime);

        const startBoard = api.cloneBoardSource(runtime);
        const playerPositionsAtTurnStart = api.findPlayerPositions
            ? api.findPlayerPositions(runtime, opts)
            : [];
        const inputPositions = api.seedInputMovement
            ? api.seedInputMovement(runtime, inputDirection, opts)
            : [];
        const ruleOptions = api.buildRuleOptions
            ? api.buildRuleOptions(runtime, opts, inputPositions, playerPositionsAtTurnStart)
            : opts;

        let commandState = api.createCommandState();
        const bannedGroups = {};
        let rigidLoop = false;
        let rigidIterations = 0;
        let rulesChanged = false;
        let rulesChangedBoard = false;
        let moved = false;
        let movedEntities = {};
        let rigidFailures = [];

        do {
            rigidLoop = false;
            rigidIterations++;
            if (rigidIterations > (opts.maxRigidIterations || 250))
                throw new Error("Rigid rule resimulation exceeded the iteration limit.");

            commandState = api.createCommandState();
            const ruleResult = api.applyRuleGroups(runtime.board, rules.groups || [], ruleOptions, commandState, bannedGroups, {
                loopPoint: rules.loopPoint || {},
                subroutines: rules.subroutines || []
            });
            rulesChanged = !!(ruleResult && ruleResult.returnValue);
            rulesChangedBoard = !!(ruleResult && ruleResult.changed);

            const movementResult = normalizeMovementResult(api.resolveMovements(runtime));
            moved = movementResult.moved;
            movedEntities = movementResult.movedEntities;
            rigidFailures = movementResult.rigidFailures;

            if (movementResult.shouldUndo) {
                rigidLoop = true;
                for (const failure of rigidFailures)
                    bannedGroups[failure.groupIndex] = true;
                api.restoreBoardFromSource(runtime, startBoard);
            }
        } while (rigidLoop);

        const lateRuleResult = api.applyRuleGroups(runtime.board, rules.lateGroups || [], ruleOptions, commandState, null, {
            loopPoint: rules.lateLoopPoint || {},
            subroutines: rules.subroutines || []
        });
        const lateRulesChanged = !!(lateRuleResult && lateRuleResult.returnValue);
        const lateRulesChangedBoard = !!(lateRuleResult && lateRuleResult.changed);
        const sessionArtifacts = commandQueueApi.collectSessionArtifacts(commandState);
        const requireMovementResult = validateRequiredPlayerMovement(runtime, inputDirection, opts, playerPositionsAtTurnStart, sessionArtifacts, api);

        if (!requireMovementResult.valid) {
            api.restoreBoardFromSource(runtime, startBoard);
            const emptyCommandState = api.createCommandState();
            return buildTurnResult({
                inputPositions,
                rulesChanged,
                rulesChangedBoard,
                lateRulesChanged,
                lateRulesChangedBoard,
                moved,
                movedEntities,
                rigidFailures,
                bannedGroups,
                boardChanged: false,
                commandState: emptyCommandState,
                sessionArtifacts: commandQueueApi.collectSessionArtifacts(emptyCommandState),
                sfxArtifacts: api.collectSfxArtifacts(runtime),
                winConditionSatisfied: false,
                requirePlayerMovementFailed: true
            });
        }

        const commandsChanged = commandQueueApi.hasCommandArtifacts(commandState);
        const sfxArtifacts = api.collectSfxArtifacts(runtime);
        if (opts.dontDoWin)
            sessionArtifacts.winRequested = false;
        const winConditionSatisfied = api.evaluateWinConditions(runtime, rules.winConditions || []);
        if (!opts.dontDoWin && winConditionSatisfied)
            sessionArtifacts.winRequested = true;
        const boardChanged = api.boardChanged(startBoard, runtime);

        return buildTurnResult({
            inputPositions,
            rulesChanged,
            rulesChangedBoard,
            lateRulesChanged,
            lateRulesChangedBoard,
            boardChanged,
            moved,
            rigidFailures,
            bannedGroups,
            commandsChanged,
            winConditionSatisfied,
            commandState,
            sessionArtifacts,
            sfxArtifacts,
            requirePlayerMovementFailed: false
        });
    }

    function buildTurnResult(data) {
        const commandState = data.commandState || commandQueueApi.createCommandState();
        const sessionArtifacts = data.sessionArtifacts || commandQueueApi.collectSessionArtifacts(commandState);
        const sfxArtifacts = data.sfxArtifacts || { playSeeds: [], animations: {} };
        const commandsChanged = data.commandsChanged !== undefined
            ? data.commandsChanged
            : commandQueueApi.hasCommandArtifacts(commandState);
        const boardChanged = !!data.boardChanged;
        const moved = !!data.moved;
        return {
            inputPositions: data.inputPositions || [],
            rulesChanged: !!data.rulesChanged,
            rulesChangedBoard: !!data.rulesChangedBoard,
            lateRulesChanged: !!data.lateRulesChanged,
            lateRulesChangedBoard: !!data.lateRulesChangedBoard,
            boardChanged,
            moved,
            movedEntities: data.movedEntities || {},
            rigidFailures: data.rigidFailures || [],
            bannedGroups: data.bannedGroups || {},
            commandsChanged,
            winConditionSatisfied: !!data.winConditionSatisfied,
            requirePlayerMovementFailed: !!data.requirePlayerMovementFailed,
            commandQueue: commandState.queue.slice(),
            commandSourceRules: commandState.sourceRules.slice(),
            commandArtifacts: {
                queue: commandState.queue.slice(),
                sourceRules: commandState.sourceRules.slice(),
                messageText: commandState.messageText,
                statusText: commandState.statusText,
                gosubTarget: commandState.gosubTarget,
                logs: commandState.logs.slice(),
                session: sessionArtifacts
            },
            sessionArtifacts,
            sfxArtifacts,
            changed: !data.requirePlayerMovementFailed && (
                (data.inputPositions || []).length > 0
                || boardChanged
                || moved
                || commandsChanged
                || (sfxArtifacts.playSeeds || []).length > 0
                || Object.keys(sfxArtifacts.animations || {}).length > 0
            )
        };
    }

    function validateRequiredPlayerMovement(runtime, inputDirection, options, playerPositionsAtTurnStart, sessionArtifacts, hooks) {
        const api = hooks || {};
        if (!api.isRequirePlayerMovementEnabled || !api.isRequirePlayerMovementEnabled(runtime, options))
            return { valid: true };
        if (inputDirection === undefined || inputDirection === null || inputDirection === "")
            return { valid: true };
        if (!playerPositionsAtTurnStart || playerPositionsAtTurnStart.length === 0)
            return { valid: true };
        if (requiredMovementBypassedByCommand(sessionArtifacts))
            return { valid: true };
        if (!api.hasPlayerAtPosition)
            throw new Error("require_player_movement requires a hasPlayerAtPosition hook.");

        for (const position of playerPositionsAtTurnStart) {
            if (!api.hasPlayerAtPosition(runtime, position, options))
                return { valid: true };
        }
        return { valid: false };
    }

    function requiredMovementBypassedByCommand(sessionArtifacts) {
        const plan = commandQueueApi.planSessionTail(sessionArtifacts || {}, { modified: true });
        return !!(plan.terminalAction && (
            plan.terminalAction.type === "undo"
            || plan.terminalAction.type === "goto"
            || plan.terminalAction.type === "link"
        ));
    }

    function normalizeMovementResult(result) {
        if (typeof result === "boolean")
            return { moved: result, rigidFailures: [], shouldUndo: false };
        return {
            moved: !!(result && result.moved),
            movedEntities: result && result.movedEntities || {},
            rigidFailures: result && result.rigidFailures || [],
            shouldUndo: !!(result && result.shouldUndo)
        };
    }

    function requireHook(hooks, name) {
        if (typeof hooks[name] !== "function")
            throw new Error("Turn runtime requires a " + name + " hook.");
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

    const TurnRuntime = {
        processTurn,
        buildTurnResult,
        validateRequiredPlayerMovement,
        normalizeMovementResult
    };

    root.TurnRuntime = TurnRuntime;
    if (typeof module !== "undefined" && module.exports)
        module.exports = TurnRuntime;
})(typeof window !== "undefined" ? window : this);
