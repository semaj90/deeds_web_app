import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompactTaskCardSummaryV1, verifyCompactTaskCardSummaryV1 } from './openspec-task-card-v1.mjs';

test('compact summary preserves revision-bound review candidates and receipt distinctions', () => {
  const source = {
    workspaceHead: 'head:fixture',
    workspaceRevision: 'sha256:workspace',
    sourcePopulationChecksum: 'sha256:population',
    taskFileCount: 1,
    evidenceCensusStatus: 'DIAGNOSTIC_ONLY_NOT_PROMOTABLE',
  };
  const report = {
    schema: 'atlas.openspec-task-card-corpus.v1',
    source,
    summary: {
      taskCount: 2,
      retrievalStateCounts: { CURRENT: 1, REVIEW_REQUIRED: 1, WAITING: 0 },
      evidenceStateCounts: { CLAIM_ONLY: 2 },
      checkedWithoutProof: 0,
      supersessionReviewCandidates: 1,
      verifiedReceiptRefs: 0,
    },
    cards: [{
      stableKey: 'task:EX-02',
      declaredTaskId: 'EX-02',
      taskRef: 'openspec/changes/example/tasks.md#L12',
      canonicalTaskRef: 'task:example/EX-02',
      taskRevision: 'sha256:task',
      sourceFileRevision: 'sha256:file',
      workspaceRevision: 'sha256:workspace',
      sourcePath: 'openspec/changes/example/tasks.md',
      sourceLine: 12,
      claim: 'DUPLICATE_OF EX-01/EX-00',
      claimTruncated: false,
      declaredDuplicateTargets: ['EX-00', 'EX-01'],
      reviewReasons: ['EXPLICIT_DUPLICATE_OF_DECLARATION_REQUIRES_REVIEW'],
      evidenceState: 'CLAIM_ONLY',
      receiptCandidateRefs: ['receipt:candidate'],
      verifiedReceiptRefs: [],
    }],
  };
  const summary = buildCompactTaskCardSummaryV1(report);
  assert.equal(summary.schema, 'atlas.openspec-task-card-summary.v1');
  assert.equal(summary.source.workspaceRevision, source.workspaceRevision);
  assert.equal(summary.summary.reviewedSupersessionReceiptState, 'NOT_EVALUATED_NO_RECEIPT_INPUT');
  assert.deepEqual(summary.reviewCandidates[0].declaredDuplicateTargets, ['EX-00', 'EX-01']);
  assert.equal(summary.reviewCandidates[0].taskRevision, 'sha256:task');
  assert.equal(verifyCompactTaskCardSummaryV1(summary), true);
  assert.equal(verifyCompactTaskCardSummaryV1({ ...summary, source: { ...summary.source, workspaceRevision: 'sha256:other' } }), false);
  assert.throws(() => buildCompactTaskCardSummaryV1({ ...report, source: { ...source, workspaceRevision: null } }), /COMPACT_TASK_CARD_SUMMARY_SOURCE_INVALID/);
});
