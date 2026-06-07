(function(root) {
    "use strict";

    const slotsApi = getSlotsApi();
    const runtimeApi = getRuntimeApi();
    const turnApi = getTurnApi();
    const commandQueueApi = getCommandQueueApi();
    const againLoopApi = getAgainLoopApi();
    const sessionRuntimeApi = getSessionRuntimeApi();

    function createRuntimeFromState3D(state, options) {
        const opts = options || {};
        const slots = opts.slots || slotsApi.buildSlots3D(state, opts.slotsOptions || opts);
        return runtimeApi.createRuntime3D(slots, opts.runtimeOptions || opts);
    }

    function processTurn3D(runtime, inputDirection, options) {
        return turnApi.processTurn(runtime, inputDirection, options);
    }

    function createSessionFromState3D(state, options) {
        const opts = options || {};
        const levelIndex = opts.levelIndex || 0;
        const runtime = createRuntimeForLevel(state, levelIndex, opts);
        const session = {
            state,
            options: opts,
            runtime,
            levelIndex,
            oldflickscreendat: initialOldFlickScreenDat3D(state && state.metadata, runtime.board),
            restartSource: null,
            checkpointSource: null,
            won: false,
            completed: false,
            lastTurn: null,
            history: [],
            backups: [],
            linkStack: []
        };
        session.restartSource = cloneCurrentSessionSource3D(session);
        runLevelStartRules3D(session, opts);
        return session;
    }

    function rebuildSessionFromState3D(session, state, options) {
        if (!session || !session.runtime || !session.runtime.board)
            throw new Error("3D session rebuild requires an active session.");
        const opts = Object.assign({}, session.options || {}, options || {});
        const levelIndex = opts.levelIndex !== undefined ? opts.levelIndex : session.levelIndex;
        const currentSource = session.runtime.board.cloneSource();
        const runtime = createRuntimeForLevel(state, levelIndex, opts);
        assertRebuildCompatible3D(session.state, state, currentSource, runtime.board);
        const restartSource = runtime.board.cloneSource();

        copyCurrentCellsIntoRuntime3D(runtime, currentSource);
        session.state = state;
        session.options = opts;
        session.runtime = runtime;
        session.levelIndex = levelIndex;
        session.restartSource = restartSource;
        session.checkpointSource = null;
        session.won = false;
        session.completed = false;
        session.lastTurn = null;
        session.history = [];
        session.backups = [];
        session.linkStack = [];
        session.oldflickscreendat = currentSource.oldflickscreendat
            ? cloneOldFlickScreenDat(currentSource.oldflickscreendat)
            : initialOldFlickScreenDat3D(state && state.metadata, runtime.board);
        return session;
    }

    function processSessionTurn3D(session, inputDirection, options) {
        if (!session || !session.runtime)
            throw new Error("3D session turn requires a session created by createSessionFromState3D.");

        const opts = Object.assign({}, session.options || {}, options || {});
        if (opts.deferAgain)
            return processDeferredAgainSessionTurn3D(session, inputDirection, opts);

        const loop = againLoopApi.runAgainLoop({
            inputDirection,
            maxAgainIterations: opts.maxAgainIterations || 100,
            loopLimitMessage: "3D session again processing exceeded the iteration limit.",
            runTurn: function(turnInput) {
                const turnStartSource = session.runtime.board.cloneSource();
                const turn = processTurn3D(session.runtime, turnInput, opts);
                turn.startSource = turnStartSource;
                turn.inputDirection = turnInput;
                return turn;
            },
            afterTurn: function(turn) {
                return applySessionArtifacts3D(session, turn.sessionArtifacts, turn, opts);
            },
            shouldRunAgain: function(tailPlan) {
                return !!(tailPlan && tailPlan.againRequested && !session.completed);
            },
            canAgainChange: function() {
                return noInputTurnWouldChange3D(session.runtime, opts);
            }
        });

        session.lastTurn = loop.turn;
        session.history.push(...loop.turns);
        return {
            session,
            turn: loop.turn,
            turns: loop.turns,
            sessionState: snapshotSessionState(session)
        };
    }

    function processDeferredAgainSessionTurn3D(session, inputDirection, options) {
        const opts = options || {};
        const turnStartSource = session.runtime.board.cloneSource();
        const turn = processTurn3D(session.runtime, inputDirection, opts);
        turn.startSource = turnStartSource;
        turn.inputDirection = inputDirection;
        const tailPlan = applySessionArtifacts3D(session, turn.sessionArtifacts, turn, opts);
        const againScheduled = !!(tailPlan
            && tailPlan.againRequested
            && !session.completed
            && noInputTurnWouldChange3D(session.runtime, opts));

        session.lastTurn = turn;
        session.history.push(turn);
        return {
            session,
            turn,
            turns: [turn],
            tailPlan,
            againScheduled,
            sessionState: snapshotSessionState(session)
        };
    }

    function noInputTurnWouldChange3D(runtime, options) {
        return againLoopApi.evaluateNoInputAgainProbe({
            solving: options && options.solving,
            dontDoWin: options && options.dontDoWin,
            runProbe: function() {
                const probeRuntime = runtime.clone();
                return processTurn3D(probeRuntime, null, Object.assign({}, options || {}, {
                    dontDoWin: true
                }));
            },
            boardChanged: boardChangedThisTurn,
            planSessionTail: function(probe, planOptions) {
                return commandQueueApi.planSessionTail(probe.sessionArtifacts, planOptions);
            }
        });
    }

    function applySessionArtifacts3D(session, artifacts, turn, options) {
        return sessionRuntimeApi.applySessionArtifacts(session, artifacts, turn, options, buildSessionHooks3D());
    }

    function advanceSessionLevelItem3D(session, options) {
        if (!session || !session.state || !session.state.levels)
            return false;
        const nextIndex = session.levelIndex + 1;
        if (!hasSessionLevel3D(session, nextIndex)) {
            session.completed = true;
            return true;
        }
        sessionRuntimeApi.gotoSessionLevel(session, nextIndex, options || session.options || {}, buildSessionHooks3D());
        return true;
    }

    function boardChangedThisTurn(turn) {
        return !!(turn && turn.boardChanged);
    }

    function runLevelStartRules3D(session, options) {
        return sessionRuntimeApi.runLevelStartRules(session, Object.assign({}, session.options || {}, options || {}), buildSessionHooks3D());
    }

    function isRunRulesOnLevelStartEnabled(session) {
        const lifecycle = session
            && session.runtime
            && session.runtime.slots
            && session.runtime.slots.core
            && session.runtime.slots.core.lifecycle;
        return !!(lifecycle && lifecycle.runRulesOnLevelStart && lifecycle.runRulesOnLevelStart.enabled);
    }

    function buildSessionHooks3D() {
        return {
            boardChanged: boardChangedThisTurn,
            cloneCurrentSource: cloneCurrentSessionSource3D,
            restoreBoard: restoreSessionBoard,
            saveCheckpoint: saveCheckpoint3D,
            saveTurnBackup: saveTurnBackup3D,
            hasLevel: hasSessionLevel3D,
            loadLevel: loadSessionLevel3D,
            resetRestartSource: resetRestartSource3D,
            isLevelStartEnabled: isRunRulesOnLevelStartEnabled,
            runNoInputTurn: runNoInputSessionTurn3D,
            recordTurn: recordSessionTurn3D,
            resolveLevelTarget,
            resolveVisibleLinkTarget
        };
    }

    function cloneCurrentSessionSource3D(session) {
        const source = session.runtime.board.cloneSource();
        source.oldflickscreendat = cloneOldFlickScreenDat(session.oldflickscreendat);
        return source;
    }

    function saveCheckpoint3D(session) {
        session.checkpointSource = cloneCurrentSessionSource3D(session);
        session.restartSource = session.checkpointSource;
    }

    function saveTurnBackup3D(session, source) {
        session.backups.push(source || cloneCurrentSessionSource3D(session));
    }

    function hasSessionLevel3D(session, levelIndex) {
        return !!(session.state && session.state.levels && levelIndex < session.state.levels.length);
    }

    function loadSessionLevel3D(session, levelIndex, options) {
        session.runtime = createRuntimeForLevel(session.state, levelIndex, options || session.options || {});
        session.oldflickscreendat = initialOldFlickScreenDat3D(session.state && session.state.metadata, session.runtime.board);
    }

    function resetRestartSource3D(session) {
        session.restartSource = cloneCurrentSessionSource3D(session);
    }

    function runNoInputSessionTurn3D(session, options) {
        const turnStartSource = session.runtime.board.cloneSource();
        const turn = processTurn3D(session.runtime, null, options);
        turn.startSource = turnStartSource;
        turn.inputDirection = null;
        return turn;
    }

    function recordSessionTurn3D(session, turn) {
        session.lastTurn = turn;
        session.history.push(turn);
    }

    function resolveVisibleLinkTarget(session, context) {
        const opts = context && context.options || {};
        if (opts.linkTarget !== undefined)
            return opts.linkTarget;

        const state = session.state || {};
        const level = state.levels && state.levels[session.levelIndex];
        const links = state.links || [];
        const linksTop = level && Number.isInteger(level.linksTop) ? level.linksTop : links.length;
        if (!level || !links.length)
            return null;

        const playerMask = state.playerMask && (state.playerMask.data || state.playerMask);
        if (!playerMask)
            return null;

        const objectNamesById = state.idDict || [];
        for (let index = 0; index < session.runtime.board.cellCount; index++) {
            const cell = session.runtime.board.getCell(index);
            if (!anyBitsInCommon(cell, playerMask))
                continue;
            const objectNames = objectNamesAtCell(cell, objectNamesById);
            for (let linkIndex = Math.min(linksTop, links.length) - 1; linkIndex >= 0; linkIndex--) {
                const link = links[linkIndex];
                if (objectNames.indexOf(link.object) >= 0)
                    return link.targetNo;
            }
        }
        return null;
    }

    function restoreSessionBoard(session, source) {
        if (!source)
            return;
        session.runtime = createRuntimeFromBoardSource(session.runtime, source);
        session.oldflickscreendat = source.oldflickscreendat
            ? cloneOldFlickScreenDat(source.oldflickscreendat)
            : initialOldFlickScreenDat3D(session.state && session.state.metadata, session.runtime.board);
    }

    function createRuntimeForLevel(state, levelIndex, options) {
        if (!state || !state.levels || !state.levels[levelIndex])
            throw new Error(`3D session level index out of range: ${levelIndex}`);
        const opts = options || {};
        return createRuntimeFromState3D(state, Object.assign({}, opts, {
            slotsOptions: Object.assign({}, opts.slotsOptions || {}, {
                level: state.levels[levelIndex]
            })
        }));
    }

    function assertRebuildCompatible3D(oldState, newState, source, targetBoard) {
        const fields = ["width", "height", "depth", "cellCount", "layerCount", "movementBits", "strideMov"];
        for (const field of fields) {
            if (source[field] !== targetBoard[field])
                throw new Error(`3D rebuild cannot preserve the current board after changing ${field}. Run the level instead.`);
        }
        if (source.strideObj > targetBoard.strideObj)
            throw new Error("3D rebuild cannot preserve the current board after shrinking object storage. Run the level instead.");
        assertExistingObjectIdsPreserved3D(oldState, newState);
    }

    function assertExistingObjectIdsPreserved3D(oldState, newState) {
        const oldIds = oldState && oldState.idDict || [];
        const newIds = newState && newState.idDict || [];
        for (let index = 0; index < oldIds.length; index++) {
            if (oldIds[index] !== newIds[index])
                throw new Error(`3D rebuild cannot preserve the current board after changing object id ${index}. Run the level instead.`);
        }
    }

    function copyCurrentCellsIntoRuntime3D(runtime, source) {
        const board = runtime.board;
        for (let index = 0; index < source.cellCount; index++) {
            const cell = new Int32Array(board.strideObj);
            const start = index * source.strideObj;
            cell.set(source.cells.subarray(start, start + source.strideObj));
            board.setCell(index, cell);
        }
    }

    function createRuntimeFromBoardSource(runtime, source) {
        const clonedSlots = runtime.slots;
        clonedSlots.core.board = source;
        return runtimeApi.createRuntime3D(clonedSlots);
    }

    function resolveLevelTarget(state, target) {
        const levels = state && state.levels || [];
        const sections = state && state.sections || [];
        if (typeof target === "number")
            return resolveNumericLevelTarget(target, sections);
        const numeric = Number(target);
        if (Number.isInteger(numeric))
            return resolveNumericLevelTarget(numeric, sections);
        const lowered = String(target).toLowerCase();
        const index = levels.findIndex(level => {
            return String(level.title || "").toLowerCase() === lowered
                || String(level.section || "").toLowerCase() === lowered;
        });
        if (index >= 0)
            return index;
        throw new Error(`Unknown 3D session level target: ${target}`);
    }

    function resolveNumericLevelTarget(target, sections) {
        if (target >= 0) {
            const section = sections && sections[target];
            if (!section || !Number.isInteger(section.firstLevel))
                throw new Error(`Unknown 3D session section target: ${target}`);
            return section.firstLevel;
        }
        return -1 - target;
    }

    function snapshotSessionState(session) {
        return {
            levelIndex: session.levelIndex,
            won: session.won,
            completed: session.completed,
            hasCheckpoint: !!session.checkpointSource,
            backupCount: session.backups ? session.backups.length : 0,
            linkDepth: session.linkStack ? session.linkStack.length : 0
        };
    }

    function initialOldFlickScreenDat3D(metadata, board) {
        const meta = metadata || {};
        const viewport = meta.flickscreen !== undefined
            ? meta.flickscreen
            : meta.zoomscreen !== undefined
                ? meta.zoomscreen
                : meta.smoothscreen !== undefined && meta.smoothscreen.screenSize
                    ? [meta.smoothscreen.screenSize.width, meta.smoothscreen.screenSize.height]
                    : null;
        if (!viewport)
            return [];
        const width = Math.min(positiveInteger(viewport[0], board.width), board.width);
        const depth = Math.min(positiveInteger(viewport[1], board.depth), board.depth);
        return [0, 0, width, depth];
    }

    function cloneOldFlickScreenDat(value) {
        return Array.isArray(value) ? value.slice() : [];
    }

    function positiveInteger(value, fallback) {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 ? number : fallback;
    }

    function anyBitsInCommon(a, b) {
        const left = a.data || a || [];
        const right = b.data || b || [];
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
            if ((left[i] & right[i]) !== 0)
                return true;
        }
        return false;
    }

    function objectNamesAtCell(cell, idDict) {
        const result = [];
        const data = cell.data || cell || [];
        for (let word = 0; word < data.length; word++) {
            let bits = data[word];
            for (let bit = 0; bit < 32; bit++) {
                if (bits & (1 << bit))
                    result.push(idDict[word * 32 + bit]);
            }
        }
        return result;
    }

    function createAndProcessTurn3D(state, inputDirection, options) {
        const runtime = createRuntimeFromState3D(state, options);
        return {
            runtime,
            turn: processTurn3D(runtime, inputDirection, options)
        };
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

    function getTurnApi() {
        if (typeof require === "function") {
            try {
                return require("./turn3d.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.Turn3D;
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

    function getAgainLoopApi() {
        if (typeof require === "function") {
            try {
                return require("./again_loop.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.AgainLoop;
    }

    function getSessionRuntimeApi() {
        if (typeof require === "function") {
            try {
                return require("./session_runtime.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.SessionRuntime;
    }

    const GameRuntime3D = {
        createRuntimeFromState3D,
        rebuildSessionFromState3D,
        processTurn3D,
        createSessionFromState3D,
        processSessionTurn3D,
        applySessionArtifacts3D,
        advanceSessionLevelItem3D,
        createAndProcessTurn3D
    };

    root.GameRuntime3D = GameRuntime3D;
    if (typeof module !== "undefined" && module.exports)
        module.exports = GameRuntime3D;
})(typeof window !== "undefined" ? window : this);
