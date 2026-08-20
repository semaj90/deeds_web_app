import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAceSynthesisGraph,
  prefillIdentityChecksum,
} from '../dist/core/ace-synthesis-graph.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function artifact(artifact_id, role = 'OTHER') {
  return {
    artifact_id,
    artifact_revision: 'artifact-r1',
    role,
    content_format: 'JSON_CANONICAL_CONTROL',
    access_mode: 'FILE_READ',
    storage_ref: `/tmp/${artifact_id}`,
    byte_length: 128,
    content_checksum_sha256: A,
    transport_checksum_sha256: B,
    row_identity_checksum: ['SEMANTIC_SNAPSHOT', 'FEATURE_SIGNAL_BLOCK', 'NARY_INCIDENCE', 'ORDERED_CONTEXT'].includes(role) ? C : null,
    source_snapshot_revision: 'source-r1',
    canonical_authority: false,
    metadata: {},
  };
}

function node(input) {
  return {
    input_artifact_ids: [],
    output_artifact_ids: [],
    canonical_ids: [],
    evidence_refs: [],
    execution_condition: 'ALWAYS',
    condition_source_node_id: null,
    read_only: true,
    mutation_requested: false,
    exact_promotion_required: false,
    validation_required: false,
    canonical_authority: false,
    metadata: {},
    ...input,
  };
}

function cachedGraph(nodeOverrides = {}) {
  const artifacts = [
    artifact('semantic', 'SEMANTIC_SNAPSHOT'),
    artifact('features', 'FEATURE_SIGNAL_BLOCK'),
    artifact('lookup-receipt', 'OTHER'),
    artifact('compiled-prefill', 'PREFILL_PLAN'),
    artifact('store-receipt', 'OTHER'),
    artifact('resolved-prefill', 'PREFILL_PLAN'),
  ];
  const nodes = [
    node({ node_id: 'load', kind: 'LOAD_SNAPSHOT', output_artifact_ids: ['semantic'] }),
    node({ node_id: 'align', kind: 'FEATURE_ALIGNMENT', depends_on: ['load'], input_artifact_ids: ['features'] }),
    node({ node_id: 'promote', kind: 'EXACT_PROMOTION', depends_on: ['align'], canonical_authority: true, evidence_refs: ['e:1'] }),
    node({
      node_id: 'lookup', kind: 'PREFILL_CACHE_LOOKUP', depends_on: ['align', 'promote'],
      input_artifact_ids: ['features'], output_artifact_ids: ['lookup-receipt'], exact_promotion_required: true,
    }),
    node({
      node_id: 'compile', kind: 'PREFILL_COMPILE', depends_on: ['lookup'],
      output_artifact_ids: ['compiled-prefill'], exact_promotion_required: true,
      execution_condition: 'PREFILL_CACHE_MISS', condition_source_node_id: 'lookup',
    }),
    node({
      node_id: 'store', kind: 'PREFILL_CACHE_STORE', depends_on: ['lookup', 'compile'],
      input_artifact_ids: ['compiled-prefill'], output_artifact_ids: ['store-receipt'],
      execution_condition: 'PREFILL_CACHE_MISS', condition_source_node_id: 'lookup',
    }),
    node({
      node_id: 'resolve', kind: 'PREFILL_RESOLVE', depends_on: ['lookup', 'store'],
      input_artifact_ids: ['lookup-receipt', 'compiled-prefill', 'store-receipt'], output_artifact_ids: ['resolved-prefill'],
      exact_promotion_required: true,
    }),
    node({
      node_id: 'decode', kind: 'DECODE', depends_on: ['resolve'], input_artifact_ids: ['resolved-prefill'],
      exact_promotion_required: true,
    }),
  ].map((item) => item.node_id === nodeOverrides.node_id ? { ...item, ...nodeOverrides } : item);

  return buildAceSynthesisGraph({
    graph_id: 'graph:cached-prefill',
    graph_revision: 'graph-r1',
    request_id: 'request:1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'source-r1',
    semantic_snapshot_revision: 'semantic-r1',
    relationship_snapshot_revision: 'relationship-r1',
    workflow_revision: 1,
    artifacts,
    sample_query_nominations: [],
    nodes,
    prefill_identity_checksum: prefillIdentityChecksum({
      context_manifest_checksum: A,
      model_revision: 'model-r1',
      adapter_revision: null,
      prompt_template_revision: 'template-r1',
      evidence_revisions: ['evidence-r1'],
      aligned_feature_matrix_checksum: B,
    }),
    canonical_writes_allowed: false,
    producer_revision: 'producer-r1',
  });
}

test('ACE cache branch converges into one PREFILL_RESOLVE artifact before decode', () => {
  const graph = cachedGraph();
  const resolve = graph.nodes.find((item) => item.kind === 'PREFILL_RESOLVE');
  const decode = graph.nodes.find((item) => item.kind === 'DECODE');
  assert.deepEqual(resolve.output_artifact_ids, ['resolved-prefill']);
  assert.deepEqual(decode.depends_on, ['resolve']);
  assert.equal(graph.nodes.find((item) => item.kind === 'PREFILL_COMPILE').execution_condition, 'PREFILL_CACHE_MISS');
  assert.equal(graph.nodes.find((item) => item.kind === 'PREFILL_CACHE_STORE').condition_source_node_id, 'lookup');
});

test('compile cannot run unconditionally when cache branching is enabled', () => {
  assert.throws(() => cachedGraph({ node_id: 'compile', execution_condition: 'ALWAYS', condition_source_node_id: null }), /MUST_RUN_ON_MISS/);
});

test('decode cannot bypass PREFILL_RESOLVE when cache branching is enabled', () => {
  assert.throws(() => cachedGraph({ node_id: 'decode', depends_on: ['compile'], input_artifact_ids: ['compiled-prefill'] }), /REQUIRES_PREFILL_RESOLVE/);
});

test('conditional cache nodes must be controlled by the lookup node', () => {
  assert.throws(() => cachedGraph({ node_id: 'store', condition_source_node_id: 'promote' }), /INVALID_CONDITION_SOURCE/);
});
