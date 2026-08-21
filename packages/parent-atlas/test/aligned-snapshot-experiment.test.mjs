import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignedSnapshotExperimentV2Schema,
  alignedSnapshotProofEnvelopeV2Schema,
  qdrantScopedAnnSchema,
} from '../dist/core/aligned-snapshot-experiment.js';

const hash = 'a'.repeat(64);
const lineageHash = 'b'.repeat(64);

function baseExperiment(overrides = {}) {
  return {
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
    qdrant_hnsw_best_recall_at_k: null,
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
    ...overrides,
  };
}

function alignedQdrant(overrides = {}) {
  return {
    schema: 'atlas.qdrant-scoped-ann-receipt.v1',
    comparison_scope: 'snapshot_subset',
    scoped_corpus_count: 100,
    scoped_corpus_checksum: hash,
    collection: 'codebase_chunks_768',
    vector_name: 'semantic_768',
    canonical_payload_key: 'canonical_id',
    metric: 'cosine',
    qdrant_distance: 'Cosine',
    qdrant_vector_size: 768,
    metric_alignment_status: 'ALIGNED',
    distance_interpretation: 'native_cosine',
    k: 10,
    query_count: 20,
    minimum_exact_overlap_at_k: 0.99,
    pytorch_qdrant_exact_mean_overlap_at_k: 1,
    pytorch_qdrant_exact_minimum_query_overlap_at_k: 1,
    exact_alignment_status: 'ALIGNED',
    exact_mean_latency_ms: 5,
    exact_p95_latency_ms: 7,
    exact_result_checksum: hash,
    sweep: [
      { hnsw_ef: 64, recall_at_k: 0.94, mean_latency_ms: 1.0, p95_latency_ms: 1.3, result_checksum: hash },
      { hnsw_ef: 128, recall_at_k: 0.98, mean_latency_ms: 1.5, p95_latency_ms: 1.8, result_checksum: hash },
    ],
    minimum_hnsw_recall_at_k: 0.95,
    recommended_hnsw_ef: 128,
    recommendation_status: 'ELIGIBLE',
    best_hnsw_recall_at_k: 0.98,
    canonical_authority: false,
    ...overrides,
  };
}

test('aligned snapshot v2 separates lineage identity from canonical row-order identity', () => {
  const value = alignedSnapshotExperimentV2Schema.parse(baseExperiment());
  assert.equal(value.semantic_dimensions, 768);
  assert.equal(value.semantic_versioned_row_identity_checksum, lineageHash);
  assert.equal(value.semantic_canonical_order_checksum, value.aligned_feature_row_identity_checksum);
});

test('aligned snapshot v2 rejects row-order mismatch', () => {
  assert.throws(() => alignedSnapshotExperimentV2Schema.parse(baseExperiment({
    aligned_feature_row_identity_checksum: 'c'.repeat(64),
  })), /preserve the frozen canonical row order/);
});

test('aligned snapshot v2 rejects K that can include self-only overflow', () => {
  assert.throws(() => alignedSnapshotExperimentV2Schema.parse(baseExperiment({
    row_count: 2,
    k: 2,
    query_ordinals: [0],
    query_canonical_ids: ['a'],
  })), /smaller than row_count/);
});

test('same-corpus Qdrant receipt can recommend only an eligible ef', () => {
  const value = qdrantScopedAnnSchema.parse(alignedQdrant());
  assert.equal(value.comparison_scope, 'snapshot_subset');
  assert.equal(value.qdrant_vector_size, 768);
  assert.equal(value.recommended_hnsw_ef, 128);
});

test('Qdrant metric mismatch blocks exact and HNSW stages', () => {
  const value = qdrantScopedAnnSchema.parse(alignedQdrant({
    qdrant_distance: 'Dot',
    metric_alignment_status: 'MISMATCH',
    exact_alignment_status: 'METRIC_MISMATCH',
    pytorch_qdrant_exact_mean_overlap_at_k: 0,
    pytorch_qdrant_exact_minimum_query_overlap_at_k: 0,
    exact_mean_latency_ms: 0,
    exact_p95_latency_ms: 0,
    sweep: [],
    recommended_hnsw_ef: null,
    recommendation_status: 'BLOCKED_METRIC_MISMATCH',
    best_hnsw_recall_at_k: 0,
  }));
  assert.equal(value.exact_alignment_status, 'METRIC_MISMATCH');
  assert.equal(value.sweep.length, 0);
});

test('proof envelope refuses HNSW certification after exact-store mismatch', () => {
  const mismatch = alignedQdrant({
    pytorch_qdrant_exact_mean_overlap_at_k: 0.7,
    pytorch_qdrant_exact_minimum_query_overlap_at_k: 0.5,
    exact_alignment_status: 'EXACT_STORE_MISMATCH',
    sweep: [],
    recommended_hnsw_ef: null,
    recommendation_status: 'BLOCKED_EXACT_STORE_MISMATCH',
    best_hnsw_recall_at_k: 0,
  });

  assert.throws(() => alignedSnapshotProofEnvelopeV2Schema.parse({
    schema: 'atlas.aligned-snapshot-proof-envelope.v2',
    semantic_manifest_path: 'snapshot.json',
    semantic_manifest_file_checksum: hash,
    experiment_spec_path: 'spec.json',
    experiment_spec_file_checksum: hash,
    experiment_output_path: 'result.json',
    experiment_output_file_checksum: hash,
    experiment_output_checksum: hash,
    qdrant_scoped_ann: mismatch,
    qdrant_scoped_ann_file: 'qdrant.json',
    qdrant_scoped_ann_file_checksum: hash,
    gpu_memory: {
      schema: 'atlas.gpu-memory-receipt.v1',
      available: false,
      measurement_source: 'unavailable',
      measurement_scope: 'none',
      baseline_bytes: null,
      peak_bytes: null,
      peak_delta_bytes: null,
      sample_count: 0,
      note: 'fixture',
    },
    canonical_authority: false,
    envelope_checksum: hash,
  }), /cannot certify HNSW/);
});
