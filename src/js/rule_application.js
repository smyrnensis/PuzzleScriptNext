(function(root) {
    "use strict";

    const commandQueueApi = getCommandQueueApi();
    const randomRuleGroupsApi = getRandomRuleGroupsApi();
    const ruleGroupsApi = getRuleGroupsApi();

    function applyRuleGroups(board, groups, options, commandState, bannedGroups, control, hooks) {
        const opts = options || {};
        const flow = control || {};
        const api = hooks || {};
        requireHook(api, "applyRuleGroup");
        return ruleGroupsApi.applyRuleSequence(board, groups || [], flow.loopPoint || {}, flow.subroutines || [], opts.startRuleGroupIndex || 0, {
            bannedGroup: bannedGroups,
            applyRuleGroup: function(targetBoard, group) {
                return api.applyRuleGroup(targetBoard, group, opts, commandState);
            },
            getGosubTarget: function() {
                return commandState.gosubTarget;
            },
            clearGosubTarget: function() {
                commandState.gosubTarget = -1;
            },
            maxLoopIterations: opts.maxLoopIterations || 200,
            onLoopLimit: function(ruleGroup) {
                if (opts.onLoopLimit)
                    opts.onLoopLimit(ruleGroup);
            }
        });
    }

    function applyRuleGroup(board, group, options, commandState, hooks) {
        const opts = options || {};
        const api = hooks || {};
        requireHook(api, "applyRule");
        const rules = Array.isArray(group) ? group : [group];
        return ruleGroupsApi.applyRuleGroup(board, rules, {
            maxIterations: opts.maxRuleIterations || 200,
            applyRandomRuleGroup: function(targetBoard, targetRules) {
                return applyRandomRuleGroup(targetBoard, targetRules, opts, commandState, api);
            },
            applyRule: function(targetBoard, rule) {
                return api.applyRule(targetBoard, rule, opts, commandState);
            },
            isOnce: function(rule) {
                return !!rule.isOnce;
            }
        });
    }

    function applyRandomRuleGroup(board, rules, options, commandState, hooks) {
        const opts = options || {};
        const api = hooks || {};
        requireHook(api, "findMatches");
        requireHook(api, "applyTupleReplacements");
        requireHook(api, "queueCommands");
        return randomRuleGroupsApi.applyRandomRuleGroup(board, rules, {
            uniform: board.uniform || Math.random,
            findMatches: function(rule) {
                return api.findMatches(board, rule, opts);
            },
            applyMatch: function(targetBoard, rule, tuple) {
                return api.applyTupleReplacements(targetBoard, tuple, rule);
            },
            queueCommands: function(rule) {
                api.queueCommands(commandState, rule, opts);
            }
        });
    }

    function applyRule(board, rule, options, commandState, hooks) {
        const opts = options || {};
        const api = hooks || {};
        if (!rule)
            return false;
        requireHook(api, "findMatches");
        requireHook(api, "applyTupleReplacements");
        requireHook(api, "queueCommands");
        const matches = api.findMatches(board, rule, opts);
        if (matches.length === 0)
            return false;

        let changed = false;
        const tuples = randomRuleGroupsApi.generateTuples(matches);
        for (let tupleIndex = 0; tupleIndex < tuples.length; tupleIndex++) {
            const tuple = tuples[tupleIndex];
            const shouldCheck = tupleIndex > 0;
            changed = api.applyTupleReplacements(board, tuple, rule, shouldCheck) || changed;
        }

        api.queueCommands(commandState, rule, opts);
        return changed;
    }

    function findRulePatternMatches(board, rule, options, hooks) {
        const api = hooks || {};
        requireHook(api, "findPatternMatches");
        const matches = [];
        for (const pattern of rule.patterns || []) {
            const patternMatches = api.findPatternMatches(board, pattern, rule, options || {});
            if (patternMatches.length === 0)
                return [];
            matches.push(patternMatches);
        }
        return matches;
    }

    function applyRuleTupleReplacements(board, tuple, rule, shouldCheck, hooks) {
        const api = hooks || {};
        requireHook(api, "applyMatchReplacements");
        if (shouldCheck) {
            requireHook(api, "isMatchStillValid");
            for (const match of tuple) {
                if (!api.isMatchStillValid(board, match))
                    return false;
            }
        }

        let changed = false;
        for (const match of tuple)
            changed = api.applyMatchReplacements(board, match, rule) || changed;
        return changed;
    }

    function queueRuleCommands(commandState, rule, options, hooks) {
        commandQueueApi.queueCommands(commandState, rule, hooks && hooks.commandQueueHooks
            ? hooks.commandQueueHooks(options)
            : undefined);
    }

    function buildRuleApplicationHooks(adapter) {
        const hooks = {};
        const api = adapter || {};

        hooks.applyRuleGroup = function(board, group, options, commandState) {
            return applyRuleGroup(board, group, options, commandState, hooks);
        };
        hooks.applyRule = function(board, rule, options, commandState) {
            return applyRule(board, rule, options, commandState, hooks);
        };
        hooks.findMatches = api.findMatches || function(board, rule, options) {
            return findRulePatternMatches(board, rule, options, hooks);
        };
        hooks.applyTupleReplacements = api.applyTupleReplacements || function(board, tuple, rule, shouldCheck) {
            return applyRuleTupleReplacements(board, tuple, rule, shouldCheck, hooks);
        };
        hooks.queueCommands = api.queueCommands || function(commandState, rule, options) {
            return queueRuleCommands(commandState, rule, options, api);
        };

        hooks.findPatternMatches = api.findPatternMatches;
        hooks.isMatchStillValid = api.isMatchStillValid;
        hooks.applyMatchReplacements = api.applyMatchReplacements;
        return hooks;
    }

    function requireHook(hooks, name) {
        if (typeof hooks[name] !== "function")
            throw new Error("Rule application requires a " + name + " hook.");
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

    function getRandomRuleGroupsApi() {
        if (typeof require === "function") {
            try {
                return require("./random_rule_groups.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RandomRuleGroups;
    }

    function getRuleGroupsApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_groups.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleGroups;
    }

    const RuleApplication = {
        applyRuleGroups,
        applyRuleGroup,
        applyRandomRuleGroup,
        applyRule,
        findRulePatternMatches,
        applyRuleTupleReplacements,
        queueRuleCommands,
        buildRuleApplicationHooks
    };

    root.RuleApplication = RuleApplication;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleApplication;
})(typeof window !== "undefined" ? window : this);
