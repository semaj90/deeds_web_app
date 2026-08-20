import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAceSynthesisGraph,
  prefillIdentityChecksum,
} from '../dist/core/ace-synthesis-graph.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

function artifact(artifact_id, role, content_format = 'JSON_CANONICAL_CONTROL', access_mode = 'FILE_READ') {
  const aligned = ['SEMANTIC_SNAPSHOT', 'FEATURE_SIGNAL_BLOCK', 'NARY_INCIDENCE', 'ORDERED_CONTEXT'].includes(role);
  return {
    artifact_id,
    artifact_revision: 'artifact-r1',
    role,
    content_format,
    access_mode,
    storage_ref: `/tmp/${artifact_id}`,
    byte_length: 128,
    content_checksum_sha256: SHA_A,
    transport_checksum_sha256: SHA_B,
    row_identity_checksum: aligned ? SHA_C : null,
    source_snapshot_revision: 'snapshot-r1',
    canonical_authority: false,
    metadata: {},
  };
}

function validGraph(overrides = {}) {
  const artifacts = [
    artifact('semantic', 'SEMANTIC_SNAPSHOT', 'ARROW_IPC_FILE', 'MMAP_READONLY'),
    artifact('nary', 'NARY_INCIDENCE', 'ARROW_IPC_FILE', 'MMAP_READONLY'),
    artifact('features', 'FEATURE_SIGNAL_BLOCK', 'ARROW_IPC_FILE', 'MMAP_READONLY'),
    artifact('prefill', 'PREFILL_PLAN'),
    artifact('patch', 'PATCH'),
    artifact('validation', 'VALIDATION_RECEIPT'),
  ];

  const nodes = [
    { node_id: 'load', kind: 'LOAD_SNAPSHOT', depends_on: [], input_artifact_ids: [], output_artifact_ids: ['semantic', 'nary'], canonical_ids: [], evidence_refs: [], read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'ast', kind: 'AST_RETRIEVAL', depends_on: ['load'], input_artifact_ids: [], output_artifact_ids: [], canonical_ids: ['symbol:a'], evidence_refs: ['e:ast'], maximum_candidates: 64, read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'knn', kind: 'SEMANTIC_KNN', depends_on: ['load'], input_artifact_ids: ['semantic'], output_artifact_ids: [], canonical_ids: ['symbol:a'], evidence_refs: [], maximum_candidates: 64, read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'rank', kind: 'GRAPH_RANK', depends_on: ['ast', 'knn'], input_artifact_ids: [], output_artifact_ids: [], canonical_ids: ['symbol:a'], evidence_refs: [], maximum_hops: 2, read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'nary', kind: 'NARY_DECOMPOSITION', depends_on: ['rank'], input_artifact_ids: ['nary'], output_artifact_ids: [], canonical_ids: ['rel:1'], evidence_refs: ['e:rel'], maximum_hops: 2, read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'sample', kind: 'SAMPLE_QUERY_NOMINATION', depends_on: ['knn'], input_artifact_ids: ['features'], output_artifact_ids: [], canonical_ids: [], evidence_refs: [], maximum_candidates: 32, read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'align', kind: 'FEATURE_ALIGNMENT', depends_on: ['nary', 'sample'], input_artifact_ids: ['features'], output_artifact_ids: [], canonical_ids: [], evidence_refs: [], read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'promote', kind: 'EXACT_PROMOTION', depends_on: ['align'], input_artifact_ids: [], output_artifact_ids: [], canonical_ids: ['symbol:a', 'rel:1'], evidence_refs: ['e:ast', 'e:rel'], read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: true, metadata: {} },
    { node_id: 'prefill', kind: 'PREFILL_COMPILE', depends_on: ['align', 'promote'], input_artifact_ids: ['semantic', 'features'], output_artifact_ids: ['prefill'], canonical_ids: ['symbol:a'], evidence_refs: ['e:ast', 'e:rel'], read_only: true, mutation_requested: false, exact_promotion_required: true, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'decode', kind: 'DECODE', depends_on: ['prefill'], input_artifact_ids: ['prefill'], output_artifact_ids: [], canonical_ids: ['symbol:a'], evidence_refs: ['e:ast', 'e:rel'], read_only: true, mutation_requested: false, exact_promotion_required: true, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'plan', kind: 'PLAN_PATCH', depends_on: ['decode'], input_artifact_ids: [], output_artifact_ids: ['patch'], canonical_ids: ['symbol:a'], evidence_refs: ['e:ast', 'e:rel'], read_only: true, mutation_requested: false, exact_promotion_required: true, validation_required: false, canonical_authority: false, metadata: {} },
    { node_id: 'apply', kind: 'APPLY_PATCH', depends_on: ['plan'], input_artifact_ids: ['patch'], output_artifact_ids: [], canonical_ids: ['symbol:a'], evidence_refs: ['e:ast', 'e:rel'], read_only: false, mutation_requested: true, exact_promotion_required: true, validation_required: true, canonical_authority: false, metadata: { file_count: 1, patch_bytes: 100 } },
    { node_id: 'validate', kind: 'VALIDATE', depends_on: ['apply'], input_artifact_ids: [], output_artifact_ids: ['validation'], canonical_ids: ['symbol:a'], evidence_refs: ['e:test'], read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: true, metadata: {} },
    { node_id: 'materialize', kind: 'MATERIALIZE', depends_on: ['validate'], input_artifact_ids: ['validation'], output_artifact_ids: [], canonical_ids: ['symbol:a'], evidence_refs: ['e:test'], read_only: false, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: true, metadata: {} },
  ];

  return buildAceSynthesisGraph({
    graph_id: 'ace:graph:1',
    graph_revision: 'graph-r1',
    request_id: 'request:1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'snapshot-r1',
    semantic_snapshot_revision: 'semantic-r1',
    relationship_snapshot_revision: 'relationship-r1',
    workflow_revision: 1,
    artifacts,
    sample_query_nominations: [{
      nomination_id: 'sample:1',
      nomination_revision: 'sample-r1',
      source_artifact_id: 'features',
      access_model: 'L2_SAMPLE_QUERY',
      probability_basis: 'ROW_L2_NORM_SQUARED',
      sample_count: 16,
      prng_seed: '0xA71A5',
      candidate_limit: 32,
      exact_promotion_required: true,
      canonical_authority: false,
      producer_revision: 'producer-r1',
    }],
    nodes,
    prefill_identity_checksum: prefillIdentityChecksum({
      context_manifest_checksum: SHA_A,
      model_revision: 'ornith-r1',
      adapter_revision: null,
      prompt_template_revision: 'prompt-r1',
      evidence_revisions: ['evidence-r2', 'evidence-r1'],
      aligned_feature_matrix_checksum: SHA_B,
    }),
    canonical_writes_allowed: true,
    max_patch_files: 32,
    max_patch_bytes: 2_000_000,
    producer_revision: 'producer-r1',
    ...overrides,
  });
}

test('builds one guarded ACE graph from retrieval through prefill/decode/patch validation', () => {
  const graph = validGraph();
  assert.equal(graph.schema, 'atlas.ace-synthesis-graph.v1');
  assert.equal(graph.nodes.find((node) => node.node_id === 'sample').canonical_authority, false);
  assert.equal(graph.nodes.find((node) => node.node_id === 'apply').validation_required, true);
  assert.match(graph.graph_checksum, /^[a-f0-9]{64}$/);
});

test('prefill identity is order independent for evidence revision set', () => {
  const a = prefillIdentityChecksum({ context_manifest_checksum: SHA_A, model_revision: 'm1', adapter_revision: null, prompt_template_revision: 'p1', evidence_revisions: ['b', 'a'], aligned_feature_matrix_checksum: SHA_B });
  const b = prefillIdentityChecksum({ context_manifest_checksum: SHA_A, model_revision: 'm1', adapter_revision: null, prompt_template_revision: 'p1', evidence_revisions: ['a', 'b'], aligned_feature_matrix_checksum: SHA_B });
  assert.equal(a, b);
});

test('rejects a patch path without write authority', () => {
  assert.throws(() => validGraph({ canonical_writes_allowed: false }), /WRITES_BLOCKED/);
});

test('rejects MessagePack pretending to be an mmap snapshot', () => {
  assert.throws(() => buildAceSynthesisGraph({
    graph_id: 'bad', graph_revision: 'r1', request_id: 'q', workspace_revision: 'w', source_snapshot_revision: 's', semantic_snapshot_revision: 'sem', relationship_snapshot_revision: 'rel', workflow_revision: 1,
    artifacts: [{
      artifact_id: 'bad-artifact', artifact_revision: 'r1', role: 'SEMANTIC_SNAPSHOT', content_format: 'MSGPACK_ENVELOPE', access_mode: 'MMAP_READONLY', storage_ref: '/tmp/bad', byte_length: 1, content_checksum_sha256: SHA_A, transport_checksum_sha256: SHA_B, row_identity_checksum: SHA_C, source_snapshot_revision: 's', canonical_authority: false, metadata: {},
    }],
    sample_query_nominations: [],
    nodes: [{ node_id: 'load', kind: 'LOAD_SNAPSHOT', depends_on: [], input_artifact_ids: [], output_artifact_ids: ['bad-artifact'], canonical_ids: [], evidence_refs: [], read_only: true, mutation_requested: false, exact_promotion_required: false, validation_required: false, canonical_authority: false, metadata: {} }],
    prefill_identity_checksum: null, canonical_writes_allowed: false, max_patch_files: 1, max_patch_bytes: 1024, producer_revision: 'p',
  }), /MMAP_READONLY/);
});
