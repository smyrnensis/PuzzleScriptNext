(function(root) {
    "use strict";

    const randomRuleGroupsApi = getRandomRuleGroupsApi();

    function applyRuleGroup(level, ruleGroup, options) {
        const opts = options || {};
        const rules = Array.isArray(ruleGroup) ? ruleGroup : [ruleGroup];

        if (rules[0] && isRandomRuleGroup(rules, opts)) {
            const changed = applyRandomRuleGroup(level, rules, opts);
            return {
                returnValue: changed,
                changed,
                loopPropagated: false,
                random: true
            };
        }

        let loopPropagated = false;
        let propagated = true;
        let changed = false;
        let loopCount = 0;
        let nothingHappenedCounter = -1;
        const maxIterations = opts.maxIterations || 200;

        while (propagated) {
            loopCount++;
            if (loopCount > maxIterations) {
                if (opts.onIterationLimit)
                    opts.onIterationLimit(rules[0], loopCount);
                break;
            }
            propagated = false;

            for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
                const rule = rules[ruleIndex];
                const ruleChanged = applyRule(level, rule, opts, ruleIndex);
                if (ruleChanged) {
                    changed = true;
                    if (!isOnce(rule, opts))
                        propagated = true;
                    nothingHappenedCounter = 0;
                } else {
                    nothingHappenedCounter++;
                }
                if (nothingHappenedCounter === rules.length)
                    break;
            }

            if (propagated) {
                loopPropagated = true;
                if (opts.onPropagatedIteration)
                    opts.onPropagatedIteration(level, rules, loopCount);
            }
        }

        return {
            returnValue: loopPropagated,
            changed,
            loopPropagated,
            random: false
        };
    }

    function applyRuleSequence(level, groups, loopPoint, subroutines, startGroupIndex, options) {
        const opts = options || {};
        const ruleGroups = groups || [];
        const loops = loopPoint || {};
        const subs = subroutines || [];
        const bannedGroup = opts.bannedGroup;
        const start = startGroupIndex || 0;
        const gosubStack = [];
        let loopPropagated = start > 0;
        let loopCount = 0;
        let returnValue = false;
        let changed = false;
        let groupIndex = start;
        let endIndex = findEnd(ruleGroups, subs, groupIndex);

        if (opts.onStart)
            opts.onStart(level, ruleGroups, start);

        while (groupIndex < endIndex) {
            if (!bannedGroup || !bannedGroup[groupIndex]) {
                const group = ruleGroups[groupIndex];
                const result = normalizeGroupResult(applySequenceRuleGroup(level, group, opts, groupIndex));
                loopPropagated = result.returnValue || loopPropagated;
                returnValue = result.returnValue || returnValue;
                changed = result.changed || changed;
            }

            if (loopPropagated && loops[groupIndex] >= 0) {
                if (checkLoop())
                    break;
            } else {
                const gosubTarget = getGosubTarget(opts);
                if (gosubTarget >= 0) {
                    gosubStack.push(groupIndex);
                    if (opts.onGosub)
                        opts.onGosub(level, ruleGroups, groupIndex, gosubTarget);
                    groupIndex = gosubTarget;
                    endIndex = findEnd(ruleGroups, subs, groupIndex);
                    clearGosubTarget(opts);
                } else {
                    groupIndex++;
                    if (groupIndex === endIndex && loopPropagated && loops[groupIndex] >= 0) {
                        if (checkLoop())
                            break;
                    }

                    while (groupIndex === endIndex && gosubStack.length > 0) {
                        const returnIndex = gosubStack.pop();
                        if (opts.onGosubReturn)
                            opts.onGosubReturn(level, ruleGroups, returnIndex);
                        groupIndex = returnIndex;
                        endIndex = findEnd(ruleGroups, subs, groupIndex);
                        groupIndex++;
                    }
                }
            }

            if (opts.onAfterGroup)
                opts.onAfterGroup(level, ruleGroups, groupIndex);
        }

        return {
            returnValue,
            changed,
            loopPropagated: returnValue
        };

        function checkLoop() {
            groupIndex = loops[groupIndex];
            loopPropagated = false;
            loopCount++;
            if (loopCount > (opts.maxLoopIterations || 200)) {
                if (opts.onLoopLimit)
                    opts.onLoopLimit(ruleGroups[groupIndex], loopCount);
                return true;
            }
            return false;
        }
    }

    function findEnd(groups, subroutines, start) {
        let result = -1;
        if (start < groups.length) {
            const startGroup = groups[start];
            const startLine = startGroup && startGroup[0] && startGroup[0].lineNumber;
            const subIndex = subroutines.findIndex(subroutine => subroutine.lineNumber > startLine);
            if (subIndex !== -1)
                result = groups.findIndex(group => group[0] && group[0].lineNumber >= subroutines[subIndex].lineNumber);
        }
        return result === -1 ? groups.length : result;
    }

    function applySequenceRuleGroup(level, group, opts, groupIndex) {
        if (opts.applyRuleGroup)
            return opts.applyRuleGroup(level, group, groupIndex);
        return applyRuleGroup(level, group, opts);
    }

    function normalizeGroupResult(result) {
        if (typeof result === "boolean")
            return { returnValue: result, changed: result };
        return {
            returnValue: !!(result && result.returnValue),
            changed: !!(result && result.changed)
        };
    }

    function getGosubTarget(opts) {
        if (opts.getGosubTarget)
            return opts.getGosubTarget();
        return opts.gosubTarget === undefined ? -1 : opts.gosubTarget;
    }

    function clearGosubTarget(opts) {
        if (opts.clearGosubTarget) {
            opts.clearGosubTarget();
            return;
        }
        opts.gosubTarget = -1;
    }

    function isRandomRuleGroup(rules, opts) {
        if (opts.isRandomRuleGroup)
            return opts.isRandomRuleGroup(rules);
        return !!(rules[0] && (rules[0].isRandom || rules[0].randomRule));
    }

    function applyRandomRuleGroup(level, rules, opts) {
        if (opts.applyRandomRuleGroup)
            return opts.applyRandomRuleGroup(level, rules, opts);
        return randomRuleGroupsApi.applyRandomRuleGroup(level, rules, opts);
    }

    function applyRule(level, rule, opts, ruleIndex) {
        if (opts.applyRule)
            return opts.applyRule(level, rule, ruleIndex);
        return rule.tryApply(level);
    }

    function isOnce(rule, opts) {
        if (opts.isOnce)
            return opts.isOnce(rule);
        return !!rule.isOnce;
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

    const RuleGroups = {
        applyRuleGroup,
        applyRuleSequence
    };

    root.RuleGroups = RuleGroups;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleGroups;
})(typeof window !== "undefined" ? window : this);
