(function(root) {
    "use strict";

    function arrangeRulesByGroupNumber(rules, options) {
        const opts = options || {};
        const normal = {};
        const late = {};

        for (let i = 0; i < (rules || []).length; i++) {
            const rule = rules[i];
            const target = isLateRule(rule, opts) ? late : normal;
            const groupNumber = getGroupNumber(rule, opts);
            if (target[groupNumber] === undefined)
                target[groupNumber] = [];
            target[groupNumber].push(rule);
        }

        return {
            groups: groupedObjectToList(normal, opts),
            lateGroups: groupedObjectToList(late, opts)
        };
    }

    function groupRulesByGroupNumber(rules, options) {
        const opts = options || {};
        const groups = {};
        for (let i = 0; i < (rules || []).length; i++) {
            const rule = rules[i];
            const groupNumber = getGroupNumber(rule, opts);
            if (groups[groupNumber] === undefined)
                groups[groupNumber] = [];
            groups[groupNumber].push(rule);
        }
        return groupedObjectToList(groups, opts);
    }

    function groupedObjectToList(groups, options) {
        const opts = options || {};
        const result = [];
        for (const groupNumber in groups) {
            if (Object.hasOwn(groups, groupNumber)) {
                const ruleGroup = groups[groupNumber];
                discardOverlappingRules(ruleGroup, opts);
                if (ruleGroup.length > 0)
                    result.push(ruleGroup);
            }
        }
        return result;
    }

    function discardOverlappingRules(ruleGroup, options) {
        const opts = options || {};
        if (!ruleGroup || ruleGroup.length === 0)
            return;

        const discards = [];
        for (let i = 0; i < ruleGroup.length; i++) {
            const rule = ruleGroup[i];
            const discard = getDiscard(rule, opts);
            if (!discard)
                continue;

            const beforesame = i === 0 ? false : getLineNumber(ruleGroup[i - 1], opts) === getLineNumber(rule);
            const aftersame = i === (ruleGroup.length - 1) ? false : getLineNumber(ruleGroup[i + 1], opts) === getLineNumber(rule);

            ruleGroup.splice(i, 1);

            let found = false;
            for (let j = 0; j < discards.length; j++) {
                if (discards[j][0] === discard[0] && discards[j][1] === discard[1]) {
                    found = true;
                    break;
                }
            }
            if (!found)
                discards.push(discard);

            if (!(beforesame || aftersame) || ruleGroup.length === 0)
                reportDiscardedRule(rule, discards, opts);
            i--;
        }
    }

    function reportDiscardedRule(rule, discards, options) {
        const opts = options || {};
        if (!opts.onError || discards.length === 0)
            return;

        const example = discards[0];
        let parenthetical = "";
        if (discards.length > 1) {
            parenthetical = " (ditto for ";
            for (let j = 1; j < discards.length; j++) {
                if (j > 1) {
                    parenthetical += ", ";
                    if (j === discards.length - 1)
                        parenthetical += "and ";
                }

                const thisDiscard = discards[j];
                parenthetical += `${thisDiscard[0]}/${thisDiscard[1]}`;

                if (j === 3 && discards.length > 4) {
                    parenthetical += " etc.";
                    break;
                }
            }
            parenthetical += ")";
        }

        opts.onError(`${example[0]} and ${example[1]} can never overlap${parenthetical}, but this rule requires that to happen, so it's being culled.`, getLineNumber(rule, opts));
    }

    function isLateRule(rule, options) {
        options = options || {};
        return options.isLate ? options.isLate(rule) : !!(rule && rule.late);
    }

    function getGroupNumber(rule, options) {
        options = options || {};
        return options.getGroupNumber ? options.getGroupNumber(rule) : rule.groupNumber;
    }

    function getLineNumber(rule, options) {
        options = options || {};
        return options.getLineNumber ? options.getLineNumber(rule) : rule.lineNumber;
    }

    function getDiscard(rule, options) {
        options = options || {};
        return options.getDiscard ? options.getDiscard(rule) : rule.discard;
    }

    const RuleGrouping = {
        arrangeRulesByGroupNumber,
        groupRulesByGroupNumber,
        discardOverlappingRules
    };

    root.RuleGrouping = RuleGrouping;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RuleGrouping;
})(typeof window !== "undefined" ? window : this);
