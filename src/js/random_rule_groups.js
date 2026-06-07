(function(root) {
    "use strict";

    function generateTuples(lists) {
        let tuples = [[]];

        for (let i = 0; i < lists.length; i++) {
            const row = lists[i];
            const newTuples = [];
            for (let j = 0; j < row.length; j++) {
                const value = row[j];
                for (let k = 0; k < tuples.length; k++)
                    newTuples.push(tuples[k].concat([value]));
            }
            tuples = newTuples;
        }

        return tuples;
    }

    function collectRandomRuleMatches(ruleGroup, options) {
        const opts = options || {};
        const findMatches = opts.findMatches || function(rule) {
            return rule.findMatches();
        };
        const makeTuples = opts.generateTuples || generateTuples;
        const matches = [];

        for (let ruleIndex = 0; ruleIndex < ruleGroup.length; ruleIndex++) {
            const rule = ruleGroup[ruleIndex];
            const ruleMatches = findMatches(rule, ruleIndex);
            if (ruleMatches.length > 0) {
                const tuples = makeTuples(ruleMatches);
                for (let tupleIndex = 0; tupleIndex < tuples.length; tupleIndex++)
                    matches.push({ ruleIndex, tuple: tuples[tupleIndex] });
            }
        }

        return matches;
    }

    function chooseRandomRuleMatch(matches, uniform) {
        if (matches.length === 0)
            return null;
        const random = uniform || Math.random;
        return matches[Math.floor(random() * matches.length)];
    }

    function applyRandomRuleGroup(level, ruleGroup, options) {
        const opts = options || {};
        const matches = collectRandomRuleMatches(ruleGroup, opts);
        const selected = chooseRandomRuleMatch(matches, opts.uniform);

        if (!selected)
            return false;

        const rule = ruleGroup[selected.ruleIndex];
        const applyMatch = opts.applyMatch || function(targetLevel, targetRule, tuple) {
            const delta = targetLevel.delta_index(targetRule.direction);
            return targetRule.applyAt(targetLevel, tuple, false, delta);
        };
        const queueCommands = opts.queueCommands || function(targetRule) {
            targetRule.queueCommands();
        };

        const changed = applyMatch(level, rule, selected.tuple, selected.ruleIndex);
        queueCommands(rule, selected.ruleIndex, selected.tuple);
        return changed;
    }

    const RandomRuleGroups = {
        generateTuples,
        collectRandomRuleMatches,
        chooseRandomRuleMatch,
        applyRandomRuleGroup
    };

    root.RandomRuleGroups = RandomRuleGroups;
    if (typeof module !== "undefined" && module.exports)
        module.exports = RandomRuleGroups;
})(typeof window !== "undefined" ? window : this);
