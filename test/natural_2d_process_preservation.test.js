const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ORIGINAL_2D_COMMIT = "1347caa014461019721dfe82a49f357bc165d86c";
const ORIGINAL_2D_RUNTIME_FILES = [
    "src/js/engine.js"
];

const COMPILER_2D_PHASES = [
    compiler2DPhase("parse", "loadFile"),
    compiler2DPhase("metadata", "twiddleMetaData"),
    compiler2DPhase("objects", "generateExtraMembers"),
    compiler2DPhase("objects", "generateMasks"),
    compiler2DPhase("levels", "levelsToArray"),
    compiler2DPhase("rules", "processRuleString"),
    compiler2DPhase("rules", "rulesToArray"),
    compiler2DPhase("rules", "expandRulesWithPrefixes"),
    compiler2DPhase("rules", "expandRulesWithTags"),
    compiler2DPhase("rules", "expandRulesWithMultiDirectionObjects"),
    compiler2DPhase("rules", "expandRulesWithMultipleDirections"),
    compiler2DPhase("rules", "convertObjectsAndDirections"),
    compiler2DPhase("rules", "concretizePropertyRule"),
    compiler2DPhase("rules", "atomizeCellAggregates"),
    compiler2DPhase("rules", "rulesToMask"),
    compiler2DPhase("rules", "collapseRules"),
    compiler2DPhase("rules", "arrangeRulesByGroupNumber"),
    compiler2DPhase("rules", "generateRigidGroupList"),
    compiler2DPhase("rules", "cacheRuleStringRep"),
    compiler2DPhase("rules", "removeDuplicateRules"),
    compiler2DPhase("rules", "generateLoopPoints"),
    compiler2DPhase("win", "processWinConditions")
];

const DRIFT_CATEGORIES = {
    DIMENSION_ROUTING: "dimension-routing",
    SPATIAL_VOCABULARY_EXPANSION: "spatial-vocabulary-expansion",
    LOWER_CONTRACT_ORACLE: "lower-contract-oracle",
    SHARED_HELPER_EXTRACTION: "shared-helper-extraction",
    COMPILER_CARRIER_EXTENSION: "compiler-carrier-extension",
    EXTERNAL_PLAYABLE_BOUNDARY: "external-playable-boundary"
};

const KNOWN_2D_PHASE_DRIFT = [];

const KNOWN_2D_PHASE_DRIFT_KEYS = KNOWN_2D_PHASE_DRIFT.map(entry => entry.key);

const KNOWN_2D_RUNTIME_DRIFT = [
    knownRuntimeDrift(
        "src/js/engine.js",
        DRIFT_CATEGORIES.EXTERNAL_PLAYABLE_BOUNDARY,
        "The 2D browser/session flow stays in engine.js; only the playable level payload load point can delegate to a registered external playable host.",
        {
            evidenceTests: [
                "test/inputoutput3d.test.js",
                "test/play_host3d.test.js"
            ]
        }
    )
];

const KNOWN_2D_RUNTIME_DRIFT_FILES = KNOWN_2D_RUNTIME_DRIFT.map(entry => entry.file);

const ENGINE_2D_RUNTIME_HELPER_BOUNDARY = [
    forbiddenEngineDependency("again_loop.js", "2D engine.js should not require the 3D again-loop conformance adapter."),
    forbiddenEngineDependency("rule_application.js", "2D engine.js should not require the 3D rule-application conformance adapter."),
    forbiddenEngineDependency("runtime_metadata_twiddling.js", "2D engine.js should not require the 3D metadata conformance adapter."),
    forbiddenEngineDependency("session_runtime.js", "2D engine.js should not require the 3D session conformance adapter."),
    forbiddenEngineDependency("turn_runtime.js", "2D engine.js should not require the hook-driven 3D turn runtime."),
    forbiddenEngineDependency("win_conditions.js", "2D engine.js should not require the 3D win-condition conformance adapter."),
    forbiddenEngineDependency("getRuleApplicationApi2D", "2D rule application should remain owned by Rule.prototype.tryApply."),
    forbiddenEngineDependency("RuleApplication.applyRule", "Do not move 2D tuple application into the 3D conformance helper."),
    forbiddenEngineDependency("getAgainLoopApi2D", "2D again probing should remain in the existing engine/browser loop."),
    forbiddenEngineDependency("AgainLoop.evaluateNoInputAgainProbe", "Do not make the 2D oracle call the 3D again-loop adapter."),
    forbiddenEngineDependency("getTurnRuntimeApi2D", "2D processInput should not depend on the hook-driven 3D turn runtime."),
    forbiddenEngineDependency("TurnRuntime.validateRequiredPlayerMovement", "Keep 2D require_player_movement in engine.js."),
    forbiddenEngineDependency("TurnRuntime.runRuleMovementPhase", "Keep 2D rigid retry and late-rule sequencing in engine.js."),
    forbiddenEngineDependency("getWinConditionsApi2D", "2D checkWin should remain directly readable in engine.js."),
    forbiddenEngineDependency("WinConditions.evaluateWinConditions", "The win-condition helper is a 3D conformance adapter unless policy changes."),
    forbiddenEngineDependency("getRuntimeMetadataTwiddlingApi2D", "2D runtime metadata twiddling should remain directly readable in engine.js."),
    forbiddenEngineDependency("RuntimeMetadataTwiddling.applyRuntimeMetadataCommand", "Do not route 2D metadata side effects through the 3D adapter.")
];

const TWO_D_VM_ORACLE_FILES = [
    "test/ellipsis_2d_parity.test.js",
    "test/global_rule_2d_parity.test.js",
    "test/rule_groups_2d_parity.test.js"
];

const FORBIDDEN_2D_VM_ORACLE_CONTEXT_GLOBALS = [
    "AgainLoop:",
    "RuleApplication:",
    "RuntimeMetadataTwiddling:",
    "SessionRuntime:",
    "TurnRuntime:",
    "WinConditions:"
];

const ALLOWED_ORIGINAL_FILE_DRIFT = [
    "compile.js",
    "package.json",
    "src/editor.html",
    "src/js/engine.js",
    "src/play.html",
    "src/standalone.html",
    "src/standalone_inlined.txt"
];

function compiler2DPhase(phase, functionName, currentFunctionName) {
    return {
        phase,
        file: "src/js/compiler.js",
        originalFunctionName: functionName,
        currentFunctionName: currentFunctionName || functionName,
        preservedFunctionName: functionName
    };
}

function knownDrift(key, category, rationale, options) {
    return Object.assign({ key, category, rationale }, options || {});
}

function knownRuntimeDrift(file, category, rationale, options) {
    return Object.assign({ file, category, rationale }, options || {});
}

function forbiddenEngineDependency(needle, rationale) {
    return { needle, rationale };
}

function testNatural2DCompilerProcessBaseline() {
    const repoRoot = path.join(__dirname, "..");
    assertOriginal2DCommitIsAvailable(repoRoot);
    const originalSignature = buildProcessSignature({
        kind: "original",
        readFile(relativePath) {
            return childProcess.execFileSync(
                "git",
                ["show", `${ORIGINAL_2D_COMMIT}:${relativePath}`],
                { cwd: repoRoot, encoding: "utf8" }
            );
        }
    });
    const currentSignature = buildProcessSignature({
        kind: "current",
        readFile(relativePath) {
            return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
        }
    });
    const comparison = compareSignatures(originalSignature, currentSignature);

    assert.deepStrictEqual(
        comparison.drift,
        KNOWN_2D_PHASE_DRIFT_KEYS,
        formatProcessSignatureFailure(comparison)
    );
    assert.deepStrictEqual(
        comparison.missing,
        [],
        "Natural 2D process signature is missing expected compiler phases."
    );
    assertKnownDriftIsClassified();
}

function testNatural2DRuntimeSourceBaseline() {
    const repoRoot = path.join(__dirname, "..");
    assertOriginal2DCommitIsAvailable(repoRoot);
    const drift = [];
    for (const relativePath of ORIGINAL_2D_RUNTIME_FILES) {
        const originalSource = childProcess.execFileSync(
            "git",
            ["show", `${ORIGINAL_2D_COMMIT}:${relativePath}`],
            { cwd: repoRoot, encoding: "utf8" }
        );
        const currentSource = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
        if (sha256(originalSource) !== sha256(currentSource)) {
            drift.push({
                file: relativePath,
                originalHash: sha256(originalSource),
                currentHash: sha256(currentSource)
            });
        }
    }
    assert.deepStrictEqual(
        drift.map(entry => entry.file),
        KNOWN_2D_RUNTIME_DRIFT_FILES,
        formatRuntimeSourceDriftFailure(drift)
    );
    assertKnownRuntimeDriftIsClassified();
}

function testNatural2DRuntimeHelperBoundary() {
    const repoRoot = path.join(__dirname, "..");
    const engineSource = fs.readFileSync(path.join(repoRoot, "src/js/engine.js"), "utf8");
    const violations = ENGINE_2D_RUNTIME_HELPER_BOUNDARY.filter(entry => engineSource.includes(entry.needle));
    assert.deepStrictEqual(
        violations.map(entry => entry.needle),
        [],
        [
            "2D engine runtime started depending on conformance/runtime helper adapters.",
            "The current policy is: 2D engine.js is the oracle; 3D conforms to it.",
            "If this policy changes, update AGENTS.md and classify the new 2D owner boundary.",
            "",
            ...violations.map(entry => `  ${entry.needle}: ${entry.rationale}`)
        ].join("\n")
    );
}

function test2DVmOraclesDoNotInjectConformanceHelpers() {
    const repoRoot = path.join(__dirname, "..");
    const violations = [];
    for (const relativePath of TWO_D_VM_ORACLE_FILES) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
        for (const needle of FORBIDDEN_2D_VM_ORACLE_CONTEXT_GLOBALS) {
            if (source.includes(needle))
                violations.push(`${relativePath}: ${needle}`);
        }
    }
    assert.deepStrictEqual(
        violations,
        [],
        [
            "2D VM oracle contexts should stay as close as possible to the real 2D engine environment.",
            "Do not inject 3D conformance/runtime helpers into these contexts merely because the 3D comparison side uses them.",
            "",
            ...violations.map(violation => `  ${violation}`)
        ].join("\n")
    );
}

function testEngineExternalPlayableBoundaryIsMinimal() {
    const repoRoot = path.join(__dirname, "..");
    const engineSource = fs.readFileSync(path.join(repoRoot, "src/js/engine.js"), "utf8");
    const loaderSource = extractFunctionSource(engineSource, "loadLevelFromLevelDat");

    assert(loaderSource.includes("loadExternalPlayableLevelFromLevelDat(state, leveldat, randomseed, clearinputhistory)"),
        "engine.js external playable boundary must live only at the level payload load point.");
    assert(!engineSource.includes("is3d"), "engine.js must not know the 3D level marker.");
    assert(!engineSource.includes("Puzzle3D"), "engine.js must not depend on the 3D host.");
}

function testOriginalFileDriftIsAllowedBoundaryOnly() {
    const repoRoot = path.join(__dirname, "..");
    assertOriginal2DCommitIsAvailable(repoRoot);
    const output = childProcess.execFileSync(
        "git",
        ["diff", "--name-status", ORIGINAL_2D_COMMIT],
        { cwd: repoRoot, encoding: "utf8" }
    );
    const modifiedOrDeletedOriginalFiles = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => line.split(/\t+/))
        .filter(parts => parts[0] === "M" || parts[0] === "D")
        .map(parts => parts[1])
        .sort();

    assert.deepStrictEqual(
        modifiedOrDeletedOriginalFiles,
        ALLOWED_ORIGINAL_FILE_DRIFT.slice().sort(),
        [
            "Original-file drift escaped the approved 3D compile/browser shell boundary.",
            "New 3D files may be added, but existing 2D files must remain byte-for-byte original unless listed here.",
            "",
            "Allowed original-file drift:",
            ...ALLOWED_ORIGINAL_FILE_DRIFT.map(file => `  ${file}`),
            "",
            "Actual modified/deleted original files:",
            ...modifiedOrDeletedOriginalFiles.map(file => `  ${file}`)
        ].join("\n")
    );
}

function assertOriginal2DCommitIsAvailable(repoRoot) {
    childProcess.execFileSync(
        "git",
        ["cat-file", "-e", `${ORIGINAL_2D_COMMIT}:src/js/compiler.js`],
        { cwd: repoRoot, stdio: "pipe" }
    );
}

function buildProcessSignature(sourceProvider) {
    return COMPILER_2D_PHASES.map(step => {
        const original = sourceProvider.kind === "original";
        const functionName = original ? step.originalFunctionName : step.currentFunctionName;
        const fileSource = sourceProvider.readFile(step.file);
        const rawSource = extractFunctionSource(fileSource, functionName);
        const source = normalizeFunctionDeclarationName(rawSource, functionName, step.preservedFunctionName);
        return {
            phase: step.phase,
            file: step.file,
            functionName: step.preservedFunctionName,
            originalFunctionName: step.originalFunctionName,
            currentFunctionName: step.currentFunctionName,
            sourceHash: sha256(source),
            source
        };
    });
}

function compareSignatures(originalSignature, currentSignature) {
    const drift = [];
    const missing = [];
    for (let i = 0; i < originalSignature.length; i++) {
        const original = originalSignature[i];
        const current = currentSignature[i];
        const key = phaseKey(original);
        if (!current) {
            missing.push(key);
            continue;
        }
        if (original.sourceHash !== current.sourceHash)
            drift.push(key);
    }
    return { originalSignature, currentSignature, drift, missing };
}

function phaseKey(step) {
    return `${step.phase}:${step.functionName}`;
}

function formatProcessSignatureFailure(comparison) {
    const originalByKey = Object.fromEntries(comparison.originalSignature.map(step => [phaseKey(step), step]));
    const currentByKey = Object.fromEntries(comparison.currentSignature.map(step => [phaseKey(step), step]));
    const lines = [
        "Natural 2D compile process drift changed.",
        "Classify each drift by the preservation layer that justifies it.",
        "Prefer lower-layer exact equality, upper-layer logical equality, valid 3D expansion, and minimal 2D source changes.",
        ""
    ];
    lines.push(`Expected drift: ${KNOWN_2D_PHASE_DRIFT_KEYS.length}`);
    for (const entry of KNOWN_2D_PHASE_DRIFT)
        lines.push(`  ${entry.key} [${entry.category}]${formatEvidenceTests(entry)}`);
    lines.push(`Actual drift: ${comparison.drift.length}`);
    for (const key of comparison.drift) {
        const original = originalByKey[key];
        const current = currentByKey[key];
        lines.push(`  ${key}`);
        if (original || current) {
            if (current && current.currentFunctionName !== current.originalFunctionName)
                lines.push(`  current body: ${current.currentFunctionName}`);
            lines.push(`  original ${original.sourceHash}`);
            lines.push(`  current  ${current ? current.sourceHash : "<missing>"}`);
        }
    }
    return lines.join("\n");
}

function assertKnownDriftIsClassified() {
    const knownCategories = new Set(Object.values(DRIFT_CATEGORIES));
    for (const entry of KNOWN_2D_PHASE_DRIFT) {
        assert.ok(entry.key, "Known 2D phase drift must name a phase key.");
        assert.ok(knownCategories.has(entry.category), `${entry.key} has an unknown drift category.`);
        assert.ok(entry.rationale && entry.rationale.length > 20, `${entry.key} must explain why this drift is acceptable.`);
        assert.ok(Array.isArray(entry.evidenceTests) && entry.evidenceTests.length > 0,
            `${entry.key} must name the tests that justify ${entry.category} drift.`);
        for (const evidenceTest of entry.evidenceTests) {
            const evidencePath = path.join(__dirname, "..", evidenceTest);
            assert.ok(fs.existsSync(evidencePath), `${entry.key} evidence test is missing: ${evidenceTest}`);
        }
    }
}

function assertKnownRuntimeDriftIsClassified() {
    const knownCategories = new Set(Object.values(DRIFT_CATEGORIES));
    for (const entry of KNOWN_2D_RUNTIME_DRIFT) {
        assert.ok(entry.file, "Known 2D runtime drift must name a file.");
        assert.ok(knownCategories.has(entry.category), `${entry.file} has an unknown drift category.`);
        assert.ok(entry.rationale && entry.rationale.length > 20, `${entry.file} must explain why this drift is acceptable.`);
        assert.ok(Array.isArray(entry.evidenceTests) && entry.evidenceTests.length > 0,
            `${entry.file} must name the tests that justify ${entry.category} drift.`);
        for (const evidenceTest of entry.evidenceTests) {
            const evidencePath = path.join(__dirname, "..", evidenceTest);
            assert.ok(fs.existsSync(evidencePath), `${entry.file} evidence test is missing: ${evidenceTest}`);
        }
    }
}

function formatRuntimeSourceDriftFailure(drift) {
    const lines = [
        "Natural 2D runtime source drift changed.",
        "Only the classified external playable boundary may touch the 2D runtime source.",
        "Do not move 3D conformance semantics into engine.js.",
        "",
        "Expected runtime drift:",
        ...KNOWN_2D_RUNTIME_DRIFT.map(entry => `  ${entry.file} [${entry.category}]${formatEvidenceTests(entry)}`),
        "",
        "Actual runtime drift:",
        ...drift.map(entry => `  ${entry.file}: original ${entry.originalHash}, current ${entry.currentHash}`)
    ];
    return lines.join("\n");
}

function formatEvidenceTests(entry) {
    if (!entry.evidenceTests || entry.evidenceTests.length === 0)
        return "";
    return ` evidence: ${entry.evidenceTests.join(", ")}`;
}

function normalizeFunctionDeclarationName(source, actualFunctionName, preservedFunctionName) {
    if (actualFunctionName === preservedFunctionName)
        return source;
    return source.replace(
        new RegExp(`^function\\s+${escapeRegExp(actualFunctionName)}\\s*\\(`),
        `function ${preservedFunctionName}(`
    );
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFunctionSource(source, functionName) {
    const startNeedle = `function ${functionName}(`;
    const start = source.indexOf(startNeedle);
    assert.notStrictEqual(start, -1, `${functionName} source start`);

    const openBrace = source.indexOf("{", start);
    assert.notStrictEqual(openBrace, -1, `${functionName} opening brace`);

    let depth = 0;
    let state = "code";
    let escaped = false;

    for (let index = openBrace; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];

        if (state === "lineComment") {
            if (char === "\n")
                state = "code";
            continue;
        }
        if (state === "blockComment") {
            if (char === "*" && next === "/") {
                state = "code";
                index++;
            }
            continue;
        }
        if (state === "singleQuote" || state === "doubleQuote" || state === "template") {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if ((state === "singleQuote" && char === "'")
                || (state === "doubleQuote" && char === "\"")
                || (state === "template" && char === "`")) {
                state = "code";
            }
            continue;
        }

        if (char === "/" && next === "/") {
            state = "lineComment";
            index++;
            continue;
        }
        if (char === "/" && next === "*") {
            state = "blockComment";
            index++;
            continue;
        }
        if (char === "'") {
            state = "singleQuote";
            continue;
        }
        if (char === "\"") {
            state = "doubleQuote";
            continue;
        }
        if (char === "`") {
            state = "template";
            continue;
        }
        if (char === "{") {
            depth++;
            continue;
        }
        if (char === "}") {
            depth--;
            if (depth === 0)
                return source.slice(start, index + 1);
        }
    }

    throw new Error(`Could not extract ${functionName}`);
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

testNatural2DCompilerProcessBaseline();
testNatural2DRuntimeSourceBaseline();
testNatural2DRuntimeHelperBoundary();
test2DVmOraclesDoNotInjectConformanceHelpers();
testEngineExternalPlayableBoundaryIsMinimal();
testOriginalFileDriftIsAllowedBoundaryOnly();

console.log("natural 2D process preservation test passed");
