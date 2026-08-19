import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExternalDocRetrievalFixtureSet,
  evaluateExternalDocRetrieval,
  externalDocsHybridProjectionReceiptSchema,
  qdrantExternalDocsCapabilityProfileSchema,
  buildExternalDocsHybridProofGate,
} from '../dist/index.js';

const h = (char) => char.repeat(64);

function fixture() {
  return buildExternalDocRetrievalFixtureSet({
    fixtureRevision: 'fixture-r1',
    sourceSnapshotRevision: 'snapshot-r1',
    queries: [
      {
        query_id: 'q1',
        query_revision: 'q-r1',
        query_text: 'qdrant bm25 memory tiers',
        expected_relevant_chunk_ids: ['c1', 'c2'],
        source_snapshot_revision: 'snapshot-r1',
        notes: null,
      },
      {
        query_id: 'q2',
        query_revision: 'q-r1',
        query_text: 'firecrawl screenshot raw html',
        expected_relevant_chunk_ids: ['c3'],
        source_snapshot_revision: 'snapshot-r1',
        notes: null,
      },
    ],
  });
}

function capabilityGate(status = 'SUPPORTED') {
  const profile = qdrantExternalDocsCapabilityProfileSchema.parse({
    probed_at: '2026-08-19T22:00:00.000Z',
    qdrant_version: '1.19.0',
    qdrant_commit: 'abc',
    supports_sparse_vectors: true,
    supports_idf_modifier: true,
    supports_hybrid_query_api: true,
    supports_named_vector_schema_update: true,
    supports_memory_tiers_v119: true,
    native_bm25_inference: status,
    current_collection_exists: true,
    shadow_collection_exists: true,
    current_collection_vector_mode: 'UNNAMED_DENSE',
    shadow_collection_vector_mode: 'HYBRID_DENSE_SPARSE',
    producer_revision: 'test-r1',
  });
  return buildExternalDocsHybridProofGate({
    gateId: 'cap-gate',
    gateRevision: 'cap-r1',
    profile,
  });
}

function projection(sourceSnapshotRevision = 'snapshot-r1') {
  return externalDocsHybridProjectionReceiptSchema.parse({
    receipt_id: 'projection-1',
    collection_name: 'external_programming_docs_hybrid_768',
    projection_revision: 'projection-r1',
    source_snapshot_revision: sourceSnapshotRevision,
    changed_point_count: 3,
    deleted_point_count: 0,
    unchanged_point_count: 0,
    dense_vector_name: 'semantic_768',
    sparse_vector_name: 'lexical_bm25',
    bm25_modifier: 'idf',
    point_set_checksum: h('a'),
    qdrant_operation_ids: [1],
    status: 'WRITTEN_UNVERIFIED',
    producer_revision: 'test-r1',
  });
}

function port() {
  return {
    async embedSemantic768(text) {
      const value = text.includes('firecrawl') ? 0.2 : 0.1;
      return Array.from({ length: 768 }, () => value);
    },
    async queryDense({ queryVector }) {
      return queryVector[0] === 0.2 ? ['c3', 'x'] : ['c1', 'c2', 'x'];
    },
    async queryBm25({ queryText }) {
      return queryText.includes('firecrawl') ? ['c3', 'x'] : ['c1', 'x', 'c2'];
    },
    async queryHybridRrf({ queryText }) {
      return queryText.includes('firecrawl') ? ['c3', 'x'] : ['c2', 'c1', 'x'];
    },
  };
}

test('bounded evaluator emits three receipts, verifies projection and derives cutover gate', async () => {
  const bundle = await evaluateExternalDocRetrieval({
    port: port(),
    evaluationId: 'eval-r1',
    fixture: fixture(),
    capabilityGate: capabilityGate(),
    projectionReceipt: projection(),
    receiptRevision: 'receipt-r1',
    producerRevision: 'test-r1',
    evaluatedAt: '2026-08-19T22:00:00.000Z',
    k: 3,
    prefetchK: 10,
    minimumDenseRecall: 0.95,
    minimumBm25Recall: 0.95,
    minimumHybridRecall: 0.95,
  });
  assert.equal(bundle.dense_receipt.mean_recall_at_k, 1);
  assert.equal(bundle.bm25_receipt.mean_recall_at_k, 1);
  assert.equal(bundle.hybrid_receipt.mean_recall_at_k, 1);
  assert.equal(bundle.projection_receipt_verified.status, 'VERIFIED');
  assert.equal(bundle.cutover_gate.status, 'READY_FOR_CUTOVER');
  assert.match(bundle.bundle_checksum, /^[a-f0-9]{64}$/);
});

test('evaluator fails closed when capability gate is blocked', async () => {
  await assert.rejects(() => evaluateExternalDocRetrieval({
    port: port(),
    evaluationId: 'eval-blocked',
    fixture: fixture(),
    capabilityGate: capabilityGate('UNSUPPORTED'),
    projectionReceipt: projection(),
    receiptRevision: 'receipt-r1',
    producerRevision: 'test-r1',
  }), /EXTERNAL_DOC_CAPABILITY_GATE_BLOCKED/);
});

test('evaluator refuses fixture and projection from different source snapshots', async () => {
  await assert.rejects(() => evaluateExternalDocRetrieval({
    port: port(),
    evaluationId: 'eval-revision-mismatch',
    fixture: fixture(),
    capabilityGate: capabilityGate(),
    projectionReceipt: projection('snapshot-r2'),
    receiptRevision: 'receipt-r1',
    producerRevision: 'test-r1',
  }), /EXTERNAL_DOC_FIXTURE_PROJECTION_SOURCE_REVISION_MISMATCH/);
});

test('query embeddings must remain exactly semantic_768', async () => {
  const badPort = { ...port(), embedSemantic768: async () => [1, 2, 3] };
  await assert.rejects(() => evaluateExternalDocRetrieval({
    port: badPort,
    evaluationId: 'eval-bad-dim',
    fixture: fixture(),
    capabilityGate: capabilityGate(),
    projectionReceipt: projection(),
    receiptRevision: 'receipt-r1',
    producerRevision: 'test-r1',
  }), /EXTERNAL_DOC_QUERY_EMBEDDING_DIMENSION_MISMATCH/);
});
