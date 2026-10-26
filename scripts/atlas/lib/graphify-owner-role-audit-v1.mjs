import path from 'node:path';

const ROLE_PATHS = [
  ['REVISION_INVENTORY_WRITER', 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts'],
  ['PER_ATTEMPT_EXECUTION_WRITER', 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.ts'],
  ['EXECUTION_AUTHORITY_WRITER', 'scripts/atlas/lib/graphify-owner-decision-v1.mjs'],
  ['STALE_RUN_MAINTENANCE_WRITER', 'scripts/atlas/apply-graphify-stale-run-reconciliation-v1.mjs'],
  ['DAILY_WORKFLOW_ORCHESTRATOR', 'scripts/startup/run-graphify-daily-startup.mjs'],
];

export function classifyGraphifyOwnerRoleV1(filePath, source) {
  const normalized = filePath.replaceAll('\\', '/');
  const known = ROLE_PATHS.find(([, suffix]) => normalized === suffix);
  if (known) return known[0];
  if (/\/plan-|\/planner/i.test(`/${normalized}`)) return 'PLANNER_ONLY';
  if (/^scripts\/atlas\/prove-graphify-open-bind-complete-lifecycle-v1\.mjs$/i.test(normalized)) return 'LIFECYCLE_TEST_HARNESS';
  if (/^scripts\/atlas\/apply-graphify-execution-run-bridge-v1\.mjs$/i.test(normalized)) return 'EXECUTION_RUN_BRIDGE_WRITER';
  if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(?:graphify_runs|graphify_executions|graphify_execution_authority)\b/i.test(source)) {
    return 'UNCLASSIFIED_DIRECT_MUTATOR';
  }
  if (/audit-|audit\//i.test(normalized)) return 'READ_ONLY_AUDITOR';
  if (/graphify_runs|graphify_executions|graphify_execution_authority/i.test(source)) return 'REFERENCE_ONLY';
  return null;
}

export function summarizeGraphifyOwnerRolesV1(paths) {
  const roleCounts = Object.fromEntries(ROLE_PATHS.map(([role]) => [role, paths.filter((item) => item.classification === role).length]));
  const unclassifiedMutators = paths.filter((item) => item.classification === 'UNCLASSIFIED_DIRECT_MUTATOR').map((item) => item.path);
  const missingRoles = Object.entries(roleCounts).filter(([, count]) => count !== 1).map(([role]) => role);
  return {
    status: missingRoles.length || unclassifiedMutators.length ? 'OWNER_ROLES_UNPROVEN' : 'OWNER_ROLES_IDENTIFIED',
    roleCounts,
    missingRoles,
    unclassifiedMutatorPaths: unclassifiedMutators,
    singleLifecycleWriterClaimed: false,
  };
}

export function findGraphifyTransitionPrimitivesV1(paths) {
  const allowed = new Set(['completeExecution', 'completeGraphifyRunInTransactionV2', 'completeGraphifyRunV2']);
  return [...new Set(paths.flatMap((item) => item.transitionPrimitives ?? []))]
    .filter((name) => allowed.has(name))
    .sort();
}

export function compareGraphifyExecutionReceiptsV1({ decisionReceipt, dailyReceipt, authorityRows }) {
  const selectedId = decisionReceipt?.chosenExecutionId ?? null;
  const dailyId = dailyReceipt?.executionId ?? null;
  const selectedRows = authorityRows.filter((row) => row.authority_state === 'SELECTED');
  const mismatches = [];
  if (!selectedId) mismatches.push('DECISION_RECEIPT_MISSING_SELECTED_EXECUTION');
  if (!dailyId) mismatches.push('DAILY_RECEIPT_MISSING_EXECUTION');
  if (selectedId && dailyId && selectedId !== dailyId) mismatches.push('DECISION_DAILY_EXECUTION_ID_MISMATCH');
  if (selectedId && (selectedRows.length !== 1 || selectedRows[0]?.execution_id !== selectedId)) {
    mismatches.push('AUTHORITY_TABLE_DOES_NOT_CONFIRM_DECISION_RECEIPT');
  }
  return {
    status: mismatches.length ? 'CONFLICTING_RECEIPTS' : 'RECEIPTS_CONSISTENT',
    selectedExecutionId: selectedId,
    dailyExecutionId: dailyId,
    authorityRows: authorityRows.length,
    selectedAuthorityRows: selectedRows.length,
    reasonCodes: mismatches,
  };
}

export function resolveGraphifyAuditOutputDirV1(root, requestedDir) {
  if (!requestedDir) return path.join(root, 'docs', 'reports');
  const tempRoot = path.resolve(root, '.tmp');
  const outputDir = path.resolve(root, requestedDir);
  const relative = path.relative(tempRoot, outputDir);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('GRAPHIFY_AUDIT_OUTPUT_MUST_BE_UNDER_REPO_TMP');
  }
  return outputDir;
}
