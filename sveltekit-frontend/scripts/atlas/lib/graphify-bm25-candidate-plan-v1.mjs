export function parseGraphifyBm25PlanLimitV1(args) {
  const supplied = args.filter((argument) => argument.startsWith('--limit='));
  if (supplied.length === 0) return 10;
  const value = Number(supplied.at(-1).slice('--limit='.length));
  if (!Number.isInteger(value) || value < 1) throw new Error('INVALID_GRAPHIFY_BM25_PLAN_LIMIT');
  return Math.min(100, value);
}

export function buildGraphifyBm25CandidatePlanV1(row) {
  return {
    graphifyRunId: row.graphify_run_id,
    workflowId: row.workflow_id,
    workspaceRevision: row.workspace_revision,
    sourceManifestDigest: row.source_manifest_digest,
    sourceManifestSourceCount: row.source_manifest_source_count,
    repositoryRevision: row.repository_revision,
    parameters: row.parameters,
    graphifyCompletedAt: row.graphify_completed_at,
    idempotencyKey: row.workflow_id + ':postgres_tsvector_english:' + row.source_manifest_digest,
    eligibility: 'CURRENT_ADMISSION_REVIEW_REQUIRED',
    leaseClaimAuthorized: false,
    nextAction: 'VERIFY_CURRENT_WORKSPACE_ADMISSION_AND_SOURCE_REVISION',
  };
}
