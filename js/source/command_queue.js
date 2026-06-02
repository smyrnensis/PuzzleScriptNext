(function(root) {
    "use strict";

    function createCommandState(options) {
        const opts = options || {};
        return {
            queue: opts.queue || [],
            sourceRules: opts.sourceRules || [],
            messageText: opts.messageText || "",
            statusText: opts.statusText || "",
            gosubTarget: opts.gosubTarget === undefined ? -1 : opts.gosubTarget,
            logs: opts.logs || []
        };
    }

    function queueCommands(commandState, rule, options) {
        const opts = options || {};
        const commands = rule && rule.commands || [];
        if (!commandState || commands.length === 0)
            return commandState;

        if (opts.onCommandCount)
            opts.onCommandCount(commands.length);

        const preexistingCancel = commandState.queue.indexOf("cancel") >= 0;
        const preexistingRestart = commandState.queue.indexOf("restart") >= 0;
        let currentRuleCancel = false;
        let currentRuleRestart = false;

        for (const command of commands) {
            if (command[0] === "cancel")
                currentRuleCancel = true;
            else if (command[0] === "restart")
                currentRuleRestart = true;
        }

        if (preexistingCancel)
            return commandState;
        if (preexistingRestart && !currentRuleCancel)
            return commandState;

        if (currentRuleCancel || currentRuleRestart) {
            commandState.queue.length = 0;
            commandState.sourceRules.length = 0;
            commandState.messageText = "";
            commandState.statusText = "";
        }

        for (const command of commands) {
            const name = command[0];
            if (name === "log") {
                commandState.logs.push({ message: command[1], rule });
                if (opts.onLog)
                    opts.onLog(command[1], rule);
                continue;
            }

            if (commandState.queue.indexOf(name) >= 0)
                continue;

            if (name === "gosub") {
                commandState.gosubTarget = command[1];
                continue;
            }

            commandState.queue.push(name);
            commandState.sourceRules.push(rule);

            if (opts.onQueued)
                opts.onQueued(command, rule);

            if (name === "message") {
                commandState.messageText = command[1];
            } else if (name === "goto") {
                commandState.queue.pop();
                commandState.queue.push(`${name},${command[1]}`);
            } else if (name === "status") {
                commandState.statusText = command[1];
            }
        }

        return commandState;
    }

    function hasCommandArtifacts(commandState) {
        return !!commandState && (
            commandState.queue.length > 0
            || commandState.logs.length > 0
            || commandState.gosubTarget !== -1
            || commandState.messageText.length > 0
            || commandState.statusText.length > 0
        );
    }

    function collectSessionArtifacts(commandState, options) {
        const opts = options || {};
        const queue = commandState && commandState.queue || [];
        const messageText = commandState && commandState.messageText || opts.messageText || "";
        const statusText = commandState && commandState.statusText || opts.statusText || "";
        const gotoCommand = queue.find(command => typeof command === "string" && command.startsWith("goto,"));
        const simpleSoundCommands = queue.filter(command => /^sfx\d+$/i.test(command));

        return {
            queue: queue.slice(),
            messageText,
            statusText,
            gotoTarget: gotoCommand ? gotoCommand.substr(5) : null,
            gosubTarget: commandState && commandState.gosubTarget !== undefined ? commandState.gosubTarget : -1,
            logs: commandState && commandState.logs ? commandState.logs.slice() : [],
            simpleSoundCommands,
            messageRequested: queue.indexOf("message") >= 0,
            statusRequested: queue.indexOf("status") >= 0,
            winRequested: queue.indexOf("win") >= 0,
            againRequested: queue.indexOf("again") >= 0,
            restartRequested: queue.indexOf("restart") >= 0,
            checkpointRequested: queue.indexOf("checkpoint") >= 0,
            cancelRequested: queue.indexOf("cancel") >= 0,
            undoRequested: queue.indexOf("undo") >= 0,
            quitRequested: queue.indexOf("quit") >= 0,
            nosaveRequested: queue.indexOf("nosave") >= 0,
            linkRequested: queue.indexOf("link") >= 0
        };
    }

    function planSessionTail(artifacts, options) {
        const opts = options || {};
        const data = artifacts || {};
        const queue = data.queue || [];
        const plan = {
            terminalAction: null,
            saveBackup: !(queue.indexOf("nosave") >= 0 && !opts.winning),
            checkpointRequested: false,
            againRequested: false,
            winRequested: false,
            messageRequested: !!data.messageRequested,
            statusRequested: !!data.statusRequested,
            simpleSoundCommands: data.simpleSoundCommands || []
        };

        if (data.undoRequested || queue.indexOf("undo") >= 0) {
            plan.terminalAction = { type: "undo" };
            return plan;
        }

        const gotoTarget = data.gotoTarget !== undefined ? data.gotoTarget : gotoTargetFromQueue(queue);
        if (gotoTarget !== null && gotoTarget !== undefined) {
            plan.terminalAction = { type: "goto", target: gotoTarget };
            return plan;
        }

        if (data.linkRequested || queue.indexOf("link") >= 0) {
            plan.terminalAction = { type: "link" };
            return plan;
        }

        if (data.cancelRequested || queue.indexOf("cancel") >= 0) {
            plan.terminalAction = {
                type: "cancel",
                commandsLeft: queue.length > 1
            };
            return plan;
        }

        if (data.restartRequested || queue.indexOf("restart") >= 0) {
            plan.terminalAction = { type: "restart" };
            return plan;
        }

        if ((data.quitRequested || queue.indexOf("quit") >= 0) && !opts.solving) {
            plan.terminalAction = { type: "quit" };
            return plan;
        }

        if (!opts.dontDoWin && (data.winRequested || queue.indexOf("win") >= 0)) {
            plan.winRequested = true;
            return plan;
        }

        if (!opts.winning && (data.checkpointRequested || queue.indexOf("checkpoint") >= 0))
            plan.checkpointRequested = true;

        if (!opts.winning && opts.modified && (data.againRequested || queue.indexOf("again") >= 0))
            plan.againRequested = true;

        return plan;
    }

    function gotoTargetFromQueue(queue) {
        const gotoCommand = queue.find(command => typeof command === "string" && command.startsWith("goto,"));
        return gotoCommand ? gotoCommand.substr(5) : null;
    }

    const CommandQueue = {
        createCommandState,
        queueCommands,
        hasCommandArtifacts,
        collectSessionArtifacts,
        planSessionTail
    };

    root.CommandQueue = CommandQueue;
    if (typeof module !== "undefined" && module.exports)
        module.exports = CommandQueue;
})(typeof window !== "undefined" ? window : this);
