#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCollectionAudit,
  bytesPerDatatype,
  classifyCollection,
  estimateRawDenseVectorBytes,
  extractDenseVectorSchema,
  metadataProposalFor,
  sumSnapshotBytes,
  summarizeAudits,
} from './lib/qdrant-storage-consolidation-v1.mjs';

test('datatype byte widths follow Qdrant dense storage types', () => {
  assert.equal(bytesPerDatatype(null), 4);
  assert.equal(bytesPerDatatype('Float32'), 4);
  assert.equal(bytesPerDatatype('Float16'), 2);
  assert.equal(bytesPerDatatype('Uint8'), 1);
  assert.equal(bytesPerDatatype('Turbo4'), 0.5);
});

test('named vector schema counts every dense vector independently', () => {
  const info = {
    result: {
      config: {
        params: {
          vectors: {
            content: { size: 768, distance: 'Cosine' },
            error: { size: 768, distance: 'Cosine', datatype: 'Float16' },
            signature: { size: 768, distance: 'Cosine' },
          },
        },
      },
    },
  };
  const schema = extractDenseVectorSchema(info);
  assert.equal(schema.length, 3);
  assert.deepEqual(schema.map((row) => row.name), ['content', 'error', 'signature']);
  assert.equal(estimateRawDenseVectorBytes(10, schema), 10 * 768 * (4 + 2 + 4));
});

test('single-vector schema is supported', () => {
  const schema = extractDenseVectorSchema({ result: { config: { params: { vectors: { size: 64, distance: 'Cosine' } } } } });
  assert.equal(schema.length, 1);
  assert.equal(schema[0].name, '');
  assert.equal(schema[0].size, 64);
});

test('snapshot bytes sum independently from collection data', () => {
  assert.equal(sumSnapshotBytes({ result: [{ size: 10 }, { size: 20 }, { size: 0 }] }), 30);
});

test('explicit policy classifies the active semantic projection as current owner', () => {
  const row = classifyCollection('codebase_chunks_768_v2', { result: { points_count: 52816 } });
  assert.equal(row.classification, 'CURRENT_OWNER');
  assert.equal(row.logicalRepresentation, 'semantic_768');
  assert.equal(metadataProposalFor(row).canonicalAuthority, false);
});

test('legacy semantic collection is rollback/migration evidence, never auto-delete', () => {
  const row = buildCollectionAudit({
    name: 'codebase_chunks_768',
    info: {
      result: {
        status: 'green',
        points_count: 100,
        config: { params: { vectors: { content: { size: 768, distance: 'Cosine' } } } },
      },
    },
    memory: { result: { total: { disk: 123456 } } },
    snapshots: { result: [{ name: 'a', size: 500000 }] },
  });
  assert.equal(row.classification.classification, 'MIGRATION_ROLLBACK');
  assert.equal(row.deletionAuthorized, false);
  assert.equal(row.snapshotBytes, 500000);
});

test('routing topology collection is classified separately from semantic authority', () => {
  const row = classifyCollection('codebase_topology_64', { result: { points_count: 50000 } });
  assert.equal(row.classification, 'ROUTING_ONLY');
  assert.equal(row.logicalRepresentation, 'latent_64');
});

test('unknown populated collection fails closed to review', () => {
  const row = classifyCollection('mystery_vectors', { result: { points_count: 12 } });
  assert.equal(row.classification, 'REVIEW_REQUIRED');
  assert.equal(metadataProposalFor(row), null);
});

test('only empty explicitly nonproduction-named collection can be tagged orphan heuristically', () => {
  const orphan = classifyCollection('scratch_vectors_test', { result: { points_count: 0 } });
  assert.equal(orphan.classification, 'ORPHAN');
  const nonempty = classifyCollection('scratch_vectors_test', { result: { points_count: 1 } });
  assert.equal(nonempty.classification, 'REVIEW_REQUIRED');
});

test('summary distinguishes snapshot bytes from live collection bytes', () => {
  const rows = [
    buildCollectionAudit({
      name: 'codebase_chunks_768_v2',
      info: { result: { points_count: 10, config: { params: { vectors: { content: { size: 768 } } } } } },
      memory: { result: { total: { disk: 1000 } } },
      snapshots: { result: [] },
    }),
    buildCollectionAudit({
      name: 'codebase_chunks_768',
      info: { result: { points_count: 10, config: { params: { vectors: { content: { size: 768 } } } } } },
      memory: { result: { total: { disk: 1000 } } },
      snapshots: { result: [{ size: 5000 }] },
    }),
  ];
  const summary = summarizeAudits(rows);
  assert.equal(summary.collectionDiskBytes, 2000);
  assert.equal(summary.snapshotBytes, 5000);
  assert.equal(summary.snapshotDominated, true);
  assert.deepEqual(summary.currentOwners, ['codebase_chunks_768_v2']);
  assert.deepEqual(summary.migrationRollbackCollections, ['codebase_chunks_768']);
});
