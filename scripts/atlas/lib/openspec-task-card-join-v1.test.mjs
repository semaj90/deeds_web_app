import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTaskEvidenceCardJoinV1, evaluateTaskEvidenceAdmissionV1 } from './openspec-task-card-v1.mjs';
import { createHash } from 'node:crypto';

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('classifies TaskCard to EvidenceCard joins as zero, one, or many', () => {
  const tasks = [
    { source: 'openspec/changes/example/tasks.md', line: 5, blockHash: 'sha256:block', sourceFileRevision: 'sha256:file' },
    { source: 'openspec/changes/example/tasks.md', line: 6, blockHash: 'sha256:other', sourceFileRevision: 'sha256:file' },
    { source: 'openspec/changes/example/tasks.md', line: 7, blockHash: 'sha256:many', sourceFileRevision: 'sha256:file' },
  ];
  const result = classifyTaskEvidenceCardJoinV1({
    tasks,
    workspaceRevision: 'sha256:workspace',
    evidenceTasks: tasks.map((item, index) => ({ taskRef: `${item.source}#L${item.line}`, taskHash: item.blockHash, canonicalTaskRef: `task:${index}`, taskIdentity: { logicalTaskKey: `logical:${index}` } })),
    evidenceCards: [
      { taskRef: `${tasks[1].source}#L6`, workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:file' },
      { taskRef: `${tasks[2].source}#L7`, workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:file' },
      { taskRef: `${tasks[2].source}#L7`, workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:file' },
    ],
  });
  assert.deepEqual(result.cardinalityCounts, { ZERO: 1, ONE: 1, MANY: 1 });
  assert.equal(result.rows[0].joinable, false);
  assert.equal(result.rows[1].joinable, true);
  assert.equal(result.rows[2].joinable, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('requires exact whole-file source revision for TaskCard and EvidenceCard joins', () => {
  const source = 'openspec/changes/example/tasks.md';
  const task = { source, line: 5, blockHash: 'sha256:block', sourceFileRevision: `sha256:${'a'.repeat(64)}` };
  const evidenceTask = { taskRef: `${source}#L5`, taskHash: task.blockHash, canonicalTaskRef: 'task:one' };
  const result = classifyTaskEvidenceCardJoinV1({
    tasks: [task],
    evidenceTasks: [evidenceTask],
    evidenceCards: [{ taskRef: evidenceTask.taskRef, workspaceRevision: 'sha256:workspace', sourceRevision: `sha256:${'b'.repeat(64)}` }],
    workspaceRevision: 'sha256:workspace',
  });
  assert.equal(result.rows[0].joinable, false);
  assert.deepEqual(result.rows[0].reasons, ['SOURCE_FILE_REVISION_MISMATCH']);
});

test('admits task-claim proof only with checksummed card and exact receipt lineage', () => {
  const taskRef = 'openspec/changes/example/tasks.md#L5';
  const sourceRevision = `sha256:${'a'.repeat(64)}`;
  const taskRevision = `sha256:${'b'.repeat(64)}`;
  const workspaceRevision = `sha256:${'c'.repeat(64)}`;
  const evidenceId = 'receipt:example:EX-1';
  const unsignedCard = {
    schema: 'atlas.evidence-card.v1', taskRef, changeId: 'example', taskId: 'EX-1',
    claim: 'Validate exact evidence', proofState: 'PROVEN', retrievalUsable: true,
    proofUsable: true, rejectionReasons: [], sourceRef: taskRef, sourceRevision,
    conceptID: 'openspec:example:EX-1', confidenceScore: 1, contextBlob: 'PROVEN',
    evidenceIds: [evidenceId], workspaceRevision,
  };
  const evidenceCard = { ...unsignedCard, checksum: sha256(canonicalJson(unsignedCard)) };
  const admission = evaluateTaskEvidenceAdmissionV1({
    taskCard: { stableKey: 'task:example:EX-1', taskRef, canonicalTaskRef: 'openspec-task:example/EX-1', taskRevision, sourceRevision, workspaceRevision },
    evidenceTask: { taskRef, canonicalTaskRef: 'openspec-task:example/EX-1', taskHash: taskRevision },
    evidenceCard,
    receiptBindings: [{
      evidenceId, canonicalTaskRef: 'openspec-task:example/EX-1', proofEligible: true,
      workspaceCurrent: true, sourceCurrent: true, sourceRefsCurrent: true, taskSpanMatched: true,
      sourceRevision, taskRevision, workspaceRevision,
      sourceRefChecks: [{ current: true, expectedRevision: sourceRevision, observedRevision: sourceRevision }],
    }],
  });
  assert.equal(admission.admitted, true);
  assert.equal(admission.admissionScope, 'TASK_CLAIM_PROOF_ONLY');
  assert.equal(admission.canonicalAuthority, false);
  assert.equal(admission.writesPerformed, false);
});

test('does not admit a reference-only or source-revision-mismatched evidence card', () => {
  const taskRef = 'openspec/changes/example/tasks.md#L5';
  const sourceRevision = `sha256:${'a'.repeat(64)}`;
  const taskRevision = `sha256:${'b'.repeat(64)}`;
  const workspaceRevision = `sha256:${'c'.repeat(64)}`;
  const unsignedCard = {
    schema: 'atlas.evidence-card.v1', taskRef, changeId: 'example', taskId: 'EX-1',
    claim: 'Validate exact evidence', proofState: 'PARTIAL', retrievalUsable: true,
    proofUsable: false, rejectionReasons: [], sourceRef: taskRef,
    sourceRevision: `sha256:${'d'.repeat(64)}`, conceptID: 'openspec:example:EX-1',
    confidenceScore: 0.5, contextBlob: 'PARTIAL', evidenceIds: [], workspaceRevision,
  };
  const evidenceCard = { ...unsignedCard, checksum: sha256(canonicalJson(unsignedCard)) };
  const admission = evaluateTaskEvidenceAdmissionV1({
    taskCard: { stableKey: 'task:example:EX-1', taskRef, canonicalTaskRef: 'openspec-task:example/EX-1', taskRevision, sourceRevision, workspaceRevision },
    evidenceTask: { taskRef, canonicalTaskRef: 'openspec-task:example/EX-1', taskHash: taskRevision },
    evidenceCard,
    receiptBindings: [],
  });
  assert.equal(admission.admitted, false);
  assert.equal(admission.reason, 'DIAGNOSTIC_ONLY');
  assert.deepEqual(admission.reasonCodes, [
    'DIAGNOSTIC_ONLY',
    'NO_EXACT_VERIFIED_RECEIPT_BINDING',
    'RECEIPT_SOURCE_FILE_REVISION_MISMATCH',
    'RECEIPT_TASK_REVISION_MISMATCH',
    'SOURCE_REVISION_MISMATCH',
  ]);
});

test('rejects receipts that bind the current task file but the wrong task-block revision', () => {
  const taskRef = 'openspec/changes/example/tasks.md#L5';
  const sourceRevision = `sha256:${'a'.repeat(64)}`;
  const taskRevision = `sha256:${'b'.repeat(64)}`;
  const workspaceRevision = `sha256:${'c'.repeat(64)}`;
  const evidenceId = 'receipt:example:EX-1';
  const unsignedCard = {
    schema: 'atlas.evidence-card.v1', taskRef, changeId: 'example', taskId: 'EX-1',
    claim: 'Validate exact evidence', proofState: 'PROVEN', retrievalUsable: true,
    proofUsable: true, rejectionReasons: [], sourceRef: taskRef, sourceRevision,
    conceptID: 'openspec:example:EX-1', confidenceScore: 1, contextBlob: 'PROVEN',
    evidenceIds: [evidenceId], workspaceRevision,
  };
  const evidenceCard = { ...unsignedCard, checksum: sha256(canonicalJson(unsignedCard)) };
  const admission = evaluateTaskEvidenceAdmissionV1({
    taskCard: { stableKey: 'task:example:EX-1', taskRef, canonicalTaskRef: 'openspec-task:example/EX-1', taskRevision, sourceRevision, workspaceRevision },
    evidenceTask: { taskRef, canonicalTaskRef: 'openspec-task:example/EX-1', taskHash: taskRevision },
    evidenceCard,
    receiptBindings: [{
      evidenceId, canonicalTaskRef: 'openspec-task:example/EX-1', proofEligible: true,
      workspaceCurrent: true, sourceCurrent: true, sourceRefsCurrent: true, taskSpanMatched: true,
      sourceRevision, taskRevision: `sha256:${'d'.repeat(64)}`, workspaceRevision,
      sourceRefChecks: [{ current: true, expectedRevision: sourceRevision, observedRevision: sourceRevision }],
    }],
  });
  assert.equal(admission.admitted, false);
  assert.ok(admission.reasonCodes.includes('RECEIPT_TASK_REVISION_MISMATCH'));
  assert.ok(admission.reasonCodes.includes('NO_EXACT_VERIFIED_RECEIPT_BINDING'));
});

test('classifies every EvidenceCard against TaskCards, including orphan and ambiguous refs', () => {
  const source = 'openspec/changes/example/tasks.md';
  const tasks = [
    { source, line: 5, stableKey: 'task:one' },
    { source, line: 7, stableKey: 'task:many-a' },
    { source, line: 7, stableKey: 'task:many-b' },
  ];
  const result = classifyTaskEvidenceCardJoinV1({
    tasks,
    evidenceTasks: [],
    workspaceRevision: 'sha256:workspace',
    evidenceCards: [
      { taskRef: `${source}#L5`, workspaceRevision: 'sha256:workspace' },
      { taskRef: `${source}#L6`, workspaceRevision: 'sha256:workspace' },
      { taskRef: `${source}#L7`, workspaceRevision: 'sha256:old-workspace' },
    ],
  });
  assert.deepEqual(result.evidenceCardCardinalityCounts, { ZERO: 1, ONE: 1, MANY: 1 });
  assert.equal(result.evidenceCardRows[0].cardinality, 'ONE');
  assert.equal(result.evidenceCardRows[1].cardinality, 'ZERO');
  assert.equal(result.evidenceCardRows[2].cardinality, 'MANY');
  assert.equal(result.evidenceCardRows[2].workspaceRevisionMatched, false);
  assert.deepEqual(result.evidenceCardRows[2].taskCardStableKeys, ['task:many-a', 'task:many-b']);
});

test('keeps archived EvidenceCards distinct from active-snapshot orphans', () => {
  const result = classifyTaskEvidenceCardJoinV1({
    tasks: [{ source: 'openspec/changes/current/tasks.md', line: 5, stableKey: 'task:current' }],
    evidenceTasks: [],
    workspaceRevision: 'sha256:workspace',
    evidenceCards: [
      { taskRef: 'openspec/changes/archive/old/tasks.md#L7', workspaceRevision: 'sha256:workspace' },
      { taskRef: 'openspec/changes/current/tasks.md#L9', workspaceRevision: 'sha256:workspace' },
      { taskRef: 'sveltekit-frontend/openspec/changes/other/tasks.md#L11', workspaceRevision: 'sha256:workspace' },
    ],
  });
  assert.deepEqual(result.evidenceCardScopeCounts, { ACTIVE: 1, ARCHIVED: 1, OTHER: 1 });
  assert.deepEqual(result.activeEvidenceCardCardinalityCounts, { ZERO: 1, ONE: 0, MANY: 0 });
  assert.equal(result.evidenceCardRows[0].scope, 'ARCHIVED');
  assert.deepEqual(result.evidenceCardRows[0].reasons, ['ARCHIVED_EVIDENCE_CARD_OUTSIDE_ACTIVE_TASK_SNAPSHOT']);
  assert.equal(result.evidenceCardRows[2].scope, 'OTHER');
  assert.deepEqual(result.evidenceCardRows[2].reasons, ['EVIDENCE_CARD_OUTSIDE_ROOT_OPENSPEC_SCOPE']);
});
