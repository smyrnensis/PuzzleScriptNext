(function(root) {
    "use strict";

    const ruleGroupingApi = getRuleGroupingApi();

    function finalizeRuleRuntime(options) {
        const opts = options || {};
        const groups = groupRules(opts.normalRules || [], opts);
        const lateGroups = groupRules(opts.lateRules || [], opts);
        const subroutines = opts.subroutines ? opts.subroutines.slice() : [];
        const loops = generateLoopPoints(opts.loops || [], groups, lateGroups, opts);

        if (opts.fixUpGosubs) {
            opts.fixUpGosubs(groups, subroutines);
            opts.fixUpGosubs(lateGroups, subroutines);
        }

        const rigid = buildRigidGroupState(groups, opts);

        return {
            groups,
            lateGroups,
            loopPoint: loops.loopPoint,
            lateLoopPoint: loops.lateLoopPoint,
            subroutines,
            rigidGroups: rigid.rigidGroups,
            rigidGroupIndexToGroupIndex: rigid.rigidGroupIndexToGroupIndex,
            groupNumberToRigidGroupIndex: rigid.groupNumberToRigidGroupIndex,
            groupIndexToRigidGroupIndex: rigid.groupIndexToRigidGroupIndex,
            finalization: {
                ruleContract: opts.ruleContract || "runtime.rules"
            },
            inactive2DRuntimeProjection: {
                rules: [],
                lateRules: [],
                rigidGroups: [],
                loopPoint: {},
                lateLoopPoint: {}
            }
        };
    }

    function projectFinalizedRuntime(finalized, options) {
        const opts = options || {};
        const result = {
            runtimeRules: {
                groups: finalized.groups,
                lateGroups: finalized.lateGroups,
                loopPoint: finalized.loopPoint,
                lateLoopPoint: finalized.lateLoopPoint,
                subroutines: finalized.subroutines,
                finalization: finalized.finalization
            },
            rigidState: {
                rigidGroups: finalized.rigidGroups,
                rigidGroupIndexToGroupIndex: finalized.rigidGroupIndexToGroupIndex,
                groupNumberToRigidGroupIndex: finalized.groupNumberToRigidGroupIndex,
                groupIndexToRigidGroupIndex: finalized.groupIndexToRigidGroupIndex
            },
            inactive2DRuntimeProjection: cloneInactive2DRuntimeProjection(finalized.inactive2DRuntimeProjection)
        };
        if (opts.ruleContract)
            result.runtimeRules.finalization = Object.assign({}, result.runtimeRules.finalization, {
                ruleContract: opts.ruleContract
            });
        return result;
    }

    function cloneInactive2DRuntimeProjection(projection) {
        const source = projection || {};
        return {
            rules: (source.rules || []).slice(),
            lateRules: (source.lateRules || []).slice(),
            rigidGroups: (source.rigidGroups || []).slice(),
            loopPoint: Object.assign({}, source.loopPoint || {}),
            lateLoopPoint: Object.assign({}, source.lateLoopPoint || {})
        };
    }

    function groupRules(rules, options) {
        const opts = options || {};
        const groupFn = opts.groupRulesByGroupNumber
            || ruleGroupingApi && ruleGroupingApi.groupRulesByGroupNumber;
        if (!groupFn)
            throw new Error("Rule finalization requires a groupRulesByGroupNumber implementation.");
        return groupFn(rules || [], {
            onError: opts.onError
        });
    }

    function generateLoopPoints(loops, groups, lateGroups, options) {
        validateLoopMarkers(loops || [], options);
        return {
            loopPoint: generateLoopPointForGroupList(loops || [], groups || [], {
                warnMidRule: true,
                omitEmptyLoops: true,
                onWarning: options && options.onWarning
            }),
            lateLoopPoint: generateLoopPointForGroupList(loops || [], lateGroups || [], {
                warnMidRule: false,
                omitEmptyLoops: false
            })
        };
    }

    function validateLoopMarkers(loops, options) {
        const opts = options || {};
        if (!loops || loops.length === 0)
            return;

        for (let i = 0; i < loops.length; i++) {
            const loop = loops[i];
            if (i % 2 === 0) {
                if (loop[1] === -1)
                    reportError(opts, "Found an ENDLOOP, but I'm not in a loop?", loop[0]);
            } else {
                if (loop[1] === 1)
                    reportError(opts, "Found a STARTLOOP, but I'm already inside a loop? (Puzzlescript can't nest loops, FWIW).", loop[0]);
            }
        }
        const lastloop = loops[loops.length - 1];
        if (lastloop[1] !== -1)
            reportError(opts, "Yo I found a STARTLOOP without a corresponding ENDLOOP.", lastloop[0]);
    }

    function generateLoopPointForGroupList(loops, groups, options) {
        const opts = options || {};
        const loopPoint = {};
        let outside = true;
        let target = 0;

        for (let j = 0; j < (loops || []).length; j++) {
            const loop = loops[j];
            for (let i = 0; i < (groups || []).length; i++) {
                const ruleGroup = groups[i];
                const firstRule = ruleGroup[0];
                const lastRule = ruleGroup[ruleGroup.length - 1];
                const firstRuleLine = firstRule.lineNumber;
                const lastRuleLine = lastRule.lineNumber;

                if (opts.warnMidRule && loop[0] >= firstRuleLine && loop[0] <= lastRuleLine)
                    reportWarning(opts, "Found a loop point in the middle of a rule. You probably don't want to do this, right?", loop[0]);

                if (outside) {
                    if (firstRuleLine >= loop[0]) {
                        target = i;
                        outside = false;
                        break;
                    }
                } else {
                    if (firstRuleLine >= loop[0]) {
                        const source = i - 1;
                        if (!opts.omitEmptyLoops || source >= target)
                            loopPoint[source] = target;
                        outside = true;
                        break;
                    }
                }
            }
        }

        if (outside === false)
            loopPoint[(groups || []).length] = target;
        return loopPoint;
    }

    function buildRigidGroupState(groups, options) {
        const opts = options || {};
        const rigidGroupIndexToGroupIndex = [];
        const groupIndexToRigidGroupIndex = [];
        const groupNumberToRigidGroupIndex = [];
        const rigidGroups = [];

        for (let groupIndex = 0; groupIndex < (groups || []).length; groupIndex++) {
            const ruleset = groups[groupIndex];
            const rigidFound = ruleset.some(rule => isRigidRule(rule, opts));
            rigidGroups[groupIndex] = rigidFound;
            if (rigidFound) {
                const groupNumber = getGroupNumber(ruleset[0], opts);
                const rigidGroupIndex = rigidGroupIndexToGroupIndex.length;
                groupIndexToRigidGroupIndex[groupIndex] = rigidGroupIndex;
                groupNumberToRigidGroupIndex[groupNumber] = rigidGroupIndex;
                rigidGroupIndexToGroupIndex.push(groupIndex);
            }
        }

        if (rigidGroupIndexToGroupIndex.length > 30) {
            const groupIndex = rigidGroupIndexToGroupIndex[30];
            const rule = groups[groupIndex][0];
            reportError(opts, "There can't be more than 30 rigid groups (rule groups containing rigid members).", rule.lineNumber);
        }

        return {
            rigidGroups,
            rigidGroupIndexToGroupIndex,
            groupNumberToRigidGroupIndex,
            groupIndexToRigidGroupIndex
        };
    }

    function isRigidRule(rule, options) {
        return options.isRigid ? options.isRigid(rule) : !!(rule && (rule.isRigid || rule.rigid));
    }

    function getGroupNumber(rule, options) {
        return options.getGroupNumber ? options.getGroupNumber(rule) : rule.groupNumber;
    }

    function reportError(options, message, lineNumber) {
        if (options.onError)
            options.onError(message, lineNumber);
    }

    function reportWarning(options, message, lineNumber) {
        if (options.onWarning)
            options.onWarning(message, lineNumber);
    }

    function getRuleGroupingApi() {
        if (typeof require === "function") {
            try {
                return require("./rule_grouping.js");
            } catch (err) {
                // Browser builds provide the API on the global object instead.
            }
        }
        return root.RuleGrouping;
    }

    const RuleFinalization = {
        finalizeRuleRuntime,
        projectFinalizedRuntime,
        generateLoopPoints,
        generateLoopPointForGroupList,
        validateLoopMarkers,
        buildRigidGroupState
    };

    root.RuleFinalization = RuleFinalization;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleFinalization;
})(typeof window !== "undefined" ? window : this);
