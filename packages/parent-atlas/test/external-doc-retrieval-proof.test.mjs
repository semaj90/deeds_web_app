import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExternalDocRetrievalFixtureSet,
  buildExternalDocRetrievalProofReceipt,
  buildExternalDocsCutoverGate,
  scoreRetrievalQuery,
} from '../dist/core/external-doc-retrieval-proof.js';

function fixture() {
  return buildExternalDocRetrievalFixtureSet({
    fixtureRevision: 'fixture-r1',
    sourceSnapshotRevision: 'snapshot-r1',
    queries: [
      {
        query_id: 'q1',
        query_revision: 'q-r1',
        query_text: 'Qdrant memory tiers cold cached pinned',
        expected_relevant_chunk_ids: ['c1', 'c2'],
        source_snapshot_revision: 'snapshot-r1',
        notes: null,
      },
      {
        query_id: 'q2',
        query_revision: 'q-r1',
        query_text: 'Firecrawl rawHtml screenshot change tracking',
        expected_relevant_chunk_ids: ['c3'],
        source_snapshot_revision: 'snapshot-r1',
        notes: null,
      },
    ],
  });
}

function receipt(lane, rankings) {
  return buildExternalDocRetrievalProofReceipt({
    receiptId: `receipt-${lane}`,
    receiptRevision: 'receipt-r1',
    fixture: fixture(),
    projectionRevision: 'projection-r1',
    qdrantVersion: '1.19.0',
    lane,
    k: 3,
    rankings,
    evaluatedAt: '2026-08-19T21:00:00.000Z',
    producerRevision: 'test-r1',
  });
}

test('retrieval scoring uses unique relevant hits for recall and first hit for reciprocal rank', () => {
  const row = scoreRetrievalQuery({
    fixture: fixture().queries[0],
    lane: 'DENSE',
    k: 4,
    rankedChunkIds: ['x', 'c2', 'c2', 'c1', 'late'],
  });
  assert.equal(row.recall_at_k, 1);
  assert.equal(row.reciprocal_rank, 0.5);
  assert.deepEqual(row.ranked_chunk_ids, ['x', 'c2', 'c2', 'c1']);
});

test('retrieval proof receipt computes exact mean recall and MRR', () => {
  const result = receipt('DENSE', {
    q1: ['c1', 'c2', 'x'],
    q2: ['x', 'c3'],
  });
  assert.equal(result.mean_recall_at_k, 1);
  assert.equal(result.mean_reciprocal_rank, 0.75);
});

test('cutover is ready only when all floors pass and hybrid does not regress', () => {
  const dense = receipt('DENSE', { q1: ['c1', 'c2'], q2: ['c3'] });
  const bm25 = receipt('BM25', { q1: ['c1'], q2: ['c3'] });
  const hybrid = receipt('HYBRID_RRF', { q1: ['c2', 'c1'], q2: ['c3'] });
  const gate = buildExternalDocsCutoverGate({
    gateId: 'cutover-1',
    gateRevision: 'gate-r1',
    projectionReceiptId: 'projection-receipt-1',
    capabilityGateId: 'capability-gate-1',
    dense,
    bm25,
    hybrid,
    minimumDenseRecall: 0.95,
    minimumBm25Recall: 0.70,
    minimumHybridRecall: 0.95,
  });
  assert.equal(gate.status, 'READY_FOR_CUTOVER');
  assert.equal(gate.hybrid_not_worse_than_best_single_lane, true);
  assert.equal(gate.old_collection_delete_allowed, false);
});

test('hybrid regression blocks cutover even if its absolute floor is permissive', () => {
  const dense = receipt('DENSE', { q1: ['c1', 'c2'], q2: ['c3'] });
  const bm25 = receipt('BM25', { q1: ['c1'], q2: ['c3'] });
  const hybrid = receipt('HYBRID_RRF', { q1: ['c1'], q2: ['x'] });
  const gate = buildExternalDocsCutoverGate({
    gateId: 'cutover-2',
    gateRevision: 'gate-r1',
    projectionReceiptId: 'projection-receipt-1',
    capabilityGateId: 'capability-gate-1',
    dense,
    bm25,
    hybrid,
    minimumDenseRecall: 0.9,
    minimumBm25Recall: 0.5,
    minimumHybridRecall: 0.4,
  });
  assert.equal(gate.status, 'BLOCKED');
  assert.ok(gate.blockers.includes('HYBRID_REGRESSION'));
});

test('cutover refuses receipts from different projection revisions', () => {
  const dense = receipt('DENSE', { q1: ['c1', 'c2'], q2: ['c3'] });
  const bm25 = receipt('BM25', { q1: ['c1'], q2: ['c3'] });
  const hybrid = {
    ...receipt('HYBRID_RRF', { q1: ['c1', 'c2'], q2: ['c3'] }),
    projection_revision: 'projection-r2',
  };
  assert.throws(() => buildExternalDocsCutoverGate({
    gateId: 'cutover-3',
    gateRevision: 'gate-r1',
    projectionReceiptId: 'projection-receipt-1',
    capabilityGateId: 'capability-gate-1',
    dense,
    bm25,
    hybrid,
  }));
});
