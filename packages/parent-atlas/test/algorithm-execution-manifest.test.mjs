import test from 'node:test';
import assert from 'node:assert/strict';

import {
  algorithmExecutionManifestSchema,
  checksumAlgorithmExecutionManifest,
} from '../dist/core/algorithm-execution-manifest.js';

const hash = 'a'.repeat(64);

function base(overrides = {}) {
  return {
    schema: 'atlas.algorithm-execution-manifest.v1',
    execution_id: 'exec:1',
    dag_node_id: 'dag:semantic',
    stage: 'semantic_nomination',
    logical_lane: 'semantic',
    algorithm_class: 'exact_reference',
    algorithm: 'exact_gemm',
    geometry: 'cosine_hypersphere',
    metric: 'cosine',
    dimensions: 768,
    dtype: 'float32',
    compute_backend: 'pytorch_eager',
    compute_backend_revision: 'torch:reference',
    compilation_mode: 'eager',
    transport: 'local',
    serialization: 'numpy',
    cache_backend: 'none',
    source_snapshot_revision: 'snapshot:1',
    representation_revision: 'semantic_768:r1',
    canonical_ordinal_map_revision: 'ordinals:r1',
    input_checksum: hash,
    device: { kind: 'cuda', name: 'test-device', compute_capability: '8.6' },
    mutation: {},
    fallback_used: false,
    canonical_authority: false,
    producer_revision: 'producer:r1',
    ...overrides,
  };
}

test('exact semantic executor remains one semantic lane', () => {
  const value = algorithmExecutionManifestSchema.parse(base());
  assert.equal(value.logical_lane, 'semantic');
  assert.equal(value.metric, 'cosine');
  assert.equal(value.dimensions, 768);
  assert.equal(value.canonical_authority, false);
  assert.match(checksumAlgorithmExecutionManifest(value), /^[a-f0-9]{64}$/);
});

test('CAGRA cannot masquerade as canonical or leave semantic lane', () => {
  assert.throws(() => algorithmExecutionManifestSchema.parse(base({
    algorithm: 'cagra',
    algorithm_class: 'exact_reference',
  })), /approximate_executor/);

  assert.throws(() => algorithmExecutionManifestSchema.parse(base({
    algorithm: 'cagra',
    algorithm_class: 'approximate_executor',
    logical_lane: 'graph',
  })), /semantic logical lane/);
});

test('derived quaternion geometry cannot replace N-ary incidence traversal', () => {
  assert.throws(() => algorithmExecutionManifestSchema.parse(base({
    stage: 'incidence_traversal',
    logical_lane: 'graph',
    algorithm_class: 'derived_projection',
    algorithm: 'quaternion_projection',
    geometry: 'quaternion_s3',
    metric: 'none',
  })), /cannot replace canonical N-ary relationship incidence/);
});

test('external neural router is policy, not model MoE', () => {
  const router = algorithmExecutionManifestSchema.parse(base({
    dag_node_id: 'dag:policy',
    stage: 'query_analysis',
    logical_lane: 'policy',
    algorithm_class: 'policy_challenger',
    algorithm: 'neural_executor_router',
    geometry: 'none',
    metric: 'none',
    dimensions: undefined,
    compute_backend: 'pytorch_eager',
    model_topology: undefined,
  }));
  assert.equal(router.algorithm, 'neural_executor_router');
  assert.equal(router.canonical_authority, false);

  assert.throws(() => algorithmExecutionManifestSchema.parse(base({
    dag_node_id: 'dag:moe',
    stage: 'rerank',
    logical_lane: 'policy',
    algorithm_class: 'derived_projection',
    algorithm: 'moe_router',
    geometry: 'none',
    metric: 'none',
    model_topology: {
      architecture: 'dense',
      model_id: 'dense-model',
      model_revision: 'r1',
    },
  })), /moe_router requires/);
});

test('valid model MoE must declare explicit expert topology', () => {
  const value = algorithmExecutionManifestSchema.parse(base({
    dag_node_id: 'dag:model-moe',
    stage: 'rerank',
    logical_lane: 'policy',
    algorithm_class: 'derived_projection',
    algorithm: 'moe_router',
    geometry: 'none',
    metric: 'none',
    compute_backend: 'pytorch_eager',
    model_topology: {
      architecture: 'moe',
      model_id: 'moe-model',
      model_revision: 'r7',
      num_experts: 8,
      top_k: 2,
      router_revision: 'router:r2',
    },
  }));
  assert.equal(value.model_topology.architecture, 'moe');
  assert.equal(value.model_topology.top_k, 2);
});

test('Kafka CDC and simdjson cannot become canonical truth operators', () => {
  assert.throws(() => algorithmExecutionManifestSchema.parse(base({
    dag_node_id: 'dag:materialize',
    stage: 'evidence_validation',
    logical_lane: 'materializer',
    algorithm_class: 'canonical_fact_operator',
    algorithm: 'evidence_materializer',
    geometry: 'none',
    metric: 'none',
    compute_backend: 'postgresql',
    compilation_mode: 'eager',
    transport: 'kafka_cdc',
    serialization: 'protobuf',
    canonical_authority: true,
  })), /Kafka CDC/);

  assert.throws(() => algorithmExecutionManifestSchema.parse(base({
    dag_node_id: 'dag:parse',
    stage: 'evidence_validation',
    logical_lane: 'materializer',
    algorithm_class: 'canonical_fact_operator',
    algorithm: 'evidence_materializer',
    geometry: 'none',
    metric: 'none',
    compute_backend: 'napi_cpp',
    compilation_mode: 'eager',
    transport: 'napi',
    serialization: 'simdjson_ondemand',
    canonical_authority: true,
  })), /simdjson/);
});
