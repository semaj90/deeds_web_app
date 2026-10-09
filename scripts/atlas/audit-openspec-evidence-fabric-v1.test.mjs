import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildEvidenceCardV1,
  buildPortfolioCensus,
  classifyTaskDuplicates,
  detectCycles,
  extractDependencyCandidates,
  parseTasksMarkdown,
  resolveReceiptBindings,
  resolveDependencyCandidate,
  verifyEvidenceReceiptV1,
} from './audit-openspec-evidence-fabric-v1.mjs';

test('EvidenceCard proof usability cannot be caller-asserted for non-PROVEN state', () => {
  const card = buildEvidenceCardV1({
    schema: 'atlas.evidence-card.v1',
    taskRef: 'openspec/changes/example/tasks.md#L1',
    changeId: 'example',
    taskId: 'EX-1',
    claim: 'Check evidence',
    proofState: 'PARTIAL',
    retrievalUsable: true,
    proofUsable: true,
    sourceRef: 'openspec/changes/example/tasks.md#L1',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    conceptID: 'openspec:example:EX-1',
    confidenceScore: 0.5,
    contextBlob: 'PARTIAL',
    evidenceIds: [],
    workspaceRevision: `sha256:${'b'.repeat(64)}`,
  });
  assert.equal(card.proofUsable, false);
});
import { buildEvidenceReceiptV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { compileOpenSpecFeaturePacketsV1 } from './compile-openspec-feature-packets-v1.mjs';
import { resolveOpenSpecOrphanBindingsV1 } from './resolve-openspec-orphan-bindings-v1.mjs';

function receiptInput(overrides = {}) {
  return {
    schema: 'atlas.evidence-receipt.v1',
    evidenceId: 'receipt:change-a:ABC-1:run-1',
    evidenceType: 'TEST',
    changeId: 'change-a',
    taskId: 'ABC-1',
    claim: 'Verify the implementation',
    workspaceRevision: 'sha256:workspace',
    sourceRevision: 'sha256:source',
    taskRevision: `sha256:${'a'.repeat(64)}`,
    sourceRefs: [{ file: 'openspec/changes/change-a/tasks.md', lineStart: 1, lineEnd: 1, sourceRevision: 'sha256:source' }],
    producer: 'vitest',
    inputs: [],
    observedAt: '2026-10-01T12:00:00Z',
    expectedAssertions: [{ id: 'assert-1', claimRef: 'predicate-abc', expected: 'test passes' }],
    actualAssertions: [{ id: 'assert-1', claimRef: 'predicate-abc', actual: 'test passes', passed: true }],
    outputs: [],
    independentVerifier: 'independent-audit',
    readbackRequired: false,
    readbackPerformed: false,
    verdict: 'PROVEN',
    ...overrides,
  };
}

test('requires complete uniquely identified assertions before a PROVEN receipt can be built', () => {
  assert.throws(() => buildEvidenceReceiptV1(receiptInput({ taskRevision: undefined })), /missing taskRevision/);
  assert.throws(() => buildEvidenceReceiptV1(receiptInput({ expectedAssertions: [], actualAssertions: [] })), /proven requires assertions/);
  assert.throws(() => buildEvidenceReceiptV1(receiptInput({ actualAssertions: [{ id: 'other', passed: true }] })), /assertion identity mismatch/);
  assert.throws(() => buildEvidenceReceiptV1(receiptInput({ actualAssertions: [{ id: 'assert-1', passed: false }] })), /unsatisfied assertion/);
});

test('verifies receipt checksum before report-output association', () => {
  const receipt = buildEvidenceReceiptV1(receiptInput({ outputs: [{ uri: 'docs/reports/report.json', checksum: 'sha256:output' }] }));
  assert.deepEqual(verifyEvidenceReceiptV1(receipt), receipt);
  assert.throws(() => verifyEvidenceReceiptV1({ ...receipt, outputs: [] }), /checksum mismatch/);
});

test('parses stable and missing task IDs without treating checkboxes as proof', () => {
  const tasks = parseTasksMarkdown('- [x] **ABC-1** prove the path\n- [x] 1.1 numbered task\n- [ ] no stable identifier', 'change-a', 'openspec/changes/change-a/tasks.md');
  assert.equal(tasks[0].taskId, 'ABC-1');
  assert.equal(tasks[0].declaredChecked, true);
  assert.equal(tasks[1].taskId, '1.1');
  assert.equal(tasks[2].taskIdStatus, 'DERIVED_ID');
  assert.equal(tasks[2].taskIdentity.identityState, 'DERIVED_ID');
  assert.equal(tasks[2].canonicalTaskRef.startsWith('openspec-task:openspec://root/change-a/sha256:'), true);
  const moved = parseTasksMarkdown('- [ ] unrelated row\n- [ ] no stable identifier', 'change-a', 'openspec/changes/change-a/tasks.md');
  assert.equal(tasks[2].taskIdentity.derivedTaskKey, moved[1].taskIdentity.derivedTaskKey);
  const frontend = parseTasksMarkdown('- [ ] no stable identifier', 'change-a', 'sveltekit-frontend/openspec/changes/change-a/tasks.md', 'openspec://frontend');
  assert.notEqual(tasks[2].taskIdentity.derivedTaskKey, frontend[0].taskIdentity.derivedTaskKey);
});

test('detects dependency cycles', () => {
  const cycles = detectCycles([
    { from: 'a:1', to: 'b:1', edgeType: 'REQUIRES' },
    { from: 'b:1', to: 'a:1', edgeType: 'REQUIRES' },
  ]);
  assert.equal(cycles.length, 1);
});

test('recognizes dependency syntax variants and reports exact resolution outcomes', () => {
  const markdown = [
    '- [ ] **GPH-16** Base task',
    '- [ ] **GPH-17** Depends on GPH-16',
    '- [ ] **GPH-18** blocked by GPH-17',
    '- [ ] **GPH-19** requires PF0; after EMB3A-05',
    '- [ ] **GPH-20** prerequisite: GPH-19',
    '- [ ] **GPH-21** dependsOn: [GPH-20]',
    '- [ ] **GPH-22** blockedBy=GPH-21',
    '- [ ] **GPH-23** GPH-22 -> GPH-23',
    '- [ ] **GPH-24** requires GPH-99',
  ].join('\n');
  const tasks = parseTasksMarkdown(markdown, 'change-a', 'openspec/changes/change-a/tasks.md', 'openspec://root');
  const candidates = tasks.flatMap(extractDependencyCandidates)
    .map((candidate) => resolveDependencyCandidate(candidate, tasks));
  assert.equal(candidates.some((candidate) => candidate.parser === 'PROSE_PATTERN' && candidate.rawTarget === 'PF0'), true);
  assert.equal(candidates.some((candidate) => candidate.parser === 'EXPLICIT_FIELD' && candidate.rawTarget === 'GPH-20' && candidate.resolution === 'RESOLVED'), true);
  assert.equal(candidates.some((candidate) => candidate.parser === 'ARROW_REFERENCE' && candidate.rawTarget === 'GPH-22' && candidate.resolution === 'RESOLVED'), true);
  assert.equal(candidates.some((candidate) => candidate.rawTarget === 'GPH-99' && candidate.resolution === 'MISSING_TARGET'), true);
});

test('does not parse the prefix of required as a dependency relation', () => {
  const [task] = parseTasksMarkdown('- [ ] **SRC-01** Audit completed; assertions are required, including G49 and P3 labels.', 'change-a', 'openspec/changes/change-a/tasks.md');
  assert.deepEqual(extractDependencyCandidates(task), []);
});

test('does not mistake hash algorithms or gate ranges for task references', () => {
  const [task] = parseTasksMarkdown('- [ ] **SRC-01** This note supersedes the G1-G26 gate range; use SHA-256 for the checksum.', 'change-a', 'openspec/changes/change-a/tasks.md');
  assert.deepEqual(extractDependencyCandidates(task), []);
});

test('does not turn nested evidence narrative into task dependencies', () => {
  const markdown = [
    '- [x] **SRC-02** Produce the bounded receipt.',
    '  - Evidence: the earlier diagnostic compared GPH-25 -> GPH-02 and reports GPH-17.',
    '  - This receipt is not a dependency on those Graphify tasks.',
  ].join('\n');
  const [task] = parseTasksMarkdown(markdown, 'change-a', 'openspec/changes/change-a/tasks.md');
  assert.deepEqual(extractDependencyCandidates(task), []);
});

test('classifies same-change duplicates, mirrors, archives, and authority namespace collisions separately', () => {
  const rootTasks = parseTasksMarkdown([
    '- [ ] **GPH-17** shared claim',
    '- [ ] **GPH-17** conflicting declared ID',
    '- [ ] same claim without an ID',
    '- [ ] same claim without an ID',
  ].join('\n'), 'change-a', 'openspec/changes/change-a/tasks.md', 'openspec://root');
  const otherRootTask = parseTasksMarkdown('- [ ] **GPH-17** shared claim', 'change-b', 'openspec/changes/change-b/tasks.md', 'openspec://root');
  const frontendMirror = parseTasksMarkdown('- [ ] **GPH-17** shared claim', 'change-a', 'sveltekit-frontend/openspec/changes/change-a/tasks.md', 'openspec://frontend');
  const archived = parseTasksMarkdown('- [ ] same claim without an ID', 'archive-change-a', 'openspec/changes/archive/change-a/tasks.md', 'openspec://root', true);
  const groups = classifyTaskDuplicates([...rootTasks, ...otherRootTask, ...frontendMirror, ...archived]);
  const types = new Set(groups.map((group) => group.classification));
  assert.equal(types.has('DUPLICATE_DECLARED_ID_SAME_CHANGE'), true);
  assert.equal(types.has('DUPLICATE_DECLARED_ID_CROSS_CHANGE'), true);
  assert.equal(types.has('DUPLICATE_NORMALIZED_CLAIM_SAME_CHANGE'), true);
  assert.equal(types.has('DUPLICATE_NORMALIZED_CLAIM_CROSS_CHANGE'), true);
  assert.equal(types.has('MIRROR_DUPLICATE'), true);
  assert.equal(types.has('ARCHIVE_DUPLICATE'), true);
  assert.equal(types.has('NAMESPACE_COLLISION'), true);
});

test('cross-authority dependency targets remain ambiguous instead of crossing namespaces', () => {
  const rootTask = parseTasksMarkdown('- [ ] **SRC-01** requires GPH-17', 'change-a', 'openspec/changes/change-a/tasks.md', 'openspec://root');
  const frontendTask = parseTasksMarkdown('- [ ] **GPH-17** frontend task', 'change-b', 'sveltekit-frontend/openspec/changes/change-b/tasks.md', 'openspec://frontend');
  const candidate = extractDependencyCandidates(rootTask[0])[0];
  const resolved = resolveDependencyCandidate(candidate, [...rootTask, ...frontendTask]);
  assert.equal(resolved.resolution, 'AMBIGUOUS');
  assert.equal(resolved.resolutionDetail, 'MATCHES_OTHER_AUTHORITY_SCOPE');
});

test('classifies whole tasks.md references as change-level diagnostics, not task edges', () => {
  const source = parseTasksMarkdown(
    '- [ ] **SRC-01** Depends on openspec/changes/target-change/tasks.md',
    'source-change',
    'openspec/changes/source-change/tasks.md',
    'openspec://root',
  );
  const target = parseTasksMarkdown(
    '- [ ] **TGT-01** target task',
    'target-change',
    'openspec/changes/target-change/tasks.md',
    'openspec://root',
  );
  const candidate = extractDependencyCandidates(source[0])
    .find((entry) => entry.parser === 'MARKDOWN_REFERENCE');
  const resolved = resolveDependencyCandidate(candidate, [...source, ...target]);
  assert.equal(resolved.resolution, 'CHANGE_LEVEL_REFERENCE');
  assert.equal(resolved.referencedChangeId, 'target-change');
  assert.equal(resolved.resolvedTaskKey, null);
});

test('legacy task-ID aliases bind diagnostically but never become proof', () => {
  const task = parseTasksMarkdown('- [x] **ABC-1** legacy task claim', 'change-a', 'openspec/changes/change-a/tasks.md', 'openspec://root')[0];
  const [binding] = resolveReceiptBindings([{
    uri: 'docs/reports/legacy-proof-audit.json',
    fileName: 'legacy-proof-audit.json',
    schema: 'legacy.audit.v1',
    canonicalSchemaValid: false,
    fields: {
      evidenceIds: ['legacy-proof-1'],
      taskIds: ['ABC-1'],
      claimIds: [],
      taskRefs: [],
      changeIds: ['change-a'],
      sourceRefs: [],
      gateIds: [],
      claims: [],
      commands: [],
      workspaceRevisions: [],
      sourceRevisions: [],
      checksums: [],
      verdicts: ['PASS'],
    },
  }], [task]);
  assert.equal(binding.bindingStrategy, 'EXACT_DECLARED_TASK_ID_WITHIN_CHANGE');
  assert.equal(binding.bindingType, 'BOUND_ALIAS');
  assert.equal(binding.resolution, 'BOUND');
  assert.equal(binding.proofEligible, false);
});

test('binds explicit gate aliases only inside their explicit OpenSpec change', () => {
  const task = parseTasksMarkdown(
    '- [ ] **ABC-1** implement GATE-01 behavior',
    'change-a',
    'openspec/changes/change-a/tasks.md',
    'openspec://root',
  )[0];
  const [binding] = resolveReceiptBindings([{
    uri: 'docs/reports/gate-proof.json',
    fileName: 'gate-proof.json',
    schema: 'legacy.audit.v1',
    canonicalSchemaValid: false,
    openSpecChange: 'change-a',
    gate: 'GATE-01',
  }], [task]);

  assert.equal(binding.bindingStrategy, 'EXACT_GATE_ID_WITHIN_CHANGE');
  assert.equal(binding.bindingType, 'BOUND_ALIAS');
  assert.equal(binding.resolution, 'BOUND');
  assert.equal(binding.proofEligible, false);
});

test('canonical taskId fields bind before ambiguous source references', () => {
  const tasks = parseTasksMarkdown([
    '- [ ] first claim',
    '- [ ] second claim',
  ].join('\n'), 'change-a', 'openspec/changes/change-a/tasks.md', 'openspec://root');
  const receipt = {
    uri: 'docs/reports/formula-receipt.json',
    fileName: 'formula-receipt.json',
    schema: 'atlas.evidence-receipt.v1',
    canonicalSchemaValid: true,
    fields: {
      evidenceIds: ['formula-1'],
      taskIds: [tasks[1].canonicalTaskRef],
      taskRefs: [],
      claimIds: [],
      changeIds: ['change-a'],
      sourceRefs: ['openspec/changes/change-a/tasks.md#L2'],
      gateIds: [],
      claims: [],
      commands: [],
      workspaceRevisions: ['sha256:workspace'],
      sourceRevisions: [`sha256:${'f'.repeat(64)}`],
      taskRevisions: [tasks[1].taskHash],
      checksums: ['sha256:receipt'],
      verdicts: ['PROVEN'],
    },
  };
  const [binding] = resolveReceiptBindings([receipt], tasks);
  assert.equal(binding.bindingStrategy, 'EXACT_CANONICAL_TASK_REF');
  assert.equal(binding.canonicalTaskRef, tasks[1].canonicalTaskRef);
  assert.equal(binding.resolution, 'BOUND');
  assert.equal(binding.proofEligible, true);
});

test('builds a read-only portfolio census and classifies unsupported proof as claim-only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-evidence-'));
  const change = path.join(root, 'openspec', 'changes', 'change-a');
  fs.mkdirSync(path.join(change, 'specs', 'contract'), { recursive: true });
  fs.writeFileSync(path.join(change, 'tasks.md'), '- [x] **ABC-1** implement the contract\n- [ ] **ABC-2** validate the receipt\n');
  fs.writeFileSync(path.join(change, 'proposal.md'), '# proposal\n');
  fs.writeFileSync(path.join(change, 'specs', 'contract', 'spec.md'), '# spec\n');
  const report = buildPortfolioCensus(root);
  assert.equal(report.summary.activeChanges, 1);
  assert.equal(report.summary.totalTasks, 2);
  assert.equal(report.summary.checkedWithoutEvidence, 1);
  assert.equal(report.summary.checkedWithEvidence, 0);
  assert.equal(report.evidenceCards.every((card) => card.proofState === 'CLAIM_ONLY'), true);
});

test('fails closed when a large task corpus has unresolved dependencies and unbound receipt candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-gates-'));
  const change = path.join(root, 'openspec', 'changes', 'change-a');
  const reports = path.join(root, 'docs', 'reports');
  fs.mkdirSync(change, { recursive: true });
  fs.mkdirSync(reports, { recursive: true });
  const taskLines = Array.from({ length: 101 }, (_, index) => {
    const id = `TASK-${String(index + 1).padStart(3, '0')}`;
    return index === 0 ? `- [ ] **${id}** requires MISSING-999` : `- [ ] **${id}** task claim ${index + 1}`;
  });
  fs.writeFileSync(path.join(change, 'tasks.md'), `${taskLines.join('\n')}\n`);
  for (let index = 0; index < 101; index += 1) {
    fs.writeFileSync(path.join(reports, `receipt-candidate-${index}.json`), JSON.stringify({ schema: 'legacy.audit.v1', taskId: `OLD-${index}` }));
  }

  const report = buildPortfolioCensus(root);
  assert.equal(report.summary.dependency_candidates > 0, true);
  assert.equal(report.summary.resolved_edges, 0);
  assert.equal(report.summary.receipts_total > 100, true);
  assert.equal(report.summary.bound_alias + report.summary.bound_exact + report.summary.bound_source_ref, 0);
  assert.equal(report.parserAudit.censusStatus, 'PARSER_INCOMPLETE');
  assert.deepEqual(report.parserAudit.additionalBlockingStatuses, ['PARSER_INCOMPLETE', 'BINDING_INCOMPLETE', 'CANONICAL_RECEIPTS_NOT_OBSERVED']);
  assert.equal(report.parserAudit.promotionEligible, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('does not re-ingest derived EVF reports as historical receipt candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-derived-reports-'));
  const change = path.join(root, 'openspec', 'changes', 'change-a');
  const reports = path.join(root, 'docs', 'reports');
  fs.mkdirSync(change, { recursive: true });
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(change, 'tasks.md'), '- [ ] **ABC-1** task claim\n');
  fs.writeFileSync(path.join(reports, 'openspec-evidence-health-v1.json'), JSON.stringify({ schema: 'atlas.openspec-evidence-health.v1' }));
  fs.writeFileSync(path.join(reports, 'openspec-evidence-cards-v1.json'), JSON.stringify({ schema: 'atlas.openspec-evidence-cards.v1' }));
  fs.writeFileSync(path.join(reports, 'openspec-task-evidence-bindings-v1.json'), JSON.stringify({ schema: 'atlas.openspec-task-evidence-bindings.v1' }));
  fs.writeFileSync(path.join(reports, 'openspec-evidence-pipeline-v1.json'), JSON.stringify({ schema: 'atlas.openspec-evidence-pipeline.v1' }));
  fs.writeFileSync(path.join(reports, 'openspec-evidence-census-reconciliation-v1.json'), JSON.stringify({ schema: 'atlas.openspec-evidence-census-reconciliation.v1' }));
  fs.writeFileSync(path.join(reports, 'legacy-proof-audit.json'), JSON.stringify({ schema: 'legacy.audit.v1', taskId: 'OLD-1' }));
  const evidenceRun = path.join(reports, 'openspec-evidence', 'run-1');
  fs.mkdirSync(evidenceRun, { recursive: true });
  fs.writeFileSync(path.join(evidenceRun, 'census-v1.json'), JSON.stringify({ schema: 'atlas.openspec-evidence-portfolio-census.v2' }));
  fs.writeFileSync(path.join(evidenceRun, 'tree-node-identity-formula-receipt-v1.json'), JSON.stringify({ schema: 'legacy.receipt.v1', taskId: 'OLD-2' }));
  fs.writeFileSync(path.join(evidenceRun, 'receipt-typing-v1.json'), JSON.stringify({ schema: 'atlas.openspec-receipt-typing.v1', taskId: 'OLD-3' }));
  fs.writeFileSync(path.join(evidenceRun, 'receipt-binding-v1.json'), JSON.stringify({ schema: 'atlas.openspec-orphan-binding-resolution.v1', taskId: 'OLD-4' }));
  fs.writeFileSync(path.join(evidenceRun, 'receipt-binding-audit-v1.json'), JSON.stringify({ schema: 'atlas.openspec-receipt-binding-audit.v1', taskId: 'OLD-5' }));
  const report = buildPortfolioCensus(root);
  assert.equal(report.summary.receipts_total, 2);
  assert.equal(report.summary.untypedReceiptCandidateCount, 2);
  assert.deepEqual(report.historicalReceiptCandidates.map((candidate) => candidate.uri).sort(), [
    'docs/reports/legacy-proof-audit.json',
    'docs/reports/openspec-evidence/run-1/tree-node-identity-formula-receipt-v1.json',
  ]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('promotes only an exact current receipt and marks it stale after task-source change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-proof-'));
  const change = path.join(root, 'openspec', 'changes', 'change-a');
  const tasksFile = path.join(change, 'tasks.md');
  fs.mkdirSync(path.join(root, 'docs', 'reports'), { recursive: true });
  fs.mkdirSync(change, { recursive: true });
  fs.writeFileSync(tasksFile, '- [x] **ABC-1** implement the contract\n');
  const initial = buildPortfolioCensus(root);
  const task = initial.tasks[0];
  const taskSource = fs.readFileSync(tasksFile);
  const sourceRevision = `sha256:${crypto.createHash('sha256').update(taskSource).digest('hex')}`;
  const implementationPath = path.join(root, 'src', 'implementation.mjs');
  fs.mkdirSync(path.dirname(implementationPath), { recursive: true });
  fs.writeFileSync(implementationPath, 'export const answer = 42;\n');
  const implementationRevision = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(implementationPath)).digest('hex')}`;
  const receipt = buildEvidenceReceiptV1({
    schema: 'atlas.evidence-receipt.v1',
    evidenceId: 'receipt:change-a:ABC-1:run-1',
    evidenceType: 'TEST',
    changeId: 'change-a',
    taskId: 'ABC-1',
    claim: 'The task implementation passed independent verification',
    workspaceRevision: initial.source.workspaceRevision,
    sourceRevision,
    taskRevision: task.taskHash,
    sourceRefs: [
      { file: 'openspec/changes/change-a/tasks.md', lineStart: 1, lineEnd: 1, sourceRevision },
      { file: 'src/implementation.mjs', lineStart: 1, lineEnd: 1, sourceRevision: implementationRevision },
    ],
    environmentFingerprint: `sha256:${'a'.repeat(64)}`,
    producer: 'vitest',
    inputs: [],
    observedAt: '2026-10-01T12:00:00Z',
    expectedAssertions: [{ id: 'assert-1', claimRef: 'predicate-abc', expected: 'test passes' }],
    actualAssertions: [{ id: 'assert-1', claimRef: 'predicate-abc', actual: 'test passes', passed: true }],
    outputs: [],
    independentVerifier: 'independent-audit',
    readbackRequired: false,
    readbackPerformed: false,
    verdict: 'PROVEN',
  });
  fs.writeFileSync(path.join(root, 'docs', 'reports', 'receipt-change-a.json'), `${JSON.stringify(receipt)}\n`);

  const proven = buildPortfolioCensus(root);
  assert.equal(proven.summary.checkedWithEvidence, 1);
  assert.equal(proven.summary.checkedWithoutEvidence, 0);
  assert.equal(proven.evidenceCards[0].proofState, 'PROVEN');
  assert.equal(proven.evidenceCards[0].sourceRevision, sourceRevision);
  assert.equal(proven.evidenceCards[0].proofUsable, true);
  assert.equal(proven.evidenceMatches[0].actualAssertions[0].claimRef, 'predicate-abc');
  assert.equal(proven.evidenceMatches[0].sourceRefsCurrent, true);

  fs.writeFileSync(implementationPath, 'export const answer = 43;\n');
  const staleImplementation = buildPortfolioCensus(root);
  assert.equal(staleImplementation.summary.staleEvidenceCount, 1);
  assert.equal(staleImplementation.evidenceCards[0].proofState, 'STALE');
  assert.equal(staleImplementation.evidenceMatches[0].sourceRefsCurrent, false);

  fs.writeFileSync(tasksFile, '- [x] **ABC-1** implement the revised contract\n');
  const stale = buildPortfolioCensus(root);
  assert.equal(stale.summary.staleEvidenceCount, 1);
  assert.equal(stale.evidenceCards[0].proofState, 'STALE');
  assert.equal(stale.evidenceCards[0].sourceRevision, `sha256:${crypto.createHash('sha256').update(fs.readFileSync(tasksFile)).digest('hex')}`);
  assert.equal(stale.evidenceCards[0].proofUsable, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('compiles bounded feature packets from card identities without raw documents', () => {
  const report = compileOpenSpecFeaturePacketsV1({
    schema: 'atlas.openspec-evidence-cards.v1',
    source: { workspaceRevision: 'sha256:workspace' },
    cards: [
      {
        checksum: 'sha256:card-a',
        taskIdentity: { taskRef: 'openspec/changes/change-a/tasks.md#L1', authorityScope: 'openspec://root', changeId: 'change-a', archived: false },
        proofState: 'CLAIM_ONLY',
        receiptRefs: [],
        blockers: [{ type: 'NO_RECEIPT' }],
        dependencyRefs: [{ taskRef: 'openspec-task:openspec://root/change-a/ABC-1' }],
        sourceRefs: ['openspec/changes/change-a/tasks.md#L1'],
      },
    ],
  });
  assert.equal(report.schema, 'atlas.openspec-feature-packets.v1');
  assert.equal(report.summary.packetCount, 1);
  assert.equal(report.summary.taskCount, 1);
  assert.equal(report.packets[0].rawDocumentsInjected, false);
  assert.equal(report.packets[0].proofStateCounts.CLAIM_ONLY, 1);
  assert.match(report.packets[0].checksum, /^sha256:/);
});

test('does not bind a whole tasks.md source path to every task in that file', () => {
  const tasks = [1, 2].map((line) => ({
    taskRef: `openspec/changes/change-a/tasks.md#L${line}`,
    canonicalTaskRef: `openspec-task:openspec://root/change-a/sha256:${String(line).padStart(64, '0')}`,
    taskId: null,
    authorityScope: 'openspec://root',
    changeId: 'change-a',
    tasksPath: 'openspec/changes/change-a/tasks.md',
    sourceLine: line,
    taskHash: `sha256:${String(line).padStart(64, '0')}`,
    taskIdentity: { normalizedClaimHash: `sha256:${String(line).padStart(64, '0')}` },
    taskText: `claim ${line}`,
    dependencySourceText: `- [ ] claim ${line}`,
  }));
  const previousIdentityPath = process.env.OPENSPEC_IDENTITY_RECOVERY_PATH;
  const previousReceiptTypesPath = process.env.OPENSPEC_RECEIPT_TYPES_PATH;
  process.env.OPENSPEC_IDENTITY_RECOVERY_PATH = 'docs/reports/fixture-identity-recovery.json';
  process.env.OPENSPEC_RECEIPT_TYPES_PATH = 'docs/reports/fixture-receipt-types.json';
  const report = resolveOpenSpecOrphanBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks,
    evidenceReceipts: [],
    historicalReceiptCandidates: [{
      uri: 'docs/reports/legacy.json',
      fileName: 'legacy.json',
      schema: 'legacy.audit.v1',
      fields: { sourceRefs: ['openspec/changes/change-a/tasks.md'], taskRefs: [], canonicalTaskKeys: [], taskIds: [], claimIds: [], migrationKeys: [], changeIds: [], gateIds: [], claims: [], workspaceRevisions: [], sourceRevisions: [], verdicts: [], commands: [], checksums: [] },
    }],
  }, { mappings: tasks.map((task) => ({ sourceRef: task.taskRef, canonicalTaskKey: task.canonicalTaskRef.replace('openspec-task:', ''), legacyCandidates: [] })) }, { receipts: [{ uri: 'docs/reports/legacy.json', candidateType: 'UNKNOWN' }] });
  if (previousIdentityPath === undefined) delete process.env.OPENSPEC_IDENTITY_RECOVERY_PATH;
  else process.env.OPENSPEC_IDENTITY_RECOVERY_PATH = previousIdentityPath;
  if (previousReceiptTypesPath === undefined) delete process.env.OPENSPEC_RECEIPT_TYPES_PATH;
  else process.env.OPENSPEC_RECEIPT_TYPES_PATH = previousReceiptTypesPath;
  assert.equal(report.summary.ambiguousCount, 0);
  assert.equal(report.bindings[0].strategy, null);
  assert.equal(report.bindings[0].bindingDisposition, 'TRUE_ORPHAN');
  assert.equal(report.bindings[0].bindingReason, 'NO_SUPPORTED_IDENTITY_HINTS');
});
