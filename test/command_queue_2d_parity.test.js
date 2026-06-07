const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const commandQueue = require("../src/js/command_queue.js");

function load2DCommandQueueOracle() {
    const enginePath = path.join(__dirname, "../src/js/engine.js");
    let source = fs.readFileSync(enginePath, "utf8");

    // The title-screen bootstrap is unrelated to Rule.queueCommands and pulls in
    // browser/UI globals. Leave the production source untouched, but skip that
    // bootstrap in the VM oracle.
    source = source.replace("\ngenerateTitleScreen();\nif (titleMode>0){", "\nif (titleMode>0){");
    source = source.replace("\ncanvasResize();\n\nfunction tryPlaySimpleSound", "\nfunction tryPlaySimpleSound");

    const logs = [];
    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        Event: function Event(name) { this.type = name; },
        RNG: function RNG() { this.uniform = function() { return 0; }; },
        document: {
            URL: "test://command-queue",
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
        curLevelNo: 0,
        curlevelTarget: null,
        solvedSections: [],
        storage_has: function() { return false; },
        storage_get: function() { return null; },
        storage_set: function() {},
        consolePrint: function() {},
        consolePrintFromRule: function(message, rule) {
            logs.push({ message, lineNumber: rule && rule.lineNumber });
        },
        addToDebugTimeline: function() { return 0; },
        htmlColor: function(_color, text) { return text; },
        htmlJump: function(lineNumber) { return String(lineNumber); },
        canvasResize: function() {},
        tryLoadCustomFont: function() {},
        isSitelocked: function() { return false; },
        fillRange: function(start, end) {
            const result = [];
            for (let i = start; i < end; i++)
                result.push(i);
            return result;
        },
        fillAndHighlight: function(screen) { return screen; },
        deepClone: function(value) {
            return value == null ? value : JSON.parse(JSON.stringify(value));
        },
        twiddleMetaData: function() {},
        initSmoothCamera: function() {},
        regenSpriteImages: function() {},
        twiddleable_params: [],
        CommandQueue: commandQueue
    };

    const hooks = `
module.exports.__commandQueueOracle = {
    makeRule: function(commands, lineNumber) {
        var rule = Object.create(Rule.prototype);
        rule.commands = commands;
        rule.lineNumber = lineNumber;
        return rule;
    },
    reset: function(options) {
        options = options || {};
        curLevel = {
            commandQueue: options.queue ? options.queue.slice() : [],
            commandQueueSourceRules: options.sourceRules ? options.sourceRules.slice() : []
        };
        state = {
            metadata: options.metadata || {},
            default_metadata: options.defaultMetadata || {},
            sfx_Events: {},
            levels: [],
            sections: []
        };
        perfCounters = { commands: 0 };
        messagetext = options.messageText || "";
        statusText = options.statusText || "";
        gosubTarget = options.gosubTarget === undefined ? -1 : options.gosubTarget;
        verbose_logging = false;
        __commandQueueLogs.length = 0;
    },
    queue: function(rule) {
        rule.queueCommands();
    },
    snapshot: function() {
        return {
            queue: curLevel.commandQueue.slice(),
            sourceLineNumbers: curLevel.commandQueueSourceRules.map(function(rule) {
                return rule.lineNumber;
            }),
            messageText: messagetext,
            statusText: statusText,
            gosubTarget: gosubTarget,
            logs: __commandQueueLogs.slice(),
            commandCount: perfCounters.commands
        };
    },
    sessionArtifacts: function() {
        var queue = curLevel.commandQueue || [];
        var gotoCommand = queue.find(function(command) {
            return typeof command === "string" && command.startsWith("goto,");
        });
        return JSON.parse(JSON.stringify({
            queue: queue.slice(),
            messageText: messagetext,
            statusText: statusText,
            gotoTarget: gotoCommand ? gotoCommand.substr(5) : null,
            gosubTarget: gosubTarget,
            logs: __commandQueueLogs.slice(),
            simpleSoundCommands: queue.filter(function(command) {
                return /^sfx\\d+$/i.test(command);
            }),
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
        }));
    },
    tailPlanOracle: function(options) {
        options = options || {};
        var queue = options.queue || curLevel.commandQueue;
        var result = {
            terminalAction: null,
            saveBackup: !(queue.indexOf("nosave") >= 0 && !options.winning),
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        };

        if (queue.indexOf("undo") >= 0) {
            result.terminalAction = { type: "undo" };
            return result;
        }

        var gotoCommand = queue.find(function(command) {
            return typeof command === "string" && command.startsWith("goto,");
        });
        if (gotoCommand) {
            result.terminalAction = { type: "goto", target: gotoCommand.substr(5) };
            return result;
        }

        if (queue.indexOf("link") >= 0) {
            result.terminalAction = { type: "link" };
            return result;
        }

        if (queue.indexOf("cancel") >= 0) {
            result.terminalAction = {
                type: "cancel",
                commandsLeft: queue.length > 1
            };
            return result;
        }

        if (queue.indexOf("restart") >= 0) {
            result.terminalAction = { type: "restart" };
            return result;
        }

        if (queue.indexOf("quit") >= 0 && !options.solving) {
            result.terminalAction = { type: "quit" };
            return result;
        }

        if (!options.dontDoWin && queue.indexOf("win") >= 0) {
            result.winRequested = true;
            return result;
        }

        if (!options.winning && queue.indexOf("checkpoint") >= 0)
            result.checkpointRequested = true;

        if (!options.winning && queue.indexOf("again") >= 0 && options.modified)
            result.againRequested = true;

        return result;
    }
};
`;

    context.__commandQueueLogs = logs;
    vm.createContext(context);
    vm.runInContext(source + hooks, context, { filename: enginePath });
    return context.module.exports.__commandQueueOracle;
}

function makeSharedRunner() {
    let commandCount = 0;
    return {
        reset(options) {
            options = options || {};
            commandCount = 0;
            this.state = commandQueue.createCommandState({
                queue: options.queue ? options.queue.slice() : [],
                sourceRules: options.sourceRules ? options.sourceRules.slice() : [],
                messageText: options.messageText || "",
                statusText: options.statusText || "",
                gosubTarget: options.gosubTarget === undefined ? -1 : options.gosubTarget
            });
        },
        makeRule(commands, lineNumber) {
            return { commands, lineNumber };
        },
        queue(rule) {
            commandQueue.queueCommands(this.state, rule, {
                onCommandCount: function(count) {
                    commandCount += count;
                }
            });
        },
        snapshot() {
            return {
                queue: this.state.queue.slice(),
                sourceLineNumbers: this.state.sourceRules.map(function(rule) {
                    return rule.lineNumber;
                }),
                messageText: this.state.messageText,
                statusText: this.state.statusText,
                gosubTarget: this.state.gosubTarget,
                logs: this.state.logs.map(function(log) {
                    return {
                        message: log.message,
                        lineNumber: log.rule && log.rule.lineNumber
                    };
                }),
                commandCount
            };
        },
        sessionArtifacts() {
            return JSON.parse(JSON.stringify(commandQueue.collectSessionArtifacts(this.state)));
        },
        tailPlan(options) {
            options = options || {};
            const artifacts = commandQueue.collectSessionArtifacts({
                queue: options.queue || this.state.queue,
                messageText: this.state.messageText,
                statusText: this.state.statusText,
                gosubTarget: this.state.gosubTarget,
                logs: this.state.logs
            });
            const plan = commandQueue.planSessionTail(artifacts, options);
            return JSON.parse(JSON.stringify({
                terminalAction: plan.terminalAction,
                saveBackup: plan.saveBackup,
                checkpointRequested: plan.checkpointRequested,
                againRequested: plan.againRequested,
                winRequested: plan.winRequested
            }));
        }
    };
}

function runScenario(oracle, shared, scenario) {
    oracle.reset(scenario.initial);
    shared.reset(scenario.initial);

    scenario.rules.forEach(function(ruleSpec, index) {
        const lineNumber = ruleSpec.lineNumber || index + 1;
        oracle.queue(oracle.makeRule(ruleSpec.commands, lineNumber));
        shared.queue(shared.makeRule(ruleSpec.commands, lineNumber));
    });

    const sharedSnapshot = JSON.parse(JSON.stringify(shared.snapshot()));
    const oracleSnapshot = JSON.parse(JSON.stringify(oracle.snapshot()));

    assert.deepStrictEqual(sharedSnapshot, scenario.expected, `${scenario.name} shared expected`);
    assert.deepStrictEqual(oracleSnapshot, scenario.expected, `${scenario.name} 2D expected`);
    assert.deepStrictEqual(sharedSnapshot, oracleSnapshot, `${scenario.name} shared equals 2D`);

    if (scenario.expectedSessionArtifacts) {
        const sharedSession = shared.sessionArtifacts();
        const oracleSession = JSON.parse(JSON.stringify(oracle.sessionArtifacts()));
        assert.deepStrictEqual(sharedSession, scenario.expectedSessionArtifacts, `${scenario.name} shared session expected`);
        assert.deepStrictEqual(oracleSession, scenario.expectedSessionArtifacts, `${scenario.name} 2D session expected`);
        assert.deepStrictEqual(sharedSession, oracleSession, `${scenario.name} session shared equals 2D`);
    }

    if (scenario.expectedTailPlan) {
        const tailOptions = Object.assign({}, scenario.tailOptions || {});
        const sharedTail = shared.tailPlan(tailOptions);
        const oracleTail = JSON.parse(JSON.stringify(oracle.tailPlanOracle(tailOptions)));
        assert.deepStrictEqual(sharedTail, scenario.expectedTailPlan, `${scenario.name} shared tail expected`);
        assert.deepStrictEqual(oracleTail, scenario.expectedTailPlan, `${scenario.name} 2D tail expected`);
        assert.deepStrictEqual(sharedTail, oracleTail, `${scenario.name} tail shared equals 2D`);
    }
}

const scenarios = [
    {
        name: "empty commands are a no-op",
        rules: [{ commands: [] }],
        expected: {
            queue: [],
            sourceLineNumbers: [],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        }
    },
    {
        name: "queues normal commands and records source rules",
        rules: [{ commands: [["message", "hello"], ["status", "ready"], ["goto", "next"], ["win"]] }],
        expected: {
            queue: ["message", "status", "goto,next", "win"],
            sourceLineNumbers: [1, 1, 1, 1],
            messageText: "hello",
            statusText: "ready",
            gosubTarget: -1,
            logs: [],
            commandCount: 4
        },
        expectedSessionArtifacts: {
            queue: ["message", "status", "goto,next", "win"],
            messageText: "hello",
            statusText: "ready",
            gotoTarget: "next",
            gosubTarget: -1,
            logs: [],
            simpleSoundCommands: [],
            messageRequested: true,
            statusRequested: true,
            winRequested: true,
            againRequested: false,
            restartRequested: false,
            checkpointRequested: false,
            cancelRequested: false,
            undoRequested: false,
            quitRequested: false,
            nosaveRequested: false,
            linkRequested: false
        }
    },
    {
        name: "deduplicates ordinary repeated commands",
        rules: [{ commands: [["win"], ["win"], ["again"], ["again"]] }],
        expected: {
            queue: ["win", "again"],
            sourceLineNumbers: [1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 4
        }
    },
    {
        name: "goto keeps 2D comma payload queue shape",
        rules: [{ commands: [["goto", "a"], ["goto", "b"]] }],
        expected: {
            queue: ["goto,a", "goto,b"],
            sourceLineNumbers: [1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 2
        }
    },
    {
        name: "gosub is an artifact and is not queued",
        rules: [{ commands: [["gosub", "subroutine"]] }],
        expected: {
            queue: [],
            sourceLineNumbers: [],
            messageText: "",
            statusText: "",
            gosubTarget: "subroutine",
            logs: [],
            commandCount: 1
        }
    },
    {
        name: "log is an artifact and is not queued",
        rules: [{ commands: [["log", "trace"]] }],
        expected: {
            queue: [],
            sourceLineNumbers: [],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [{ message: "trace", lineNumber: 1 }],
            commandCount: 1
        }
    },
    {
        name: "cancel clears existing queue and blocks later rules",
        rules: [
            { commands: [["message", "old"], ["status", "old"], ["win"]], lineNumber: 10 },
            { commands: [["cancel"]], lineNumber: 11 },
            { commands: [["restart"], ["message", "ignored"]], lineNumber: 12 }
        ],
        expected: {
            queue: ["cancel"],
            sourceLineNumbers: [11],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 6
        },
        expectedTailPlan: {
            terminalAction: { type: "cancel", commandsLeft: false },
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "restart clears existing queue and blocks later non-cancel rules",
        rules: [
            { commands: [["message", "old"], ["win"]], lineNumber: 20 },
            { commands: [["restart"]], lineNumber: 21 },
            { commands: [["status", "ignored"]], lineNumber: 22 }
        ],
        expected: {
            queue: ["restart"],
            sourceLineNumbers: [21],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 4
        },
        expectedTailPlan: {
            terminalAction: { type: "restart" },
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "cancel can override an earlier restart",
        rules: [
            { commands: [["restart"]], lineNumber: 30 },
            { commands: [["cancel"], ["message", "after cancel"]], lineNumber: 31 }
        ],
        expected: {
            queue: ["cancel", "message"],
            sourceLineNumbers: [31, 31],
            messageText: "after cancel",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 3
        },
        expectedTailPlan: {
            terminalAction: { type: "cancel", commandsLeft: true },
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "restart after cancel is ignored but still counted",
        rules: [
            { commands: [["cancel"]], lineNumber: 40 },
            { commands: [["restart"], ["message", "ignored"]], lineNumber: 41 }
        ],
        expected: {
            queue: ["cancel"],
            sourceLineNumbers: [40],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 3
        }
    },
    {
        name: "cancel and restart clear message and status but preserve gosub target",
        initial: { messageText: "old message", statusText: "old status", gosubTarget: "old-gosub" },
        rules: [{ commands: [["restart"]] }],
        expected: {
            queue: ["restart"],
            sourceLineNumbers: [1],
            messageText: "",
            statusText: "",
            gosubTarget: "old-gosub",
            logs: [],
            commandCount: 1
        }
    },
    {
        name: "preexisting cancel blocks all commands but still counts them",
        initial: {
            queue: ["cancel"],
            sourceRules: [{ lineNumber: 99 }],
            messageText: "kept message",
            statusText: "kept status"
        },
        rules: [{ commands: [["win"], ["message", "ignored"]] }],
        expected: {
            queue: ["cancel"],
            sourceLineNumbers: [99],
            messageText: "kept message",
            statusText: "kept status",
            gosubTarget: -1,
            logs: [],
            commandCount: 2
        }
    },
    {
        name: "tail priority chooses undo before goto and restart",
        initial: {
            queue: ["undo", "goto,next", "restart"],
            sourceRules: [{ lineNumber: 1 }, { lineNumber: 1 }, { lineNumber: 1 }]
        },
        rules: [],
        expected: {
            queue: ["undo", "goto,next", "restart"],
            sourceLineNumbers: [1, 1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        },
        expectedTailPlan: {
            terminalAction: { type: "undo" },
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "tail priority chooses goto before restart",
        initial: {
            queue: ["goto,next", "restart"],
            sourceRules: [{ lineNumber: 1 }, { lineNumber: 1 }]
        },
        rules: [],
        expected: {
            queue: ["goto,next", "restart"],
            sourceLineNumbers: [1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        },
        expectedTailPlan: {
            terminalAction: { type: "goto", target: "next" },
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "tail priority chooses link before cancel",
        initial: {
            queue: ["link", "cancel"],
            sourceRules: [{ lineNumber: 1 }, { lineNumber: 1 }]
        },
        rules: [],
        expected: {
            queue: ["link", "cancel"],
            sourceLineNumbers: [1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        },
        expectedTailPlan: {
            terminalAction: { type: "link" },
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "tail win suppresses checkpoint and again",
        initial: {
            queue: ["win", "checkpoint", "again"],
            sourceRules: [{ lineNumber: 1 }, { lineNumber: 1 }, { lineNumber: 1 }]
        },
        tailOptions: { modified: true },
        rules: [],
        expected: {
            queue: ["win", "checkpoint", "again"],
            sourceLineNumbers: [1, 1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        },
        expectedTailPlan: {
            terminalAction: null,
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: true
        }
    },
    {
        name: "tail dontDoWin suppresses win command like 2D checkWin",
        initial: {
            queue: ["win"],
            sourceRules: [{ lineNumber: 1 }]
        },
        tailOptions: { dontDoWin: true },
        rules: [],
        expected: {
            queue: ["win"],
            sourceLineNumbers: [1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        },
        expectedTailPlan: {
            terminalAction: null,
            saveBackup: true,
            checkpointRequested: false,
            againRequested: false,
            winRequested: false
        }
    },
    {
        name: "tail checkpoint and again require modified non-winning turn",
        initial: {
            queue: ["checkpoint", "again"],
            sourceRules: [{ lineNumber: 1 }, { lineNumber: 1 }]
        },
        tailOptions: { modified: true },
        rules: [],
        expected: {
            queue: ["checkpoint", "again"],
            sourceLineNumbers: [1, 1],
            messageText: "",
            statusText: "",
            gosubTarget: -1,
            logs: [],
            commandCount: 0
        },
        expectedTailPlan: {
            terminalAction: null,
            saveBackup: true,
            checkpointRequested: true,
            againRequested: true,
            winRequested: false
        }
    }
];

const oracle = load2DCommandQueueOracle();
const shared = makeSharedRunner();

scenarios.forEach(function(scenario) {
    runScenario(oracle, shared, scenario);
});

console.log("command queue 2D parity tests passed");
