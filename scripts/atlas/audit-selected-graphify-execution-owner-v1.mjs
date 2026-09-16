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
import { REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const planPath = path.join(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const reportPath = path.join(root, 'docs/reports/selected-graphify-execution-owner-v1.json');
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
const equivalent = plan.status === 'DUPLICATE_EQUIVALENT_EXECUTIONS'
  && plan.equivalence?.allEquivalent === true
  && candidate?.sourceMembershipExact === true;
const report = {
  schema: 'atlas.selected-graphify-execution-owner.v1',
  gate: 'GRAPHIFY-EXECUTION-SNAPSHOT-OWNER-02',
  mode: 'READ_ONLY_OWNER_DECISION_PREFLIGHT',
  selectedExecutionId: executionId,
  sourcePlan: path.relative(root, planPath).replaceAll('\\', '/'),
  ownerPlanChecksum,
  candidateFound: Boolean(candidate),
  candidate: candidate ? {
    executionId: candidate.execution_id,
    workspaceRevision: candidate.workspace_revision,
    sourceCount: candidate.sourceCount,
    sourceMembershipExact: candidate.sourceMembershipExact,
    signature: candidate.signature ?? null,
  } : null,
  status: equivalent ? 'OWNER_SELECTION_VALIDATED_NOT_APPLIED' : 'OWNER_SELECTION_REJECTED',
  rejectionReason: equivalent ? null : !candidate ? 'EXECUTION_NOT_IN_PROVEN_PLAN' : 'EXECUTION_NOT_PROVEN_EQUIVALENT',
  requiresExplicitAuthorityDecision: true,
  canonicalAuthority: false,
  safeToApply: false,
  writesPerformed: false,
  decisionChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    executionId, equivalent, ownerPlanChecksum, planStatus: plan.status, planEquivalence: plan.equivalence,
  }), 'utf8').digest('hex')}`,
  nextGate: equivalent ? 'EXPLICIT_AUTHORITY_DECISION_AND_OWNER_READBACK' : 'GRAPHIFY_EXECUTION_OWNER_RESOLUTION',
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
