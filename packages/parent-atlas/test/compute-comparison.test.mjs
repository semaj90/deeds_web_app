import test from 'node:test';
import assert from 'node:assert/strict';

import { recommendSemanticExecutor } from '../dist/core/compute-comparison.js';

function manifest(executor_id, executor_kind, exactness) {
  return {
    schema: 'atlas.semantic-executor-manifest.v1',
    executor_id,
    executor_kind,
    logical_lane: 'semantic',
    dimensions: 768,
    metric: 'cosine',
    source_snapshot_revision: 'snapshot-r1',
    projection_revision: 'projection-r1',
    embedding_model_revision: 'embed-r1',
    exactness,
    numerical_mode: 'ieee_fp32',
    canonical_identity_field: 'canonical_id',
    point_or_ordinal_is_canonical: false,
    stable_tie_break_required: true,
    supports_filters: false,
    supports_multivector: false,
    device: 'gpu',
    parameters: {},
    producer_revision: 'manifest-r1',
  };
}

function measurement(executor, overrides = {}) {
  return {
    schema: 'atlas.compute-measurement.v1',
    executor,
    query_set_revision: 'queries-r1',
    corpus_checksum: 'corpus-checksum',
    query_checksum: 'query-checksum',
    k: 10,
    result_checksum: `result:${executor.executor_id}`,
    recall_at_k: executor.exactness === 'exact_reference' ? 1 : 0.98,
    mean_latency_ms: executor.exactness === 'exact_reference' ? 10 : 4,
    p95_latency_ms: executor.exactness === 'exact_reference' ? 12 : 6,
    peak_vram_bytes: 128_000_000,
    warmup_iterations: 2,
    measured_iterations: 10,
    deterministic_replay_checksum: null,
    producer_revision: 'measurement-r1',
    ...overrides,
  };
}

test('CAGRA can win only after same-snapshot recall and budget gates', () => {
  const exact = manifest('pytorch-ieee', 'pytorch_gemm_exact', 'exact_reference');
  const cagra = { ...manifest('cagra', 'cuvs_cagra', 'approximate_ann'), numerical_mode: 'service_defined' };
  const receipt = recommendSemanticExecutor({
    measurements: [measurement(exact), measurement(cagra)],
    policy: { minimum_recall_at_k: 0.95, maximum_peak_vram_bytes: 512_000_000 },
    producer_revision: 'policy-r1',
  });
  assert.equal(receipt.recommended_executor_id, 'cagra');
  assert.equal(receipt.canonical_authority, false);
  assert.deepEqual(receipt.eligible_executor_ids, ['cagra', 'pytorch-ieee']);
});

test('metric mismatch rejects an otherwise faster challenger', () => {
  const exact = manifest('pytorch-ieee', 'pytorch_gemm_exact', 'exact_reference');
  const cagra = { ...manifest('cagra', 'cuvs_cagra', 'approximate_ann'), metric: 'sqeuclidean' };
  const receipt = recommendSemanticExecutor({
    measurements: [measurement(exact), measurement(cagra)],
    producer_revision: 'policy-r1',
  });
  assert.equal(receipt.recommended_executor_id, 'pytorch-ieee');
  assert.ok(receipt.rejected.find((row) => row.executor_id === 'cagra')?.reasons.includes('metric_mismatch'));
});

test('Recall@K below threshold keeps exact reference as fallback', () => {
  const exact = manifest('pytorch-ieee', 'pytorch_gemm_exact', 'exact_reference');
  const cagra = manifest('cagra', 'cuvs_cagra', 'approximate_ann');
  const receipt = recommendSemanticExecutor({
    measurements: [measurement(exact), measurement(cagra, { recall_at_k: 0.7, mean_latency_ms: 1 })],
    policy: { minimum_recall_at_k: 0.95 },
    producer_revision: 'policy-r1',
  });
  assert.equal(receipt.recommended_executor_id, 'pytorch-ieee');
  assert.ok(receipt.rejected.find((row) => row.executor_id === 'cagra')?.reasons.includes('recall_below_threshold'));
});
