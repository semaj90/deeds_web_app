import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAgenticFileMutationPlan } from '../dist/core/agentic-file-mutation.js';

const BEFORE = 'a'.repeat(64);
const AFTER = 'b'.repeat(64);

function basePlan(mutations, overrides = {}) {
  return buildAgenticFileMutationPlan({
    plan_id: 'plan:1',
    plan_revision: 'plan-r1',
    workflow_id: 'workflow:1',
    workflow_revision: 1,
    workspace_revision: 'workspace-r1',
    source_snapshot_revision: 'snapshot-r1',
    mutations,
    maximum_total_patch_bytes: 4096,
    total_patch_bytes: 512,
    validator_ids: ['validator:typecheck', 'validator:test'],
    rollback_required: true,
    canonical_writes_allowed: true,
    producer_revision: 'producer-r1',
    ...overrides,
  });
}

test('builds checksum-guarded create/update/delete mutation plans', () => {
  const plan = basePlan([
    { mutation_id: 'm:create', operation: 'CREATE', repository_relative_path: 'src/new.ts', expected_before_checksum_sha256: null, expected_after_checksum_sha256: AFTER, source_revision: null, patch_artifact_id: 'patch:create', evidence_refs: ['e:spec'], canonical_ids: ['symbol:new'], exact_promotion_receipt_id: 'promotion:1' },
    { mutation_id: 'm:update', operation: 'UPDATE', repository_relative_path: 'src/existing.ts', expected_before_checksum_sha256: BEFORE, expected_after_checksum_sha256: AFTER, source_revision: 'src-r1', patch_artifact_id: 'patch:update', evidence_refs: ['e:ast', 'e:test'], canonical_ids: ['symbol:existing'], exact_promotion_receipt_id: 'promotion:2' },
    { mutation_id: 'm:delete', operation: 'DELETE', repository_relative_path: 'src/dead.ts', expected_before_checksum_sha256: BEFORE, expected_after_checksum_sha256: null, source_revision: 'src-r1', patch_artifact_id: null, evidence_refs: ['e:dead-code'], canonical_ids: ['symbol:dead'], exact_promotion_receipt_id: 'promotion:3' },
  ]);

  assert.equal(plan.mutations.length, 3);
  assert.equal(plan.rollback_required, true);
  assert.match(plan.plan_checksum_sha256, /^[a-f0-9]{64}$/);
});

test('rejects update without a prior checksum', () => {
  assert.throws(() => basePlan([{
    mutation_id: 'm:update', operation: 'UPDATE', repository_relative_path: 'src/existing.ts', expected_before_checksum_sha256: null, expected_after_checksum_sha256: AFTER, source_revision: 'src-r1', patch_artifact_id: 'patch:update', evidence_refs: ['e:ast'], canonical_ids: [], exact_promotion_receipt_id: 'promotion:1',
  }]), /UPDATE requires before checksum/);
});

test('rejects traversal paths and over-budget plans', () => {
  assert.throws(() => basePlan([{
    mutation_id: 'm:create', operation: 'CREATE', repository_relative_path: '../escape.ts', expected_before_checksum_sha256: null, expected_after_checksum_sha256: AFTER, source_revision: null, patch_artifact_id: 'patch:create', evidence_refs: ['e:spec'], canonical_ids: [], exact_promotion_receipt_id: 'promotion:1',
  }]), /repository-relative/);

  assert.throws(() => basePlan([{
    mutation_id: 'm:create', operation: 'CREATE', repository_relative_path: 'src/new.ts', expected_before_checksum_sha256: null, expected_after_checksum_sha256: AFTER, source_revision: null, patch_artifact_id: 'patch:create', evidence_refs: ['e:spec'], canonical_ids: [], exact_promotion_receipt_id: 'promotion:1',
  }], { maximum_total_patch_bytes: 128, total_patch_bytes: 512 }), /exceeds bounded patch-byte envelope/);
});
