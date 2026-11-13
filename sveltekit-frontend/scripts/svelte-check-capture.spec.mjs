import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildKanbanPlan,
  buildDiagnosticResolutionReceiptV1,
  buildSvelteCheckScopeV1,
  buildReplayProposal,
  buildTodoList,
  buildWorkboardContext,
  classifyDiagnostic,
  createAtlasMcpClient,
  currentSourceSnapshot,
  enrichTodoList,
  enrichWithOkfAndDocs,
  loadValidatedOkfVocabulary,
  parseMachineDiagnostic,
  parseSavedLog,
  resolveOpenSpecDiagnosticTaskBindingsV1,
  resolveTsconfig,
  verifyCaptureArtifactsV1,
  resolveOpenSpecWorkboardTaskRefV1,
  SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY,
  summarizeDiagnostics,
} from './svelte-check-capture.mjs';

test('resolution receipt requires complete same-scope native runs and never authorizes task completion', () => {
  const scopeId = `sha256:${'a'.repeat(64)}`;
  const fingerprint = `sha256:${'b'.repeat(64)}`;
  const base = {
    schema: 'atlas.svelte-check-capture.v1', checker: 'svelte-check-native',
    checkerScope: { schema: 'atlas.svelte-check-scope.v1', scopeId },
    timedOut: false, interrupted: false, signal: null,
    outputs: { logSha256: `sha256:${'c'.repeat(64)}` },
  };
  const previousSummary = { ...base, runId: 'prior', gitRevision: 'rev-before', exitCode: 1, errors: 1, warnings: 0 };
  const currentSummary = { ...base, runId: 'current', gitRevision: 'rev-after', exitCode: 0, errors: 0, warnings: 0 };
  const previousTodos = {
    schema: 'atlas.svelte-check-todo-list.v1', runId: 'prior', gitRevision: 'rev-before',
    checker: 'svelte-check-native', checkerScope: base.checkerScope,
    sourceLogSha256: base.outputs.logSha256,
    tasks: [{ taskId: 'svelte-check:old', fingerprint, workboardTaskRef: null }],
  };
  const currentTodos = {
    schema: 'atlas.svelte-check-todo-list.v1', runId: 'current', gitRevision: 'rev-after',
    checker: 'svelte-check-native', checkerScope: base.checkerScope,
    sourceLogSha256: base.outputs.logSha256, tasks: [],
  };

  const receipt = buildDiagnosticResolutionReceiptV1(
    previousSummary, previousTodos, currentSummary, currentTodos,
    { previousArtifactsVerified: true, currentArtifactsVerified: true },
  );
  assert.equal(receipt.status, 'CLEAN_RUN_RESOLUTION_CANDIDATES');
  assert.deepEqual(receipt.resolvedDiagnosticFingerprints, [fingerprint]);
  assert.equal(receipt.resolvedDiagnostics[0].taskId, 'svelte-check:old');
  assert.equal(receipt.completionAuthorized, false);
  assert.equal(receipt.boardWritesPerformed, false);
  assert.equal(receipt.databaseWritesPerformed, false);

  const changedScope = buildDiagnosticResolutionReceiptV1(
    previousSummary, previousTodos,
    { ...currentSummary, checkerScope: { ...base.checkerScope, scopeId: `sha256:${'d'.repeat(64)}` } },
    { ...currentTodos, checkerScope: { ...base.checkerScope, scopeId: `sha256:${'d'.repeat(64)}` } },
    { previousArtifactsVerified: true, currentArtifactsVerified: true },
  );
  assert.equal(changedScope.status, 'BLOCKED_CHECKER_SCOPE_CHANGED');
  assert.deepEqual(changedScope.resolvedDiagnosticFingerprints, []);

  const missingReadback = buildDiagnosticResolutionReceiptV1(
    previousSummary, previousTodos, currentSummary, currentTodos,
  );
  assert.equal(missingReadback.status, 'BLOCKED_CAPTURE_ARTIFACT_READBACK');
});

test('native checker scope is repeatable and includes the tool, lockfile, and project configs', () => {
  const tsconfig = resolveTsconfig();
  const checkCli = path.resolve('node_modules/svelte-check-native/bin/svelte-check-native.js');
  const args = ['--tsconfig', tsconfig.path, '--output', 'machine', '--no-color'];
  const first = buildSvelteCheckScopeV1({ checker: 'svelte-check-native', checkCli, commandArgs: args, tsconfig });
  const second = buildSvelteCheckScopeV1({ checker: 'svelte-check-native', checkCli, commandArgs: args, tsconfig });
  assert.equal(first.scopeId, second.scopeId);
  assert.equal(first.invocation, 'FULL_TSCONFIG_PROJECT');
  assert.ok(first.configFiles.some((file) => file.path === 'package-lock.json'));
  assert.ok(first.configFiles.some((file) => file.path === 'tsconfig.json'));
  assert.match(first.checkerEntrySha256, /^sha256:[a-f0-9]{64}$/);
});

test('resolution artifact readback rejects tampered prior logs', () => {
  const directory = mkdtempSync(path.join(process.cwd(), '.tmp', 'svelte-check-resolution-'));
  try {
    const files = {
      log: path.join(directory, 'run.txt'),
      diagnostics: path.join(directory, 'run.jsonl'),
      todos: path.join(directory, 'run.todos.json'),
      summary: path.join(directory, 'run.summary.json'),
    };
    const logBytes = Buffer.from('native check completed\n');
    const diagnosticsBytes = Buffer.alloc(0);
    const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    writeFileSync(files.log, logBytes);
    writeFileSync(files.diagnostics, diagnosticsBytes);
    const todos = {
      schema: 'atlas.svelte-check-todo-list.v1', runId: 'run-1', gitRevision: 'head-1',
      checker: 'svelte-check-native', checkerScope: { scopeId: 'scope-1' }, sourceLogSha256: digest(logBytes), tasks: [],
    };
    const todosBytes = Buffer.from(JSON.stringify(todos));
    writeFileSync(files.todos, todosBytes);
    const summary = {
      schema: 'atlas.svelte-check-capture.v1', runId: 'run-1', gitRevision: 'head-1', checker: 'svelte-check-native',
      checkerScope: { scopeId: 'scope-1' },
      total: 0, errors: 0, warnings: 0, uniqueFingerprints: 0,
      outputs: {
        log: path.relative(process.cwd(), files.log).replace(/\\/g, '/'),
        diagnostics: path.relative(process.cwd(), files.diagnostics).replace(/\\/g, '/'),
        todos: path.relative(process.cwd(), files.todos).replace(/\\/g, '/'),
        summary: path.relative(process.cwd(), files.summary).replace(/\\/g, '/'),
        logSha256: digest(logBytes), diagnosticsSha256: digest(diagnosticsBytes), todosSha256: digest(todosBytes),
      },
    };
    const summaryBytes = Buffer.from(JSON.stringify(summary));
    writeFileSync(files.summary, summaryBytes);
    const summaryArtifact = { absolutePath: files.summary, value: summary, bytes: summaryBytes };
    const todosArtifact = { absolutePath: files.todos, value: todos, bytes: todosBytes };

    assert.equal(verifyCaptureArtifactsV1(summaryArtifact, todosArtifact), true);
    writeFileSync(files.log, Buffer.from('tampered log\n'));
    assert.equal(verifyCaptureArtifactsV1(summaryArtifact, todosArtifact), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resolves an explicitly selected current OpenSpec task and rejects stale or ambiguous identities', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-workboard-ref-'));
  try {
    const sourceRef = 'openspec/changes/change-a/tasks.md';
    const sourcePath = path.join(root, sourceRef);
    mkdirSync(path.dirname(sourcePath), { recursive: true });
    const sourceBytes = Buffer.from('- [ ] Verify exact task identity\n');
    writeFileSync(sourcePath, sourceBytes);
    const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const task = {
      taskKey: 'change-a:7', state: 'OPEN', stableKey: 'change-a#0123456789abcdef', logicalTaskKey: null,
      blockHash: digest(Buffer.from('task-block')), source: sourceRef,
    };
    const workboardPath = path.join(root, 'workboard.json');
    const workboard = {
      schema: 'atlas.openspec.workboard.v1', generatedAt: '2026-11-12T08:00:00.000Z',
      taskInventory: [task], sourceFileHashes: { [sourceRef]: digest(sourceBytes) },
    };
    writeFileSync(workboardPath, JSON.stringify(workboard));
    const resolved = resolveOpenSpecWorkboardTaskRefV1(task.stableKey, { root, workboardPath, currentHead: 'head-1' });

    assert.equal(resolved.workboardTaskId, task.taskKey);
    assert.equal(resolved.stableKey, task.stableKey);
    assert.equal(resolved.status, 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK');
    assert.equal(resolved.dispatchRevalidation, 'REQUIRED');
    assert.equal(resolved.canonicalAuthority, false);
    assert.equal(resolved.authority, 'PROPOSAL_REFERENCE_ONLY');
    const diagnostic = {
      severity: 'error', code: 'TS2345', file: 'src/example.ts', line: 1, column: 1,
      message: 'Type mismatch', fingerprint: `sha256:${'d'.repeat(64)}`,
    };
    const secondDiagnostic = { ...diagnostic, line: 9, fingerprint: `sha256:${'e'.repeat(64)}` };
    const bindings = resolveOpenSpecDiagnosticTaskBindingsV1([
      { diagnosticFingerprint: diagnostic.fingerprint, taskKey: task.stableKey },
    ], [diagnostic.fingerprint, secondDiagnostic.fingerprint], { root, workboardPath, currentHead: 'head-1' });
    const todoList = buildTodoList([diagnostic, secondDiagnostic], { runId: 'run-1', gitRevision: 'head-1', logPath: 'check.txt' });
    for (const todo of todoList.tasks) {
      const reference = bindings.get(todo.fingerprint);
      if (reference) todo.workboardTaskRef = reference;
    }
    const linkedPlan = buildKanbanPlan(todoList);
    assert.equal(todoList.tasks[0].workboardTaskRef.workboardTaskId, task.taskKey);
    assert.equal(linkedPlan.tasks[0].id, todoList.tasks[0].taskId);
    assert.equal(linkedPlan.tasks[0].workboardLink.reference.stableKey, task.stableKey);
    assert.equal(linkedPlan.tasks[0].mutationAllowed, false);
    assert.equal(todoList.tasks[1].workboardTaskRef, undefined);
    assert.equal(linkedPlan.tasks[1].workboardLink.status, 'NOT_LINKED_TO_OPEN_SPEC_TASK');
    assert.throws(() => resolveOpenSpecDiagnosticTaskBindingsV1([
      { diagnosticFingerprint: `sha256:${'f'.repeat(64)}`, taskKey: task.taskKey },
    ], [diagnostic.fingerprint], { root, workboardPath }), /DIAGNOSTIC_TASK_BINDING_FINGERPRINT_NOT_IN_RUN/);
    assert.throws(() => resolveOpenSpecDiagnosticTaskBindingsV1([
      { diagnosticFingerprint: diagnostic.fingerprint, taskKey: task.taskKey },
      { diagnosticFingerprint: diagnostic.fingerprint, taskKey: task.taskKey },
    ], [diagnostic.fingerprint], { root, workboardPath }), /DIAGNOSTIC_TASK_BINDING_DUPLICATE_FINGERPRINT/);
    assert.throws(() => resolveOpenSpecWorkboardTaskRefV1('missing-key', { root, workboardPath }), /WORKBOARD_TASK_KEY_NOT_FOUND/);

    writeFileSync(sourcePath, Buffer.from('changed source\n'));
    assert.throws(() => resolveOpenSpecWorkboardTaskRefV1(task.taskKey, { root, workboardPath }), /WORKBOARD_SOURCE_FILE_REVISION_MISMATCH/);
    workboard.taskInventory.push({ ...task, taskKey: 'change-a:8' });
    writeFileSync(workboardPath, JSON.stringify(workboard));
    assert.throws(() => resolveOpenSpecWorkboardTaskRefV1(task.stableKey, { root, workboardPath }), /WORKBOARD_TASK_KEY_AMBIGUOUS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('binds captures to a regular in-frontend tsconfig and its checksum', () => {
  const config = resolveTsconfig();
  assert.equal(config.path, 'tsconfig.json');
  assert.match(config.sha256, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => resolveTsconfig('../package.json'), /TSCONFIG_PATH_MUST_BE_INSIDE_FRONTEND/);
});

test('parses machine-format Svelte diagnostics and normalizes Windows paths', () => {
  const diagnostic = parseMachineDiagnostic(
    '1787249391766 WARNING "src\\\\lib\\\\components\\\\Button.svelte" 12:4 "Unused CSS selector \\\".old\\\""',
  );

  assert.equal(diagnostic.severity, 'warning');
  assert.equal(diagnostic.file, 'src/lib/components/Button.svelte');
  assert.equal(diagnostic.line, 12);
  assert.equal(diagnostic.column, 4);
  assert.match(diagnostic.timestamp, /^2026-/);
  assert.match(diagnostic.fingerprint, /^sha256:/);
});

test('extracts TypeScript diagnostic codes from messages', () => {
  const diagnostic = parseMachineDiagnostic(
    '1787249391766 ERROR "src\\\\lib\\\\example.ts" 4:2 "TS2322: Type mismatch"',
  );

  assert.equal(diagnostic.code, 'TS2322');
});

test('ignores non-diagnostic and malformed machine lines', () => {
  assert.equal(parseMachineDiagnostic('Loading svelte-check in workspace'), null);
  assert.equal(parseMachineDiagnostic('1787249391766 ERROR not-json 4:2 "bad"'), null);
});

test('replays a saved log deterministically and binds diagnostics to exact input lines', () => {
  const content = [
    'header',
    '1787249391766 ERROR "src\\\\lib\\\\example.ts" 4:2 "TS2322: Type mismatch"',
    'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
  ].join('\n');
  const logSha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const sourceRunSummary = {
    runId: 'original-run',
    gitRevision: 'source-revision',
    timedOut: false,
    interrupted: false,
    exitCode: 1,
    errors: 1,
    warnings: 0,
    outputs: { logSha256 },
  };
  const options = { logPath: 'saved.txt', logSha256, sourceRunSummary, replayWorkspaceRevision: 'current-revision' };
  const first = parseSavedLog(content, options);
  const second = parseSavedLog(content, options);

  assert.deepEqual(first, second);
  assert.equal(first.summary.status, 'COMPLETE');
  assert.equal(first.summary.countsMatchCaptureSummary, true);
  assert.equal(first.summary.sourceGitRevision, 'source-revision');
  assert.equal(first.summary.replayWorkspaceRevision, 'current-revision');
  assert.equal(first.diagnostics[0].logEvidence.line, 2);
  assert.equal(first.diagnostics[0].logEvidence.logSha256, logSha256);
  assert.match(first.diagnostics[0].logEvidence.lineSha256, /^sha256:/);
  assert.equal(first.diagnostics[0].documentationEvidence.line, 3);
  assert.equal(first.summary.unmatchedLineCount, 1);
  assert.equal(first.summary.unmatchedLineEvidence[0].line, 1);
  const firstTodos = buildTodoList(first.diagnostics, {
    runId: first.summary.sourceRunId,
    gitRevision: first.summary.sourceGitRevision,
    logPath: first.summary.inputLog,
  });
  const secondTodos = buildTodoList(second.diagnostics, {
    runId: second.summary.sourceRunId,
    gitRevision: second.summary.sourceGitRevision,
    logPath: second.summary.inputLog,
  });
  assert.deepEqual(firstTodos.tasks, secondTodos.tasks);
  assert.deepEqual(firstTodos.executionDag, secondTodos.executionDag);
});

test('rejects abnormal exits and capture-summary count mismatches', () => {
  const content = '1787249391766 ERROR "src\\\\lib\\\\example.ts" 4:2 "TS2322: Type mismatch"';
  const logSha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const base = {
    runId: 'aborted-run',
    gitRevision: 'source-revision',
    timedOut: false,
    interrupted: false,
    errors: 1,
    warnings: 0,
    outputs: { logSha256 },
  };
  const abnormal = parseSavedLog(content, {
    logPath: 'saved.txt', logSha256,
    sourceRunSummary: { ...base, exitCode: 134 },
  });
  assert.equal(abnormal.summary.acceptedExitCode, false);
  assert.equal(abnormal.summary.status, 'INCOMPLETE');
  assert.equal(buildReplayProposal(abnormal).tasks.length, 0);

  const mismatched = parseSavedLog(content, {
    logPath: 'saved.txt', logSha256,
    sourceRunSummary: { ...base, exitCode: 1, errors: 0 },
  });
  assert.equal(mismatched.summary.countsMatchCaptureSummary, false);
  assert.equal(mismatched.summary.status, 'INCOMPLETE');
});

test('marks logs without checksum-matched run receipts incomplete and retains partial diagnostics', () => {
  const content = '1787249391766 WARNING "src\\\\lib\\\\Button.svelte" 8:1 "Review label"';
  const logSha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const replay = parseSavedLog(content, { logPath: 'incomplete.txt', logSha256 });

  assert.equal(replay.summary.status, 'INCOMPLETE');
  assert.equal(replay.summary.sourceGitRevision, null);
  assert.equal(replay.summary.sourceRevisionStatus, 'NOT_PROVEN');
  assert.equal(replay.diagnostics.length, 1);
  const proposal = buildReplayProposal(replay);
  assert.equal(proposal.replay.extractedObservationCount, 1);
  assert.equal(proposal.replay.promotableDiagnosticCount, 0);
  assert.equal(proposal.tasks.length, 0);
  assert.equal(proposal.kanbanPlan.tasks.length, 0);
});

test('summarizes exact duplicates, severity, codes, and top files deterministically', () => {
  const first = parseMachineDiagnostic(
    '1787249391766 ERROR "src\\\\lib\\\\example.ts" 4:2 "TS2322: Type mismatch"',
  );
  const second = { ...first, timestamp: '2026-10-13T00:00:00.000Z' };
  const warning = parseMachineDiagnostic(
    '1787249391766 WARNING "src\\\\lib\\\\Button.svelte" 8:1 "Unused CSS selector"',
  );

  assert.deepEqual(summarizeDiagnostics([first, second, warning]), {
    total: 3,
    errors: 2,
    warnings: 1,
    uniqueFingerprints: 2,
    duplicateDiagnostics: 1,
    byCode: [{ key: 'TS2322', count: 2 }, { key: 'NO_CODE', count: 1 }],
    topFiles: [{ key: 'src/lib/example.ts', count: 2 }, { key: 'src/lib/Button.svelte', count: 1 }],
  });
});

test('routes known diagnostics through a review-only lookup table', () => {
  assert.equal(classifyDiagnostic({ code: 'a11y_label_has_associated_control' }).category, 'ACCESSIBILITY');
  assert.equal(classifyDiagnostic({ code: 'css_unused_selector' }).category, 'CSS_REVIEW');
  assert.equal(classifyDiagnostic({ code: 'TS2322' }).category, 'TYPECHECK');
  assert.equal(classifyDiagnostic({ code: null }).category, 'UNCLASSIFIED');
});

test('creates stable proposal-only tasks and collapses duplicate diagnostics', () => {
  const diagnostic = parseMachineDiagnostic(
    '1787249391766 ERROR "src\\\\lib\\\\example.ts" 4:2 "TS2322: Type mismatch"',
  );
  const todoList = buildTodoList([diagnostic, { ...diagnostic }], {
    runId: '2026-10-13T20-00-00-000Z',
    gitRevision: 'abc123',
    logPath: '.tmp/run.txt',
  });

  assert.equal(todoList.tasks.length, 1);
  assert.equal(todoList.tasks[0].occurrences, 2);
  assert.equal(todoList.tasks[0].status, 'PROPOSED_REVIEW_ONLY');
  assert.equal(todoList.tasks[0].mutationAllowed, false);
  assert.equal(todoList.authority, 'LOCAL_DIAGNOSTIC_PROJECTION');
  assert.equal(todoList.mutationAllowed, false);
});

test('adds bounded advisory MCP source and dependency enrichment without write tools', async () => {
  const diagnostics = ['src/a.svelte', 'src/b.svelte', 'src/a.svelte'].map((file, index) => ({
    severity: 'warning', code: 'a11y_label_has_associated_control', file, line: index + 1,
    column: 1, message: 'Review label association', fingerprint: `sha256:${index}${file}`,
  }));
  const todoList = buildTodoList(diagnostics, { runId: 'run', gitRevision: 'rev', logPath: 'run.txt' });
  const calls = [];
  const enriched = await enrichTodoList(todoList, async (name, args) => {
    calls.push({ name, args });
    return { content: [{ type: 'text', text: JSON.stringify({ intent: 'repair', domain: 'frontend' }) }] };
  }, { maxFiles: 1, captureStatus: 'COMPLETE', sourceGitRevision: 'rev' });

  assert.equal(enriched.enrichment.authority, 'ADVISORY_ONLY');
  assert.equal(enriched.enrichment.writesPerformed, false);
  assert.equal(enriched.enrichment.aceCache.status, 'BLOCKED_CONTEXTMANIFEST_ADMISSION_REQUIRED');
  assert.equal(enriched.enrichment.status, 'ENRICHED_ADVISORY_ONLY');
  assert.equal(calls.filter(({ name }) => name === 'find_dependencies').length, 1);
  assert.deepEqual(calls.find(({ name }) => name === 'find_source_refs').args.refs, ['src/a.svelte']);
  assert.ok(calls.every(({ name }) => name !== 'record_outcome'));
  assert.equal(enriched.mutationAllowed, false);
});

test('runs the saved-log to MCP review packet flow with source and cache gates', async () => {
  const content = '1787249391766 WARNING "src\\\\lib\\\\Button.svelte" 8:1 "a11y_label_has_associated_control: Review label"';
  const logSha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const parsed = parseSavedLog(content, {
    logPath: 'saved/svelte-check.txt',
    logSha256,
    sourceRunSummary: {
      schema: 'atlas.svelte-check-capture.v1', runId: 'run-1', gitRevision: 'revision-1',
      timedOut: false, interrupted: false, exitCode: 0, outputs: { logSha256 },
    },
    replayWorkspaceRevision: 'revision-1',
  });
  let todoList = buildReplayProposal(parsed);
  todoList = buildWorkboardContext(enrichWithOkfAndDocs(todoList));
  const calledTools = [];
  todoList = await enrichTodoList(todoList, async (name) => {
    calledTools.push(name);
    const result = {
      classify_intent: { intent: 'repair', domain: 'frontend' },
      find_source_refs: { status: 'UNRESOLVED', sourceRefs: [] },
      find_dependencies: { dependencies: [] },
      build_recommendation: { likely_cause: 'Unassociated display label' },
    }[name];
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }, {
    captureStatus: parsed.summary.status,
    sourceGitRevision: parsed.summary.sourceGitRevision,
    currentRevisionResolver: () => 'revision-1',
    sourceResolver: () => ({
      status: 'CURRENT_BYTES_OBSERVED_ORIGINAL_REVISION_UNPROVEN',
      sourceRef: 'src/lib/Button.svelte',
      currentBytesSha256: 'sha256:source-bytes',
      byteLength: 100,
      workingTreeState: 'CLEAN_AT_CURRENT_HEAD',
    }),
  });

  assert.equal(todoList.tasks.length, 1);
  assert.equal(todoList.replay.status, 'COMPLETE');
  assert.equal(todoList.enrichment.sourceEvidence['src/lib/Button.svelte'].originalDiagnosticSourceMatch, 'REVISION_MATCHED');
  assert.equal(todoList.enrichment.aceCache.status, 'BLOCKED_CONTEXTMANIFEST_ADMISSION_REQUIRED');
  assert.equal(todoList.enrichment.repairAuthority, 'NONE_REQUIRES_SOURCE_REVIEW_AND_APPROVAL');
  assert.equal(todoList.executionDag.scheduled, false);
  assert.ok(calledTools.includes('find_source_refs'));
  assert.ok(calledTools.includes('find_dependencies'));
  assert.ok(calledTools.includes('build_recommendation'));
  assert.ok(calledTools.every((name) => ['classify_intent', 'find_source_refs', 'find_dependencies', 'build_recommendation'].includes(name)));
});

test('runs saved-log enrichment through the real local MCP stdio server in mock mode', async () => {
  const todoList = buildTodoList([{
    severity: 'warning', code: 'a11y_label_has_associated_control', file: 'src/components/Example.svelte',
    line: 7, column: 2, message: 'A form label must be associated with a control', fingerprint: 'sha256:stdio-e2e',
  }], { runId: 'stdio-run', gitRevision: 'revision-stdio', logPath: 'saved.txt' });
  const client = createAtlasMcpClient({
    serverPath: path.resolve('scripts/mcp/atlas-tools-mcp.mjs'),
    env: { ...process.env, ATLAS_TOOLS_MOCK: '1', ATLAS_CONTEXT_LIVE: '0' },
  });

  try {
    const inventory = await client.initialize();
    assert.equal(inventory.registryStatus, 'EXACT_REGISTRY_MATCH_AND_ALLOWED_SCHEMAS_VERIFIED');
    assert.equal(inventory.registeredToolNames.length, 13);
    assert.deepEqual(
      SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY.filter((tool) => tool.decision === 'ALLOW').map((tool) => tool.name).sort(),
      ['build_recommendation', 'classify_intent', 'find_dependencies', 'find_source_refs'],
    );
    assert.equal(SVELTE_DIAGNOSTIC_MCP_TOOL_POLICY.find((tool) => tool.name === 'record_outcome').decision, 'DENY');
    const enriched = await enrichTodoList(todoList, client.callTool, {
      captureStatus: 'COMPLETE',
      sourceGitRevision: 'revision-stdio',
      currentRevisionResolver: () => 'revision-stdio',
      sourceResolver: () => ({
        status: 'CURRENT_BYTES_OBSERVED_ORIGINAL_REVISION_UNPROVEN',
        sourceRef: 'src/components/Example.svelte',
        currentBytesSha256: 'sha256:stdio-source',
        byteLength: 120,
        workingTreeState: 'CLEAN_AT_CURRENT_HEAD',
      }),
    });

    assert.equal(enriched.enrichment.status, 'ENRICHED_ADVISORY_ONLY');
    assert.equal(enriched.enrichment.tools.dependencies['src/components/Example.svelte'].status, 'OK');
    assert.equal(enriched.enrichment.aceCache.status, 'BLOCKED_CONTEXTMANIFEST_ADMISSION_REQUIRED');
    await assert.rejects(client.callTool('record_outcome', {}), /MCP tool not allowed/);
    await assert.rejects(client.callTool('build_agentic_rag_context', { query: 'warning repair' }), /MCP tool not allowed/);
  } finally {
    client.close();
  }
});

test('records MCP enrichment failures as unavailable without failing the task list', async () => {
  const todoList = buildTodoList([{
    severity: 'warning', code: 'a11y_label_has_associated_control', file: 'src/a.svelte', line: 1,
    column: 1, message: 'Review label association', fingerprint: 'sha256:offline',
  }], { runId: 'run', gitRevision: 'rev', logPath: 'run.txt' });
  const enriched = await enrichTodoList(todoList, async () => { throw new Error('offline'); }, { captureStatus: 'COMPLETE' });

  assert.equal(enriched.enrichment.status, 'PARTIAL');
  assert.equal(enriched.enrichment.tools.classification.status, 'UNAVAILABLE');
  assert.equal(enriched.enrichment.tools.sourceRefs.status, 'UNAVAILABLE');
  assert.equal(enriched.mutationAllowed, false);
});

test('does not call MCP for incomplete diagnostic captures', async () => {
  const todoList = buildTodoList([{
    severity: 'warning', code: 'a11y_label_has_associated_control', file: 'src/a.svelte', line: 1,
    column: 1, message: 'Review label association', fingerprint: 'sha256:incomplete',
  }], { runId: 'run', gitRevision: null, logPath: 'run.txt' });
  let callCount = 0;
  const enriched = await enrichTodoList(todoList, async () => { callCount += 1; }, { captureStatus: 'INCOMPLETE' });

  assert.equal(callCount, 0);
  assert.equal(enriched.enrichment.status, 'BLOCKED');
  assert.equal(enriched.enrichment.reason, 'MCP_ENRICHMENT_REQUIRES_COMPLETE_CAPTURE_RECEIPT');
  assert.equal(enriched.enrichment.aceCache.status, 'BLOCKED_CONTEXTMANIFEST_ADMISSION_REQUIRED');
});

test('builds a deterministic proposal DAG that cannot schedule or mutate work', () => {
  const diagnostic = { severity: 'error', code: 'a11y_label_has_associated_control', file: 'src/lib/components/Button.svelte', line: 12, column: 4, message: 'label missing control', fingerprint: 'sha256:dag-fixture' };
  const todoList = buildTodoList([diagnostic], { runId: 'run', gitRevision: 'rev', logPath: 'run.txt' });

  assert.equal(todoList.executionDag.schema, 'atlas.svelte-check-review-dag.v1');
  assert.equal(todoList.executionDag.scheduled, false);
  assert.equal(todoList.executionDag.nodes.at(-1).status, 'BLOCKED_UNTIL_APPROVAL_AND_PATCH');
  assert.ok(todoList.executionDag.nodes.every((node) => node.mutationAllowed === false));
});

test('projects a lineage-blocked Kanban task without inventing canonical identity', () => {
  const diagnostic = {
    severity: 'warning', code: 'a11y_label_has_associated_control', file: 'src/example.svelte',
    line: 7, column: 2, message: 'Missing label association', fingerprint: 'sha256:kanban-evidence',
    logEvidence: { logSha256: 'sha256:log', line: 3 },
  };
  const todoList = buildTodoList([diagnostic], {
    runId: 'run', gitRevision: null, logPath: 'saved.txt', logSha256: 'sha256:log',
  });
  const plan = buildKanbanPlan(todoList, {
    replayWorkspaceRevision: 'current-head',
    sourceResolver: () => ({
      status: 'CURRENT_BYTES_OBSERVED_ORIGINAL_REVISION_UNPROVEN',
      sourceRef: 'src/example.svelte', currentBytesSha256: 'sha256:current',
      byteLength: 42, workingTreeState: 'DIRTY_OR_UNTRACKED',
    }),
  });
  const task = plan.tasks[0];

  assert.equal(plan.sourceLogSha256, 'sha256:log');
  assert.equal(plan.scheduled, false);
  assert.equal(task.id, 'svelte-check:kanban-evidence');
  assert.equal(task.priority, 'P2');
  assert.equal(task.priorityBasis, 'SEVERITY_DISPLAY_ONLY_NOT_SCHEDULER_AUTHORITY');
  assert.equal(task.origin, 'svelte_check_saved_log_replay_v1');
  assert.equal(task.source_ref, 'src/example.svelte');
  assert.equal(task.gate, 'SOURCE_LINEAGE_REVIEW_REQUIRED');
  assert.equal(task.workboardLink.status, 'NOT_LINKED_TO_OPEN_SPEC_TASK');
  assert.equal(task.phaseId, undefined);
  assert.equal(task.canonicalId, null);
  assert.equal(task.sourceRevision, null);
  assert.equal(task.workspaceRevision, 'current-head');
  assert.equal(task.sourceEvidence.originalDiagnosticSourceMatch, 'NOT_PROVEN');
  assert.equal(task.status, 'BLOCKED_LINEAGE_REVIEW_ONLY');
  assert.equal(task.mutationAllowed, false);
  assert.deepEqual(task.evidence_refs, ['log:sha256:log#L3', 'diagnostic:sha256:kanban-evidence']);
});

test('rejects diagnostic source paths that escape the frontend root', () => {
  const snapshot = currentSourceSnapshot('../outside.txt');
  assert.equal(snapshot.status, 'SOURCE_PATH_REJECTED');
  assert.equal(snapshot.currentBytesSha256, null);
});

test('uses schema-validated non-searchable OKF vocabulary and published docs as references only', () => {
  const vocabulary = loadValidatedOkfVocabulary();
  assert.equal(vocabulary.canonical_authority, false);
  assert.equal(vocabulary.indexing.searchable, false);

  const diagnostic = { severity: 'warning', code: 'a11y_label_has_associated_control', file: 'src/lib/components/Button.svelte', line: 12, column: 4, message: 'accessibility label missing control', fingerprint: 'sha256:okf-fixture' };
  const todoList = buildTodoList([diagnostic], { runId: 'run', gitRevision: 'rev', logPath: 'run.txt' });
  const enriched = enrichWithOkfAndDocs(todoList).okfEnrichment;
  const task = enriched.tasks[todoList.tasks[0].taskId];

  assert.equal(enriched.fetchTriggered, false);
  assert.equal(enriched.indexingTriggered, false);
  assert.ok(task.documentation.crawlCandidates.every((candidate) => candidate.fetchTriggered === false));
  assert.ok(task.lutHints.every((hint) => hint.searchable === false && hint.authority === 'REFERENCE_ONLY'));
});

test('cross-references current OpenSpec gates but refuses stale Graphify and low-rank scheduling', () => {
  const todoList = buildTodoList([], { runId: 'run', gitRevision: 'rev', logPath: 'run.txt' });
  const enriched = buildWorkboardContext(todoList);

  assert.equal(enriched.workboardContext.taskStateMutation, false);
  assert.equal(enriched.workboardContext.agentDispatch, false);
  assert.ok(enriched.workboardContext.phases.length > 0);
  assert.equal(enriched.workboardContext.dailyGraphify.refreshTriggered, false);
  assert.match(enriched.workboardContext.dailyGraphify.status, /STALE|REFERENCE_ONLY/);
  assert.equal(enriched.workboardContext.lowRank.scoreMergedIntoDiagnosticRanking, false);
  assert.equal(enriched.workboardContext.runtimePolicy.hyperLogLog.status, 'NOT_NEEDED');
  assert.equal(enriched.workboardContext.runtimePolicy.postgres18AioBitmap.status, 'EXISTING_PLANNER_BEHAVIOR');
  assert.equal(enriched.workboardContext.runtimePolicy.acePacket.status, 'BLOCKED_PENDING_EXISTING_CONTEXTMANIFEST_READBACK');
});

test('extracts pretty-format svelte-check diagnostics and cross-checks the checker summary line', () => {
  const content = [
    '\x1b[32mc:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\Box.svelte\x1b[39m:428:2',
    '\x1b[33mWarn\x1b[39m: `<div>` needs an ARIA role',
    'https://svelte.dev/e/a11y_no_static_element_interactions (svelte)',
    ' <div class="x">',
    '',
    'c:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\Card.svelte:280:2',
    'Warn: Unused CSS selector ".alert"',
    'https://svelte.dev/e/css_unused_selector (svelte)',
    '',
    '====================================',
    'svelte-check found 0 errors and 2 warnings in 2 files',
  ].join('\n');
  const logSha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const replay = parseSavedLog(content, { logPath: 'pretty.txt', logSha256 });

  assert.equal(replay.diagnostics.length, 2);
  assert.deepEqual(replay.diagnostics.map((d) => d.file), ['src/lib/Box.svelte', 'src/lib/Card.svelte']);
  assert.equal(replay.diagnostics[0].severity, 'warning');
  assert.equal(replay.diagnostics[0].code, 'a11y_no_static_element_interactions');
  assert.equal(replay.diagnostics[1].code, 'css_unused_selector');
  assert.equal(replay.summary.countsMatchCheckerSummary, true);
  assert.equal(replay.summary.status, 'INCOMPLETE');
  assert.match(replay.summary.completionEvidence, /MISSING_OR_UNMATCHED_CAPTURE_SUMMARY/);
  assert.equal(replay.diagnostics[0].fingerprint, replay.diagnostics[0].fingerprint);
  assert.notEqual(replay.diagnostics[0].fingerprint, replay.diagnostics[1].fingerprint);
});

test('flags a pretty-format count mismatch against the checker summary line', () => {
  const content = [
    'c:\\repo\\sveltekit-frontend\\src\\lib\\Box.svelte:1:1',
    'Error: Something broke',
    'https://svelte.dev/e/some_error (svelte)',
    'svelte-check found 0 errors and 3 warnings in 1 files',
  ].join('\n');
  const logSha256 = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const replay = parseSavedLog(content, { logPath: 'mismatch.txt', logSha256 });

  assert.equal(replay.diagnostics[0].severity, 'error');
  assert.equal(replay.summary.countsMatchCheckerSummary, false);
  assert.equal(replay.summary.status, 'INCOMPLETE');
});
