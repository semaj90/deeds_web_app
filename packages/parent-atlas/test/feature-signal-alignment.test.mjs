import test from 'node:test';
import assert from 'node:assert/strict';

import { featureSignalAlignmentSchema, featureSignalBlockSchema } from '../dist/core/feature-signal-alignment.js';

const hash = 'a'.repeat(64);

test('aligned blocks must share one canonical row ordering', () => {
  const value = featureSignalAlignmentSchema.parse({
    alignment_revision: 'align:r1',
    feature_snapshot_revision: 'feature:r1',
    row_identity_checksum: hash,
    row_count: 2,
    blocks: [
      {
        block_id: 'semantic', block_revision: 'semantic:r1', kind: 'dense_semantic',
        row_identity_checksum: hash, row_count: 2, dimensions: 768, dtype: 'float32',
        normalization: 'l2_row', tensor_checksum: 'b'.repeat(64), source_snapshot_revision: 'feature:r1',
      },
      {
        block_id: 'relations', block_revision: 'relations:r1', kind: 'sparse_relation',
        row_identity_checksum: hash, row_count: 2, dimensions: 32, dtype: 'float32',
        normalization: 'sparse_softmax_row', tensor_checksum: 'c'.repeat(64), source_snapshot_revision: 'graph:r1',
      },
    ],
    concatenated_dimensions: 800,
    output_checksum: 'd'.repeat(64),
    producer_revision: 'producer:r1',
  });
  assert.equal(value.blocks.length, 2);
  assert.equal(value.canonical_authority, false);
});

test('binary masks must remain exact binary normalization', () => {
  assert.throws(() => featureSignalBlockSchema.parse({
    block_id: 'mask', block_revision: 'r1', kind: 'binary_mask', row_identity_checksum: hash,
    row_count: 2, dimensions: 1, dtype: 'uint8', normalization: 'minmax',
    tensor_checksum: 'b'.repeat(64), source_snapshot_revision: 'r1',
  }), /binary masks/);
});

test('cluster distributions require row softmax normalization', () => {
  assert.throws(() => featureSignalBlockSchema.parse({
    block_id: 'cluster', block_revision: 'r1', kind: 'cluster_distribution', row_identity_checksum: hash,
    row_count: 2, dimensions: 4, dtype: 'float32', normalization: 'none',
    tensor_checksum: 'b'.repeat(64), source_snapshot_revision: 'r1',
  }), /cluster distributions/);
});
