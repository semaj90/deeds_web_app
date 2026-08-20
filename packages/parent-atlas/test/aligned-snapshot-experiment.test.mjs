import assert from 'node:assert/strict';
import test from 'node:test';

import { alignedSnapshotExperimentV2Schema } from '../dist/core/aligned-snapshot-experiment.js';

const hash = 'a'.repeat(64);
const lineageHash = 'b'.repeat(64);

test('aligned snapshot v2 separates lineage identity from canonical row-order identity', () => {
  const value = alignedSnapshotExperimentV2Schema.parse({
    schema: 'atlas.aligned-snapshot-experiment.v2',
    experiment_revision: 'exp:1',
    semantic_snapshot_revision: 'workspace:742',
    representation_revision: 'semantic_768:r109',
    semantic_versioned_row_identity_checksum: lineageHash,
    semantic_canonical_order_checksum: hash,
    semantic_tensor_checksum: hash,
    row_count: 100,
    semantic_dimensions: 768,
    metric: 'cosine',
    k: 10,
    query_ordinals: [1, 7],
    query_canonical_ids: ['feature:a', 'feature:b'],
    exact_semantic_result_checksum: hash,
    exact_self_exclusion: true,
    pytorch_cuvs_exact_topk_overlap: 1,
    cagra_recall_at_k: 0.98,
    qdrant_hnsw_best_recall_at_k: 0.97,
    cluster_entropy: 1.2,
    cluster_replay_stability: 1,
    som_quantization_error: 0.2,
    som_neighborhood_overlap_at_k: 0.8,
    sparse_dense: null,
    context_retrieval: { status: 'SKIPPED' },
    nary_retrieval: { status: 'SKIPPED' },
    stages: {
      pytorch_exact: { status: 'PASS', reason: null, receipt: {} },
      ordered_context: { status: 'SKIPPED', reason: 'explicit order absent', receipt: null },
    },
    aligned_feature_matrix_checksum: hash,
    aligned_feature_row_identity_checksum: hash,
    aligned_feature_columns: 790,
    output_checksum: hash,
    canonical_authority: false,
  });
  assert.equal(value.semantic_dimensions, 768);
  assert.equal(value.semantic_versioned_row_identity_checksum, lineageHash);
  assert.equal(value.semantic_canonical_order_checksum, value.aligned_feature_row_identity_checksum);
});

test('aligned snapshot v2 rejects row-order mismatch', () => {
  assert.throws(() => alignedSnapshotExperimentV2Schema.parse({
    schema: 'atlas.aligned-snapshot-experiment.v2',
    experiment_revision: 'exp:1',
    semantic_snapshot_revision: 'workspace:1',
    representation_revision: 'semantic_768:r1',
    semantic_versioned_row_identity_checksum: lineageHash,
    semantic_canonical_order_checksum: hash,
    semantic_tensor_checksum: hash,
    row_count: 3,
    semantic_dimensions: 768,
    metric: 'cosine',
    k: 1,
    query_ordinals: [0],
    query_canonical_ids: ['a'],
    exact_semantic_result_checksum: hash,
    exact_self_exclusion: true,
    pytorch_cuvs_exact_topk_overlap: null,
    cagra_recall_at_k: null,
    qdrant_hnsw_best_recall_at_k: null,
    cluster_entropy: null,
    cluster_replay_stability: null,
    som_quantization_error: null,
    som_neighborhood_overlap_at_k: null,
    sparse_dense: null,
    context_retrieval: {},
    nary_retrieval: {},
    stages: {},
    aligned_feature_matrix_checksum: hash,
    aligned_feature_row_identity_checksum: 'c'.repeat(64),
    aligned_feature_columns: 768,
    output_checksum: hash,
    canonical_authority: false,
  }), /preserve the frozen canonical row order/);
});

test('aligned snapshot v2 rejects K that can include self-only overflow', () => {
  assert.throws(() => alignedSnapshotExperimentV2Schema.parse({
    schema: 'atlas.aligned-snapshot-experiment.v2',
    experiment_revision: 'exp:1',
    semantic_snapshot_revision: 'workspace:1',
    representation_revision: 'semantic_768:r1',
    semantic_versioned_row_identity_checksum: lineageHash,
    semantic_canonical_order_checksum: hash,
    semantic_tensor_checksum: hash,
    row_count: 2,
    semantic_dimensions: 768,
    metric: 'cosine',
    k: 2,
    query_ordinals: [0],
    query_canonical_ids: ['a'],
    exact_semantic_result_checksum: hash,
    exact_self_exclusion: true,
    pytorch_cuvs_exact_topk_overlap: null,
    cagra_recall_at_k: null,
    qdrant_hnsw_best_recall_at_k: null,
    cluster_entropy: null,
    cluster_replay_stability: null,
    som_quantization_error: null,
    som_neighborhood_overlap_at_k: null,
    sparse_dense: null,
    context_retrieval: {},
    nary_retrieval: {},
    stages: {},
    aligned_feature_matrix_checksum: hash,
    aligned_feature_row_identity_checksum: hash,
    aligned_feature_columns: 768,
    output_checksum: hash,
    canonical_authority: false,
  }), /smaller than row_count/);
});
