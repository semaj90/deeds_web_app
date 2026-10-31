#!/usr/bin/env node
/**
 * GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02
 *
 * Validates an operator-supplied owner choice against the existing immutable,
 * read-only owner-resolution plan. This is a decision preflight only: it does
 * not relabel, delete, or update any Graphify execution.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { verifySelectedGraphifyAuthorityReadbackV1 } from './lib/selected-graphify-authority-readback-v1.mjs';

const root = REPO_ROOT;
const option = (name, fallback) => {
  const index = process.argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (index < 0) return fallback;
  const value = process.argv[index] === `--${name}` ? process.argv[index + 1] : process.argv[index].slice(name.length + 3);
  if (!value?.trim()) throw new Error(`${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  return path.resolve(root, value.trim());
};
const planPath = option('plan', path.join(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json'));
const reportPath = option('report', path.join(root, 'docs/reports/selected-graphify-execution-owner-v1.json'));
const isInside = (parent, target) => {
  const rel = path.relative(parent, target);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};
if (!isInside(root, planPath)) throw new Error('OWNER_PLAN_MUST_REMAIN_UNDER_REPOSITORY');
if (reportPath !== path.join(root, 'docs/reports/selected-graphify-execution-owner-v1.json')
  && !isInside(path.join(root, '.tmp/atlas'), reportPath)) {
  throw new Error('CUSTOM_REPORT_MUST_REMAIN_UNDER_TMP_ATLAS');
}
const index = process.argv.indexOf('--execution-id');
const executionId = index >= 0 ? process.argv[index + 1] ?? null : null;
if (!executionId) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');

const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
const planForChecksum = { ...plan };
delete planForChecksum.generatedAt;
delete planForChecksum.reportPath;
const ownerPlanChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(planForChecksum), 'utf8').digest('hex')}`;
const candidate = Array.isArray(plan.candidates)
  ? plan.candidates.find((entry) => String(entry.execution_id) === executionId)
  : null;
const candidateAdmissible = candidate?.sourceMembershipExact === true
  && (plan.status === 'SINGLE_CURRENT_EXECUTION_CANDIDATE'
    || (plan.status === 'DUPLICATE_EQUIVALENT_EXECUTIONS' && plan.equivalence?.allEquivalent === true));
let liveOwner = null;
if (candidateAdmissible) {
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
    max: 1,
    statement_timeout: 10_000,
    application_name: 'audit-selected-graphify-execution-owner-v1',
  });
  try {
    const result = await pool.query(
      `select execution_id::text, workspace_id::text, workspace_revision::text,
              authority_state, selected_at, selected_by, selection_receipt
         from public.graphify_execution_authority
        where workspace_id = $1::uuid
          and workspace_revision = $2
          and execution_id = $3::uuid`,
      [candidate.workspace_id, candidate.workspace_revision, executionId],
    );
    liveOwner = { rows: result.rows };
  } finally {
    await pool.end();
  }
}
const appliedAndReadBack = candidateAdmissible && verifySelectedGraphifyAuthorityReadbackV1({
  executionId,
  workspaceId: candidate.workspace_id,
  workspaceRevision: candidate.workspace_revision,
  rows: liveOwner?.rows ?? [],
});
const report = {
  schema: 'atlas.selected-graphify-execution-owner.v1',
  gate: 'GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02',
  mode: 'READ_ONLY_OWNER_DECISION_AUDIT',
  selectedExecutionId: executionId,
  sourcePlan: path.relative(root, planPath).replaceAll('\\', '/'),
  ownerPlanChecksum,
  candidateFound: Boolean(candidate),
  candidate: candidate ? {
    executionId: candidate.execution_id,
    workspaceId: candidate.workspace_id,
    workspaceRevision: candidate.workspace_revision,
    sourceCount: candidate.sourceCount,
    sourceMembershipExact: candidate.sourceMembershipExact,
    signature: candidate.signature ?? null,
  } : null,
  liveOwner,
  status: appliedAndReadBack ? 'OWNER_SELECTION_APPLIED_READBACK_VERIFIED' : candidateAdmissible ? 'OWNER_SELECTION_VALIDATED_NOT_APPLIED' : 'OWNER_SELECTION_REJECTED',
  rejectionReason: candidateAdmissible
    ? appliedAndReadBack ? null : 'AUTHORITY_TABLE_SELECTION_OR_RECEIPT_NOT_VERIFIED'
    : !candidate ? 'EXECUTION_NOT_IN_PROVEN_PLAN' : 'EXECUTION_NOT_PROVEN_CURRENT',
  requiresExplicitAuthorityDecision: !appliedAndReadBack,
  canonicalAuthority: appliedAndReadBack,
  safeToApply: false,
  writesPerformed: false,
  decisionChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    executionId, candidateAdmissible, appliedAndReadBack, ownerPlanChecksum, planStatus: plan.status, planEquivalence: plan.equivalence,
  }), 'utf8').digest('hex')}`,
  nextGate: appliedAndReadBack ? 'CURRENT_SOURCE_COHORT_RECONCILIATION' : candidateAdmissible ? 'EXPLICIT_AUTHORITY_DECISION_AND_OWNER_READBACK' : 'GRAPHIFY_EXECUTION_OWNER_RESOLUTION',
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.${process.pid}.tmp`;
await fs.writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.rename(tempPath, reportPath);
console.log(JSON.stringify({
  status: report.status,
  selectedExecutionId: executionId,
  candidateFound: report.candidateFound,
  safeToApply: false,
  writesPerformed: false,
  reportPath: report.reportPath,
}, null, 2));
