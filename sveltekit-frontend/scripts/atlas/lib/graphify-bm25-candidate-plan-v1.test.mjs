import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphifyBm25CandidatePlanV1, parseGraphifyBm25PlanLimitV1 } from './graphify-bm25-candidate-plan-v1.mjs';

test('explicit trailing limit overrides the package default and stays bounded', () => {
  assert.equal(parseGraphifyBm25PlanLimitV1(['--limit=10', '--limit=1']), 1);
  assert.equal(parseGraphifyBm25PlanLimitV1(['--limit=500']), 100);
  assert.throws(() => parseGraphifyBm25PlanLimitV1(['--limit=nope']), /INVALID_GRAPHIFY_BM25_PLAN_LIMIT/);
});

test('historical Graphify candidate is not authorized for an FTS lease claim', () => {
  const plan = buildGraphifyBm25CandidatePlanV1({
    graphify_run_id: 'run-1',
    workflow_id: 'graphify-default',
    workspace_revision: 'sha256:old',
    source_manifest_digest: 'manifest-digest',
    source_manifest_source_count: 10,
    repository_revision: 'commit-old',
    parameters: {},
    graphify_completed_at: '2026-09-15T22:05:02.995Z',
  });

  assert.equal(plan.eligibility, 'CURRENT_ADMISSION_REVIEW_REQUIRED');
  assert.equal(plan.leaseClaimAuthorized, false);
  assert.equal(plan.nextAction, 'VERIFY_CURRENT_WORKSPACE_ADMISSION_AND_SOURCE_REVISION');
  assert.equal(plan.workspaceRevision, 'sha256:old');
});
