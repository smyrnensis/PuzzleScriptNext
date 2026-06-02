(function(root) {
    "use strict";

    const commandQueueApi = getCommandQueueApi();

    function applySessionArtifacts(session, artifacts, turn, options, hooks) {
        const opts = options || {};
        const api = hooks || {};
        if (!artifacts)
            return null;

        const plan = commandQueueApi.planSessionTail(artifacts, {
            modified: api.boardChanged ? api.boardChanged(turn) : false,
            winning: !!session.won,
            solving: opts.solving,
            dontDoWin: opts.dontDoWin
        });

        if (plan.terminalAction) {
            if (opts.deferQuit && plan.terminalAction.type === "quit") {
                session.completed = true;
                plan.quitDeferred = true;
                return plan;
            }
            applyTerminalSessionAction(session, plan.terminalAction, {
                options: opts,
                turn,
                startSource: turn && (turn.startSource || turn.backupSource)
            }, api);
            return plan;
        }

        if (plan.winRequested) {
            if (opts.deferWin && !(session.linkStack && session.linkStack.length > 0)) {
                session.won = true;
                plan.winDeferred = true;
                return plan;
            }
            applyWinSessionAction(session, opts, api);
            return plan;
        }

        if (plan.checkpointRequested && api.saveCheckpoint)
            api.saveCheckpoint(session);

        if (shouldSaveTurnBackup(plan, turn, api))
            api.saveTurnBackup(session, turn.startSource || turn.backupSource || session.restartSource);

        return plan;
    }

    function applyTerminalSessionAction(session, action, context, hooks) {
        const api = hooks || {};
        const options = context && context.options || {};
        if (!action)
            return;

        if (action.type === "restart") {
            if (api.saveTurnBackup)
                api.saveTurnBackup(session, options.startSource || context && context.startSource || api.cloneCurrentSource && api.cloneCurrentSource(session));
            if (api.restoreBoard)
                api.restoreBoard(session, session.restartSource || session.checkpointSource);
            runLevelStartRules(session, options, api);
        } else if (action.type === "goto") {
            gotoSessionLevel(session, resolveLevelTarget(session.state, action.target, api), options, api);
        } else if (action.type === "undo") {
            const backup = session.backups.pop();
            if (backup && api.restoreBoard)
                api.restoreBoard(session, backup);
        } else if (action.type === "cancel") {
            const source = context && context.startSource || options.startSource || options.backupSource;
            if (source && api.restoreBoard)
                api.restoreBoard(session, source);
        } else if (action.type === "quit" || action.type === "link") {
            if (action.type === "link" && applyLinkSessionAction(session, context, api))
                return;
            session.completed = true;
        }
    }

    function applyWinSessionAction(session, options, hooks) {
        const api = hooks || {};
        if (session.linkStack && session.linkStack.length > 0) {
            returnLinkSessionAction(session, options, api);
            return;
        }

        session.won = true;
        const nextIndex = session.levelIndex + 1;
        if (api.hasLevel && api.hasLevel(session, nextIndex)) {
            gotoSessionLevel(session, nextIndex, options, api);
        } else {
            session.completed = true;
        }
    }

    function gotoSessionLevel(session, levelIndex, options, hooks) {
        const api = hooks || {};
        session.levelIndex = levelIndex;
        if (api.loadLevel)
            api.loadLevel(session, levelIndex, options);
        if (api.resetRestartSource)
            api.resetRestartSource(session);
        session.checkpointSource = null;
        session.won = false;
        runLevelStartRules(session, options, api);
    }

    function runLevelStartRules(session, options, hooks) {
        const api = hooks || {};
        if (!api.isLevelStartEnabled || !api.isLevelStartEnabled(session))
            return null;
        if (!api.runNoInputTurn)
            throw new Error("Session level-start rules require a runNoInputTurn hook.");

        const opts = Object.assign({}, options || {}, {
            dontDoWin: true,
            levelStartPhase: true
        });
        const turn = api.runNoInputTurn(session, opts);
        const plan = applySessionArtifacts(session, turn && turn.sessionArtifacts, turn, opts, api);
        if (api.recordTurn)
            api.recordTurn(session, turn);
        return { turn, plan };
    }

    function applyLinkSessionAction(session, context, hooks) {
        const api = hooks || {};
        if (!api.resolveVisibleLinkTarget)
            return false;
        const target = api.resolveVisibleLinkTarget(session, context);
        if (target === null || target === undefined)
            return false;

        session.linkStack.push({
            levelIndex: session.levelIndex,
            backup: api.cloneCurrentSource ? api.cloneCurrentSource(session) : null,
            backupTop: session.backups.length
        });
        gotoSessionLevel(session, resolveLevelTarget(session.state, target, api), context && context.options || {}, api);
        return true;
    }

    function returnLinkSessionAction(session, options, hooks) {
        const api = hooks || {};
        const entry = session.linkStack.pop();
        if (!entry)
            return false;

        session.backups = session.backups.slice(0, entry.backupTop);
        if (Number.isInteger(entry.levelIndex))
            session.levelIndex = entry.levelIndex;
        if (api.restoreBoard)
            api.restoreBoard(session, entry.backup);

        const opts = Object.assign({}, options || {}, {
            dontDoWin: true
        });
        const turn = api.runNoInputTurn ? api.runNoInputTurn(session, opts) : null;
        if (turn)
            applySessionArtifacts(session, turn.sessionArtifacts, turn, opts, api);
        if (turn && api.recordTurn)
            api.recordTurn(session, turn);
        return true;
    }

    function resolveLevelTarget(state, target, hooks) {
        const api = hooks || {};
        if (api.resolveLevelTarget)
            return api.resolveLevelTarget(state, target);
        throw new Error("Session runtime requires a resolveLevelTarget hook.");
    }

    function shouldSaveTurnBackup(plan, turn, hooks) {
        const api = hooks || {};
        return !!(plan.saveBackup
            && turn
            && turn.inputDirection !== null
            && turn.inputDirection !== undefined
            && api.boardChanged
            && api.boardChanged(turn)
            && api.saveTurnBackup);
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

    const SessionRuntime = {
        applySessionArtifacts,
        applyTerminalSessionAction,
        applyWinSessionAction,
        gotoSessionLevel,
        runLevelStartRules,
        applyLinkSessionAction,
        returnLinkSessionAction
    };

    root.SessionRuntime = SessionRuntime;
    if (typeof module !== "undefined" && module.exports)
        module.exports = SessionRuntime;
})(typeof window !== "undefined" ? window : this);
