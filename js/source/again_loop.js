(function(root) {
    "use strict";

    function runAgainLoop(options) {
        const opts = options || {};
        const turns = [];
        let turn = runTurn(opts, opts.inputDirection, { again: false });
        turns.push(turn);
        let tailPlan = afterTurn(opts, turn, opts.inputDirection);
        let againCount = 0;

        while (shouldRunAgain(opts, tailPlan, turn)) {
            againCount++;
            if (againCount > (opts.maxAgainIterations || 100))
                throw new Error(opts.loopLimitMessage || "Again processing exceeded the iteration limit.");
            if (opts.canAgainChange && !opts.canAgainChange(turn, tailPlan))
                break;

            turn = runTurn(opts, null, { again: true });
            turns.push(turn);
            tailPlan = afterTurn(opts, turn, null);
        }

        return {
            turn,
            turns,
            tailPlan
        };
    }

    function runTurn(options, inputDirection, context) {
        if (!options.runTurn)
            throw new Error("Again loop requires a runTurn hook.");
        return options.runTurn(inputDirection, context || {});
    }

    function afterTurn(options, turn, inputDirection) {
        if (!options.afterTurn)
            return null;
        return options.afterTurn(turn, inputDirection);
    }

    function shouldRunAgain(options, tailPlan, turn) {
        if (options.shouldRunAgain)
            return options.shouldRunAgain(tailPlan, turn);
        return !!(tailPlan && tailPlan.againRequested);
    }

    function evaluateNoInputAgainProbe(options) {
        const opts = options || {};
        if (!opts.runProbe)
            throw new Error("Again probe requires a runProbe hook.");
        if (!opts.planSessionTail)
            throw new Error("Again probe requires a planSessionTail hook.");
        if (!opts.boardChanged)
            throw new Error("Again probe requires a boardChanged hook.");

        const probe = opts.runProbe();
        if (opts.boardChanged(probe))
            return true;

        const plan = opts.planSessionTail(probe, {
            modified: false,
            winning: false,
            solving: opts.solving,
            dontDoWin: opts.dontDoWin
        });
        return sessionTailWouldChangeTurn(plan);
    }

    function sessionTailWouldChangeTurn(plan) {
        if (!plan)
            return false;
        if (plan.checkpointRequested || plan.againRequested)
            return false;
        if (plan.winRequested)
            return true;
        if (!plan.terminalAction)
            return false;
        return plan.terminalAction.type !== "cancel" || !!plan.terminalAction.commandsLeft;
    }

    const AgainLoop = {
        runAgainLoop,
        evaluateNoInputAgainProbe,
        sessionTailWouldChangeTurn
    };

    root.AgainLoop = AgainLoop;
    if (typeof module !== "undefined" && module.exports)
        module.exports = AgainLoop;
})(typeof window !== "undefined" ? window : this);
