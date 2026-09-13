#!/usr/bin/env node

/**
 * Read-only compatibility audit for Graphify source selection and the existing
 * patch-tournament contract. It does not run a tournament or mutate state.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-tournament-admission-v1.json');
const DERIVATION = resolve(ROOT, 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
function argument(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const planPath = resolve(ROOT, argument('--plan') ?? 'docs/reports/graphify-source-selection-plan-v1.json');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const derivation = JSON.parse(await readFile(DERIVATION, 'utf8'));
const admission = existsSync(ADMISSION) ? JSON.parse(await readFile(ADMISSION, 'utf8')) : null;
const workspaceRevision = plan.workspaceRevision ?? null;
const planCandidate = plan.workspaceRevisionCandidate ?? null;
const derivationCandidate = derivation.workspaceRevisionCandidate ?? null;
const contract = {
  tournamentOwner: 'sveltekit-frontend/src/lib/server/agent/patch-tournament.ts',
  requiredRequestField: 'workspaceRevision',
  requiredRequestType: 'non-null string',
  autoApply: false,
  training: false,
};
const blockers = [] as string[];
const admitted = admission?.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && admission.authority === true;
const admissionRepositoryCount = admission?.repositoryCount ?? derivation.repositoryCount ?? null;
if (admitted) {
  if (admission.workspaceRevision !== derivation.workspaceRevisionCandidate) blockers.push('ADMISSION_DERIVATION_WORKSPACE_REVISION_MISMATCH');
  if (admission.snapshotRevision !== derivation.snapshotRevision) blockers.push('ADMISSION_DERIVATION_SNAPSHOT_MISMATCH');
  if (admission.snapshotSourceCount !== derivation.sourceCount) blockers.push('ADMISSION_DERIVATION_SNAPSHOT_SCOPE_MISMATCH');
  if (admissionRepositoryCount !== derivation.repositoryCount) blockers.push('ADMISSION_DERIVATION_REPOSITORY_SCOPE_MISMATCH');
  if (admission.sourceInventoryRevision !== plan.sourceInventoryRevision) blockers.push('ADMISSION_SOURCE_INVENTORY_REVISION_MISMATCH');
  if (admission.sourceInventoryChecksum !== plan.sourceInventoryChecksum) blockers.push('ADMISSION_SOURCE_INVENTORY_CHECKSUM_MISMATCH');
  if (admission.sourceSelectionChecksum !== plan.sourceSelectionChecksum) blockers.push('ADMISSION_SOURCE_SELECTION_CHECKSUM_MISMATCH');
  if (admission.sourceCount !== plan.sourceCount) blockers.push('ADMISSION_SOURCE_SELECTION_COUNT_MISMATCH');
} else {
  if (plan.authority !== false) blockers.push('PLAN_AUTHORITY_FLAG_NOT_FALSE');
  if (workspaceRevision !== null) blockers.push('PLAN_WORKSPACE_REVISION_MUST_REMAIN_NULL_UNTIL_ADMISSION');
  if (plan.admission?.canCallRecordSourceSelectionStage !== false) blockers.push('PLAN_MUST_NOT_CALL_COORDINATOR');
  if (plan.status !== 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED') blockers.push('SOURCE_SELECTION_PLAN_NOT_READY');
  if (plan.snapshotRevision !== derivation.snapshotRevision) blockers.push('PLAN_DERIVATION_SNAPSHOT_MISMATCH');
  if (planCandidate !== derivationCandidate) blockers.push('PLAN_DERIVATION_WORKSPACE_CANDIDATE_MISMATCH');
  if (typeof plan.sourceInventoryRevision !== 'string' || typeof plan.sourceInventoryChecksum !== 'string') blockers.push('PLAN_SOURCE_INVENTORY_PROVENANCE_MISSING');
}
if (derivation.status !== 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION') blockers.push('WORKSPACE_REVISION_DERIVATION_NOT_READY');
const report = {
  schema: 'atlas.graphify-tournament-admission.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: blockers.length ? 'TOURNAMENT_ADMISSION_AUDIT_BLOCKED' : 'TOURNAMENT_ADMISSION_BOUNDARY_PROVEN',
  proofLevel: blockers.length ? 'PARTIAL_PROVEN' : (admitted ? 'BOUNDED_LIVE_PROVEN' : 'CONTRACT_PROVEN'), authority: admitted && blockers.length === 0,
  workspaceRevision: admitted && blockers.length === 0 ? admission.workspaceRevision : null,
  workspaceRevisionCandidate: admitted ? admission.workspaceRevision : plan.workspaceRevisionCandidate ?? plan.snapshotRevision ?? null,
  writesPerformed: false, datastoreWritesPerformed: false,
  sourceSelectionPlan: {
    path: planPath,
    status: plan.status ?? null,
    snapshotRevision: plan.snapshotRevision ?? null,
    workspaceRevisionCandidate: planCandidate,
    snapshotSourceCount: plan.snapshotSourceCount ?? null,
    sourceCount: plan.sourceCount ?? 0,
    sourceInventoryRevision: plan.sourceInventoryRevision ?? null,
    sourceInventoryChecksum: plan.sourceInventoryChecksum ?? null,
    sourceSelectionChecksum: plan.sourceSelectionChecksum ?? null,
  },
  admissionReceipt: admitted ? {
    path: ADMISSION,
    status: admission.status,
    workspaceRevision: admission.workspaceRevision,
    snapshotRevision: admission.snapshotRevision,
    snapshotSourceCount: admission.snapshotSourceCount,
    sourceCount: admission.sourceCount,
    repositoryCount: admissionRepositoryCount,
    sourceInventoryRevision: admission.sourceInventoryRevision,
    sourceInventoryChecksum: admission.sourceInventoryChecksum,
    sourceSelectionChecksum: admission.sourceSelectionChecksum,
    graphifyExecutionAuthorized: admission.graphifyExecutionAuthorized === true,
    projectionWritesAuthorized: admission.projectionWritesAuthorized === true,
  } : null,
  workspaceRevisionDerivation: { path: DERIVATION, status: derivation.status ?? null, snapshotRevision: derivation.snapshotRevision ?? null, workspaceRevisionCandidate: derivationCandidate, sourceCount: derivation.sourceCount ?? 0, repositoryCount: derivation.repositoryCount ?? 0 },
  tournamentContract: contract,
  compatibility: {
    planRevisionNull: workspaceRevision === null,
    tournamentCanAcceptPlan: admitted && blockers.length === 0,
    reason: admitted && blockers.length === 0
      ? 'Current admission receipt binds workspace, snapshot, source-inventory, and canonical source-selection provenance; Graphify execution remains separately gated.'
      : 'Existing tournament request schema requires a non-null admitted workspaceRevision and a checksum-bound canonical source selection.',
  },
  blockers,
  firstBlockingInvariant: blockers[0] ?? null,
  nextGate: admitted && blockers.length === 0 ? 'AUTHORIZE-GRAPHIFY-POST-PHASE16-TERMINAL-RUN-01' : 'WORKSPACE-REVISION-TOURNAMENT-SOURCE-AUTHORITY-01',
  safeNextCommand: 'npm run atlas:graphify:source-selection:plan',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: report.authority, workspaceRevision: report.workspaceRevision, sourceInventoryChecksum: report.sourceSelectionPlan.sourceInventoryChecksum, sourceSelectionChecksum: report.sourceSelectionPlan.sourceSelectionChecksum, tournamentCanAcceptPlan: report.compatibility.tournamentCanAcceptPlan, firstBlockingInvariant: report.firstBlockingInvariant, reportPath: REPORT }, null, 2));
if (blockers.length) process.exitCode = 3;
