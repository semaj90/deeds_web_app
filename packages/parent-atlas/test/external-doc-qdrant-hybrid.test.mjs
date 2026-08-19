import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultExternalDocsHybridMigrationPlan,
  externalDocsHybridPointSchema,
  externalDocsHybridProjectionReceiptSchema,
  hybridWirePoint,
  projectExternalDocDelta,
  qdrantPointUuidForChunk,
} from '../dist/index.js';

const h = (char) => char.repeat(64);
const vector = (seed = 0) => Array.from({ length: 768 }, (_, index) => ((index + seed) % 17) / 17);

function point(chunkId = 'chunk-1') {
  return externalDocsHybridPointSchema.parse({
    point_id: qdrantPointUuidForChunk(chunkId),
    chunk_id: chunkId,
    source_id: 'qdrant',
    source_revision: 'docs-r1',
    document_checksum: h('a'),
    chunk_checksum: h('b'),
    domain_class: 'retrieval',
    ontology_classes: ['RETRIEVAL', 'ALGORITHM'],
    language: 'en',
    text: 'BM25 uses inverse document frequency.',
    semantic_768: vector(),
    embedding_revision: 'embedding-r1',
    producer_revision: 'test-r1',
  });
}

test('stable Qdrant UUID is deterministic but transport-only', () => {
  const a = qdrantPointUuidForChunk('chunk-42');
  const b = qdrantPointUuidForChunk('chunk-42');
  const c = qdrantPointUuidForChunk('chunk-43');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test('hybrid point always carries dense semantic and BM25 text in one wire point', () => {
  const wire = hybridWirePoint(point());
  assert.equal(wire.vector.semantic_768.length, 768);
  assert.deepEqual(wire.vector.lexical_bm25, {
    text: 'BM25 uses inverse document frequency.',
    model: 'qdrant/bm25',
  });
  assert.equal(wire.payload.chunk_id, 'chunk-1');
  assert.equal(wire.payload.canonical_authority, false);
});

test('invalid semantic dimensions fail before Qdrant', () => {
  assert.throws(() => externalDocsHybridPointSchema.parse({
    ...point(),
    semantic_768: [0.1, 0.2],
  }));
});

test('incremental projection writes only changed and deleted points', async () => {
  const calls = { upsert: [], delete: [] };
  const port = {
    async upsert(points) { calls.upsert.push(points); return [11]; },
    async delete(ids) { calls.delete.push(ids); return [12]; },
  };
  const receipt = await projectExternalDocDelta({
    port,
    projectionRevision: 'projection-r2',
    sourceSnapshotRevision: 'source-r2',
    changed: [point('changed-1'), point('changed-2')],
    deletedChunkIds: ['deleted-1'],
    unchangedPointCount: 1000,
    producerRevision: 'test-r1',
  });
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].length, 2);
  assert.equal(calls.delete.length, 1);
  assert.equal(calls.delete[0].length, 1);
  assert.equal(receipt.changed_point_count, 2);
  assert.equal(receipt.deleted_point_count, 1);
  assert.equal(receipt.unchanged_point_count, 1000);
  assert.equal(receipt.status, 'WRITTEN_UNVERIFIED');
});

test('verified projection cannot exist without all retrieval parity receipts', () => {
  assert.throws(() => externalDocsHybridProjectionReceiptSchema.parse({
    receipt_id: 'receipt-r1',
    collection_name: 'external_programming_docs_hybrid_768',
    projection_revision: 'projection-r1',
    source_snapshot_revision: 'source-r1',
    changed_point_count: 1,
    deleted_point_count: 0,
    unchanged_point_count: 0,
    dense_vector_name: 'semantic_768',
    sparse_vector_name: 'lexical_bm25',
    bm25_modifier: 'idf',
    point_set_checksum: h('c'),
    status: 'VERIFIED',
    producer_revision: 'test-r1',
  }));
});

test('migration uses a shadow collection and never authorizes deleting the old owner', () => {
  const plan = defaultExternalDocsHybridMigrationPlan('migration-r1');
  assert.equal(plan.source_collection, 'external_programming_docs_768');
  assert.equal(plan.shadow_collection, 'external_programming_docs_hybrid_768');
  assert.equal(plan.old_collection_delete_allowed, false);
  assert.equal(plan.collection_schema.sparse_modifier, 'idf');
  assert.equal(plan.collection_schema.semantic_lane_votes, 1);
});
