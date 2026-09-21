import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildKnowledgeClaimChecksum,
  buildRunManifest,
  buildTemporalIndexPlan,
  buildTemporalDocumentIndex,
  classifyKnowledgeClaimFreshness,
  corpusCompressionPolicySchema,
  documentObservationSchema,
  knowledgeClaimSchema,
  sourceRevisionDeltaSchema,
  sourceArtifactSchema,
  sourceCoordinateMapSchema,
  structuralSnapshotValidationReceiptSchema,
  temporalIndexChecksum,
  visualObjectObservationSchema,
} from '../dist/core/temporal-indexing-fabric.js';

const h = (char) => char.repeat(64);

const base = {
  workspace_revision: 'workspace-r1',
  previous_source_snapshot_revision: 'source-r0',
  source_snapshot_revision: 'source-r1',
  producer_revision: 'test-r1',
};

test('unchanged sources are reused without semantic or graph churn', () => {
  const plan = buildTemporalIndexPlan({
    ...base,
    deltas: [{
      source_ref: 'src/a.ts',
      change_kind: 'UNCHANGED',
      before_revision: 'a-r1',
      after_revision: 'a-r1',
      before_checksum: h('a'),
      after_checksum: h('a'),
    }],
  });
  assert.equal(plan.actions[0].structural, 'REUSE');
  assert.equal(plan.actions[0].semantic_768, 'REUSE');
  assert.equal(plan.actions[0].qdrant, 'NONE');
  assert.equal(plan.pagerank_policy, 'REUSE_IF_GRAPH_UNCHANGED');
  assert.equal(plan.cagra_policy, 'REUSE_IF_SEMANTIC_UNCHANGED');
});

test('modified ranges use incremental Tree-sitter parse but rebuild CAGRA generation', () => {
  const plan = buildTemporalIndexPlan({
    ...base,
    deltas: [{
      source_ref: 'src/a.ts',
      change_kind: 'MODIFIED',
      before_revision: 'a-r1',
      after_revision: 'a-r2',
      before_checksum: h('a'),
      after_checksum: h('b'),
      changed_ranges: [{ start_byte: 10, old_end_byte: 20, new_end_byte: 25 }],
      semantic_dependents: ['src/b.ts'],
    }],
  });
  assert.equal(plan.actions[0].structural, 'INCREMENTAL_REPARSE');
  assert.equal(plan.actions[0].typescript_semantics, 'REENRICH_DEPENDENT_CLOSURE');
  assert.equal(plan.actions[0].semantic_768, 'REEMBED_CHANGED_CHUNKS');
  assert.equal(plan.actions[0].qdrant, 'UPSERT_CHANGED_POINTS');
  assert.equal(plan.pagerank_policy, 'FULL_RECOMPUTE_WARM_START');
  assert.equal(plan.cagra_policy, 'REBUILD_GENERATION');
});

test('pure additions may extend CAGRA', () => {
  const plan = buildTemporalIndexPlan({
    ...base,
    deltas: [{
      source_ref: 'src/new.ts',
      change_kind: 'ADDED',
      after_revision: 'new-r1',
      after_checksum: h('c'),
    }],
  });
  assert.equal(plan.cagra_policy, 'EXTEND_ADDITIONS_ONLY');
});

test('deleted source tombstones structure and deletes semantic projection', () => {
  const plan = buildTemporalIndexPlan({
    ...base,
    deltas: [{
      source_ref: 'src/deleted.ts',
      change_kind: 'DELETED',
      before_revision: 'del-r1',
      before_checksum: h('d'),
    }],
  });
  assert.equal(plan.actions[0].structural, 'TOMBSTONE');
  assert.equal(plan.actions[0].semantic_768, 'DELETE_SOURCE_POINTS');
  assert.equal(plan.actions[0].qdrant, 'DELETE_SOURCE_POINTS');
  assert.equal(plan.cagra_policy, 'REBUILD_GENERATION');
});

test('compression policy rejects direct Huffman as Atlas storage contract', () => {
  assert.throws(() => corpusCompressionPolicySchema.parse({
    policy_revision: 'compression-r1',
    direct_huffman_storage_contract: true,
  }));
  const policy = corpusCompressionPolicySchema.parse({ policy_revision: 'compression-r1' });
  assert.equal(policy.ipc_compression, 'ZSTD');
  assert.equal(policy.logical_dedupe, 'SHA256_CONTENT_ADDRESS');
});

test('visual observations are source and model revision grounded', () => {
  const observation = visualObjectObservationSchema.parse({
    observation_id: 'vision-1',
    source_ref: 'evidence/site-photo.jpg',
    source_revision: 'image-r1',
    image_checksum: h('e'),
    detector_family: 'TENSORRT_ONNX',
    detector_model_revision: 'detector-r7',
    class_label: 'vehicle',
    confidence: 0.91,
    box_xyxy_pixels: [10, 20, 110, 120],
  });
  assert.equal(observation.canonical_authority, false);
  assert.throws(() => visualObjectObservationSchema.parse({ ...observation, box_xyxy_pixels: [10, 20, 5, 120] }));
});

test('daily structural validation is revision scoped and requires complete coverage', () => {
  assert.throws(() => structuralSnapshotValidationReceiptSchema.parse({
    receipt_id: 'struct-r1',
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'source-r1',
    source_count: 2,
    changed_source_count: 1,
    validated_source_count: 1,
    native_provenance_count: 1,
    degraded_provenance_count: 0,
    tombstone_count: 0,
    changed_range_count: 1,
    row_identity_checksum: h('1'),
    structural_snapshot_checksum: h('2'),
    change_set_checksum: h('3'),
    status: 'VALID',
    producer_revision: 'test-r1',
  }));
});

test('invalid source delta invariants fail closed', () => {
  assert.throws(() => sourceRevisionDeltaSchema.parse({
    source_ref: 'src/a.ts',
    change_kind: 'UNCHANGED',
    before_revision: 'r1',
    after_revision: 'r1',
    before_checksum: h('a'),
    after_checksum: h('b'),
  }));
});

test('source artifacts are revision-qualified and reject canonical promotion', () => {
  const artifact = sourceArtifactSchema.parse({
    file_id: 'file-1',
    repo_id: 'repo-1',
    workspace_revision: 'workspace-r1',
    canonical_source_ref: 'sveltekit-frontend/src/example.ts',
    source_revision: 'source-r1',
    content_digest: h('f'),
    byte_length: 12,
    mime_type: 'text/typescript',
    language: 'typescript',
    observed_at: '2026-09-20T12:00:00.000Z',
    producer_id: 'source-owner',
    producer_revision: 'source-envelope-r1',
  });
  assert.equal(artifact.canonical_authority, false);
  assert.throws(() => sourceArtifactSchema.parse({ ...artifact, canonical_authority: true }));
});

test('coordinate maps make UTF-8 byte offsets authoritative', () => {
  const map = sourceCoordinateMapSchema.parse({
    source_revision: 'source-r1',
    content_digest: h('a'),
    line_starts_byte: [0, 4, 19],
    coordinate_checksum: h('b'),
  });
  assert.equal(map.offset_basis, 'UTF8_SOURCE_BYTES_V1');
  assert.throws(() => sourceCoordinateMapSchema.parse({ ...map, offset_basis: 'UTF16' }));
});

test('observations and claims require evidence references', () => {
  assert.throws(() => documentObservationSchema.parse({
    observation_id: 'obs-1', observation_kind: 'CLAIM', source_ref: 'docs/a.md',
    source_revision: 'source-r1', workspace_revision: 'workspace-r1',
    span: { start_byte: 0, end_byte: 4 }, text_checksum: h('c'),
    producer_id: 'parser', producer_revision: 'parser-r1', evidence_refs: [],
    observation_checksum: h('d'),
  }));
  const claim = knowledgeClaimSchema.parse({
    claim_id: 'claim-1', claim_kind: 'CONTRACT', statement: 'UTF-8 bytes are authoritative.',
    evidence_refs: ['obs-1'], source_revision_set: ['source-r1'], producer_id: 'reviewer',
    producer_revision: 'review-r1', confidence: 0.9, authority_class: 'REVIEWED',
    first_observed_revision: 'source-r1', last_confirmed_revision: 'source-r1',
    status: 'CURRENT', checksum: h('e'),
  });
  assert.equal(claim.evidence_refs.length, 1);
  assert.throws(() => knowledgeClaimSchema.parse({ ...claim, evidence_refs: [] }));
});

test('claim freshness becomes stale only when supporting evidence changed', () => {
  const claim = knowledgeClaimSchema.parse({
    claim_id: 'claim-2', claim_kind: 'FACT', statement: 'A claim.', evidence_refs: ['obs-2'],
    source_revision_set: ['source-r1'], producer_id: 'extractor', producer_revision: 'extractor-r1',
    confidence: 0.5, authority_class: 'PROVISIONAL', first_observed_revision: 'source-r1',
    last_confirmed_revision: 'source-r1', status: 'CURRENT', checksum: h('1'),
  });
  assert.equal(classifyKnowledgeClaimFreshness(claim, ['source-r0']), 'CURRENT');
  assert.equal(classifyKnowledgeClaimFreshness(claim, ['source-r1']), 'STALE_EVIDENCE');
  const { checksum: _checksum, canonical_authority: _authority, ...claimInput } = claim;
  assert.equal(buildKnowledgeClaimChecksum(claimInput), temporalIndexChecksum({ schema: 'atlas.knowledge-claim.v1', ...claimInput, canonical_authority: false }));
});

test('run manifests and temporal indexes are deterministic noncanonical envelopes', () => {
  const manifest = buildRunManifest({
    run_id: 'run-1', request_id: 'request-1', workspace_revision: 'workspace-r1',
    producer_id: 'temporal-fabric', producer_revision: 'fabric-r1', input_refs: ['artifact-1'],
    output_refs: ['claim-1'], started_at: '2026-09-20T12:00:00.000Z',
    completed_at: '2026-09-20T12:00:01.000Z', status: 'SUCCEEDED',
  });
  const index = buildTemporalDocumentIndex({
    index_id: 'index-1', workspace_revision: 'workspace-r1', source_snapshot_revision: 'source-r1',
    artifact_refs: ['artifact-1'], observation_refs: ['obs-1'], claim_refs: ['claim-1'],
    delta_refs: ['delta-1'], source_revision_set_checksum: h('2'), status: 'VALID',
    producer_revision: 'fabric-r1',
  });
  assert.match(manifest.manifest_checksum, /^[a-f0-9]{64}$/);
  assert.match(index.index_checksum, /^[a-f0-9]{64}$/);
  assert.equal(manifest.canonical_authority, false);
  assert.equal(index.canonical_authority, false);
});
