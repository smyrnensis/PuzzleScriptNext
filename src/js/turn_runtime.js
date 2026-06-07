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

        const normalPhase = runRuleMovementPhase({
            maxRigidIterations: opts.maxRigidIterations || 250,
            createCommandState: api.createCommandState,
            applyRules: function(commandState, bannedGroups) {
                return api.applyRuleGroups(runtime.board, rules.groups || [], ruleOptions, commandState, bannedGroups, {
                    loopPoint: rules.loopPoint || {},
                    subroutines: rules.subroutines || []
                });
            },
            resolveMovements: function() {
                return api.resolveMovements(runtime);
            },
            restoreStartState: function() {
                api.restoreBoardFromSource(runtime, startBoard);
            }
        });
        let commandState = normalPhase.commandState;
        const bannedGroups = normalPhase.bannedGroups;
        const rulesChanged = normalPhase.rulesChanged;
        const rulesChangedBoard = normalPhase.rulesChangedBoard;
        const moved = normalPhase.moved;
        const movedEntities = normalPhase.movedEntities;
        const rigidFailures = normalPhase.rigidFailures;

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
            movedEntities,
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

    function runRuleMovementPhase(options) {
        const opts = options || {};
        if (typeof opts.applyRules !== "function")
            throw new Error("Turn phase requires an applyRules hook.");
        if (typeof opts.resolveMovements !== "function")
            throw new Error("Turn phase requires a resolveMovements hook.");

        const bannedGroups = opts.bannedGroups || {};
        let commandState = opts.commandState;
        let rigidIterations = 0;
        let ruleResult = null;
        let movementResult = normalizeMovementResult(null);
        let rigidFailures = [];

        do {
            rigidIterations++;
            if (rigidIterations > (opts.maxRigidIterations || 250)) {
                if (opts.throwOnLimit === false) {
                    return buildPhaseResult({
                        commandState,
                        bannedGroups,
                        rigidIterations,
                        ruleResult,
                        movementResult,
                        rigidFailures,
                        exceeded: true
                    });
                }
                throw new Error(opts.loopLimitMessage || "Rigid rule resimulation exceeded the iteration limit.");
            }

            if (opts.createCommandState)
                commandState = opts.createCommandState();
            ruleResult = opts.applyRules(commandState, bannedGroups, rigidIterations);
            movementResult = normalizeMovementResult(opts.resolveMovements(bannedGroups, rigidIterations));
            rigidFailures = movementResult.rigidFailures;

            if (movementResult.shouldUndo) {
                for (const failure of rigidFailures)
                    bannedGroups[failure.groupIndex] = true;
                if (opts.onRigidUndo)
                    opts.onRigidUndo({
                        bannedGroups,
                        commandState,
                        rigidFailures,
                        rigidIterations,
                        ruleResult,
                        movementResult
                    });
                if (opts.restoreStartState)
                    opts.restoreStartState();
            }
        } while (movementResult.shouldUndo);

        return buildPhaseResult({
            commandState,
            bannedGroups,
            rigidIterations,
            ruleResult,
            movementResult,
            rigidFailures,
            exceeded: false
        });
    }

    function buildPhaseResult(data) {
        const ruleResult = data.ruleResult || {};
        const movementResult = data.movementResult || normalizeMovementResult(null);
        return {
            commandState: data.commandState,
            bannedGroups: data.bannedGroups || {},
            rigidIterations: data.rigidIterations || 0,
            ruleResult,
            rulesChanged: !!ruleResult.returnValue,
            rulesChangedBoard: !!ruleResult.changed,
            movementResult,
            moved: !!movementResult.moved,
            movedEntities: movementResult.movedEntities || {},
            rigidFailures: data.rigidFailures || movementResult.rigidFailures || [],
            exceeded: !!data.exceeded
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
        runRuleMovementPhase,
        validateRequiredPlayerMovement,
        normalizeMovementResult
    };

    root.TurnRuntime = TurnRuntime;
    if (typeof module !== "undefined" && module.exports)
        module.exports = TurnRuntime;
})(typeof window !== "undefined" ? window : this);
