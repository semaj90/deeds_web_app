import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTemporalIndexPlan,
  corpusCompressionPolicySchema,
  sourceRevisionDeltaSchema,
  structuralSnapshotValidationReceiptSchema,
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
