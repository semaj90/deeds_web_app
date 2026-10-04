import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenSpecTaskCardReportV1, classifyTaskCardRetrievalState } from './openspec-task-card-v1.mjs';

const head = 'deadbeef';
const task = {
  taskKey: 'example:5',
  change: 'example',
  source: 'openspec/changes/example/tasks.md',
  line: 5,
  text: 'Do the work',
  state: 'DONE',
  executionState: 'DONE',
  lane: 'GENERAL',
  blockHash: 'sha256:block',
  stableKey: 'example#stable',
  logicalTaskKey: 'example:EX-01',
  taskIdentity: { logicalTaskKey: 'example:EX-01', basis: 'DECLARED_ID' },
  declared: { dependsOn: [], reads: [], writes: [] },
  dependsOnTaskIds: [],
  gateState: 'COMPLETE',
  controllerState: 'CURRENT',
};
const evidenceTask = {
  tasksPath: task.source,
  sourceLine: task.line,
  taskRef: `${task.source}#L${task.line}`,
  taskHash: task.blockHash,
  taskText: task.text,
  canonicalTaskRef: 'openspec-task:example/EX-01',
  taskIdentity: {
    declaredTaskId: 'EX-01',
    identityState: 'DECLARED_ID',
  },
};
const evidenceCard = {
  taskRef: evidenceTask.taskRef,
  workspaceRevision: 'sha256:workspace',
  proofState: 'CLAIM_ONLY',
  evidenceIds: [],
  blockers: [],
  contradictions: [],
};

test('checked claim without proof is review-required, never superseded', () => {
  const report = buildOpenSpecTaskCardReportV1({
    workboard: {
      schema: 'atlas.openspec.workboard-task-snapshot.v1',
      generatedAt: '2026-10-03T00:00:00.000Z',
      summary: { totalTasks: 1 },
      sourceFileHashes: { [task.source]: 'sha256:file' },
      tasks: [task],
    },
    evidenceCensus: {
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      generatedAt: '2026-10-03T00:00:00.000Z',
      source: { gitCommit: head, workspaceRevision: 'sha256:workspace' },
      tasks: [{ ...evidenceTask, archived: false }],
      evidenceCards: [evidenceCard],
      proofEligibleReceiptMatches: [],
      parserAudit: { censusStatus: 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE' },
    },
    head,
    taskFileHashes: { [task.source]: 'sha256:file' },
  });
  assert.equal(report.cards[0].retrievalState, 'REVIEW_REQUIRED');
  assert.equal(report.cards[0].state, 'CHECKED');
  assert.equal(report.cards[0].evidenceState, 'CLAIM_ONLY');
  assert.equal(report.cards[0].canonicalAuthority, false);
  assert.equal(report.cardPolicy.mutationAuthorized, false);
  assert.equal(report.summary.checkedWithoutProof, 1);
  assert.equal(report.summary.reportManifestsJoined, 0);
  assert.deepEqual(report.retrievalPolicy.defaultStates, ['CURRENT', 'WAITING', 'REVIEW_REQUIRED']);
});

test('text-only supersession candidates route to review rather than suppress', () => {
  const result = classifyTaskCardRetrievalState({
    ...task,
    state: 'OPEN',
    executionState: 'ACTIONABLE',
    supersessionReviewState: 'REVIEW_REQUIRED',
    gateState: 'ACTIONABLE',
  }, { ...evidenceCard, proofState: 'CLAIM_ONLY' });
  assert.equal(result.retrievalState, 'REVIEW_REQUIRED');
  assert.deepEqual(result.reviewReasons, ['SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED']);
});

test('TaskCard carries report outputs only from current revision-qualified receipts', () => {
  const report = buildOpenSpecTaskCardReportV1({
    workboard: {
      schema: 'atlas.openspec.workboard-task-snapshot.v1',
      summary: { totalTasks: 1 },
      sourceFileHashes: { [task.source]: 'sha256:file' },
      tasks: [task],
    },
    evidenceCensus: {
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      source: { gitCommit: head, workspaceRevision: 'sha256:workspace' },
      tasks: [{ ...evidenceTask, archived: false }],
      evidenceCards: [evidenceCard],
      proofEligibleReceiptMatches: [],
      evidenceMatches: [{
        uri: 'docs/reports/receipt.json',
        canonicalTaskRef: evidenceTask.canonicalTaskRef,
        evidenceId: 'receipt:example:task:v1',
        sourceRevision: task.blockHash,
        workspaceRevision: 'sha256:workspace',
        proofEligible: true,
        sourceCurrent: true,
        workspaceCurrent: true,
        outputs: [{ uri: 'docs/reports/openspec-example.json', checksum: 'sha256:output' }],
      }],
    },
    head,
    taskFileHashes: { [task.source]: 'sha256:file' },
  });
  assert.deepEqual(report.cards[0].receiptOutputRefs, [{
    taskKey: task.logicalTaskKey,
    artifactId: 'docs/reports/openspec-example.json',
    sha256: 'sha256:output',
    receiptRef: 'receipt:example:task:v1',
    receiptUri: 'docs/reports/receipt.json',
    taskRef: evidenceTask.taskRef,
    taskRevision: task.blockHash,
    workspaceRevision: 'sha256:workspace',
  }]);
});

test('rejects task/evidence joins whose block revision differs', () => {
  assert.throws(() => buildOpenSpecTaskCardReportV1({
    workboard: {
      schema: 'atlas.openspec.workboard-task-snapshot.v1',
      summary: {},
      tasks: [task],
    },
    evidenceCensus: {
      schema: 'atlas.openspec-evidence-portfolio-census.v2',
      source: { gitCommit: head, workspaceRevision: 'sha256:workspace' },
      tasks: [{ ...evidenceTask, taskHash: 'sha256:stale', archived: false }],
      evidenceCards: [evidenceCard],
    },
    head,
    taskFileHashes: { [task.source]: 'sha256:file' },
  }), /TASK_CARD_TASK_REVISION_UNJOINED/);
});
