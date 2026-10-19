import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  classifyGraphifyOwnerRoleV1,
  compareGraphifyExecutionReceiptsV1,
  findGraphifyTransitionPrimitivesV1,
  resolveGraphifyAuditOutputDirV1,
  summarizeGraphifyOwnerRolesV1,
} from './graphify-owner-role-audit-v1.mjs';

test('classifies different Graphify ledgers as distinct roles', () => {
  const files = [
    ['sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts', 'INSERT INTO public.graphify_runs'],
    ['sveltekit-frontend/src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.ts', 'INSERT INTO public.graphify_executions'],
    ['scripts/atlas/lib/graphify-owner-decision-v1.mjs', 'INSERT INTO public.graphify_execution_authority'],
    ['scripts/atlas/apply-graphify-stale-run-reconciliation-v1.mjs', 'UPDATE public.graphify_runs'],
    ['scripts/startup/run-graphify-daily-startup.mjs', 'openGraphifyRunV1(); completeGraphifyRunV2();'],
  ];
  const classified = files.map(([filePath, source]) => ({ path: filePath, classification: classifyGraphifyOwnerRoleV1(filePath, source) }));
  const summary = summarizeGraphifyOwnerRolesV1(classified);
  assert.equal(summary.status, 'OWNER_ROLES_IDENTIFIED');
  assert.equal(summary.singleLifecycleWriterClaimed, false);
  assert.deepEqual(summary.missingRoles, []);
});

test('fails closed on an additional unclassified direct mutator', () => {
  const summary = summarizeGraphifyOwnerRolesV1([
    { path: 'unclassified.mjs', classification: 'UNCLASSIFIED_DIRECT_MUTATOR' },
  ]);
  assert.equal(summary.status, 'OWNER_ROLES_UNPROVEN');
  assert.deepEqual(summary.unclassifiedMutatorPaths, ['unclassified.mjs']);
});

test('does not mistake a planner or disposable proof harness for a canonical writer', () => {
  assert.equal(classifyGraphifyOwnerRoleV1('scripts/atlas/plan-current-graphify-execution-owner-resolution-v1.mjs', 'UPDATE graphify_executions'), 'PLANNER_ONLY');
  assert.equal(classifyGraphifyOwnerRoleV1('scripts/atlas/prove-graphify-open-bind-complete-lifecycle-v1.mjs', 'DELETE FROM graphify_runs'), 'LIFECYCLE_TEST_HARNESS');
  assert.equal(classifyGraphifyOwnerRoleV1('scripts/atlas/apply-graphify-execution-run-bridge-v1.mjs', 'UPDATE graphify_executions'), 'EXECUTION_RUN_BRIDGE_WRITER');
});

test('detects disagreement between owner and daily receipts and live authority rows', () => {
  const result = compareGraphifyExecutionReceiptsV1({
    decisionReceipt: { chosenExecutionId: 'selected-id' },
    dailyReceipt: { executionId: 'other-id' },
    authorityRows: [{ execution_id: 'selected-id', authority_state: 'LEGACY_IMPORTED' }],
  });
  assert.equal(result.status, 'CONFLICTING_RECEIPTS');
  assert.deepEqual(result.reasonCodes, [
    'DECISION_DAILY_EXECUTION_ID_MISMATCH',
    'AUTHORITY_TABLE_DOES_NOT_CONFIRM_DECISION_RECEIPT',
  ]);
});

test('fails closed when lifecycle receipts are absent', () => {
  const result = compareGraphifyExecutionReceiptsV1({ decisionReceipt: null, dailyReceipt: null, authorityRows: [] });
  assert.equal(result.status, 'CONFLICTING_RECEIPTS');
  assert.deepEqual(result.reasonCodes, [
    'DECISION_RECEIPT_MISSING_SELECTED_EXECUTION',
    'DAILY_RECEIPT_MISSING_EXECUTION',
  ]);
});

test('reports transition primitives without claiming a completed lifecycle run', () => {
  assert.deepEqual(findGraphifyTransitionPrimitivesV1([
    { path: 'coordinator.ts', transitionPrimitives: ['completeExecution'] },
    { path: 'inventory.ts', transitionPrimitives: ['completeGraphifyRunV2', 'completeGraphifyRunInTransactionV2'] },
  ]), ['completeExecution', 'completeGraphifyRunInTransactionV2', 'completeGraphifyRunV2']);
  assert.deepEqual(findGraphifyTransitionPrimitivesV1([]), []);
});

test('restricts diagnostic report overrides to repository .tmp', () => {
  const root = path.resolve('C:/repo');
  assert.equal(resolveGraphifyAuditOutputDirV1(root, '.tmp/graphify-audit'), path.join(root, '.tmp', 'graphify-audit'));
  assert.throws(() => resolveGraphifyAuditOutputDirV1(root, 'docs/reports'), /GRAPHIFY_AUDIT_OUTPUT_MUST_BE_UNDER_REPO_TMP/);
  assert.throws(() => resolveGraphifyAuditOutputDirV1(root, '../outside'), /GRAPHIFY_AUDIT_OUTPUT_MUST_BE_UNDER_REPO_TMP/);
});
