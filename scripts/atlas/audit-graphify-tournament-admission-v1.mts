#!/usr/bin/env node

/**
 * Read-only compatibility audit for Graphify source selection and the existing
 * patch-tournament contract. It does not run a tournament or mutate state.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-tournament-admission-v1.json');
const DERIVATION = resolve(ROOT, 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
function argument(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const planPath = resolve(ROOT, argument('--plan') ?? 'docs/reports/graphify-source-selection-plan-v1.json');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const derivation = JSON.parse(await readFile(DERIVATION, 'utf8'));
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
if (plan.authority !== false) blockers.push('PLAN_AUTHORITY_FLAG_NOT_FALSE');
if (workspaceRevision !== null) blockers.push('PLAN_WORKSPACE_REVISION_MUST_REMAIN_NULL_UNTIL_ADMISSION');
if (plan.admission?.canCallRecordSourceSelectionStage !== false) blockers.push('PLAN_MUST_NOT_CALL_COORDINATOR');
if (plan.status !== 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED') blockers.push('SOURCE_SELECTION_PLAN_NOT_READY');
if (plan.snapshotRevision !== derivation.snapshotRevision) blockers.push('PLAN_DERIVATION_SNAPSHOT_MISMATCH');
if (planCandidate !== derivationCandidate) blockers.push('PLAN_DERIVATION_WORKSPACE_CANDIDATE_MISMATCH');
if (derivation.status !== 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION') blockers.push('WORKSPACE_REVISION_DERIVATION_NOT_READY');
const report = {
  schema: 'atlas.graphify-tournament-admission.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: blockers.length ? 'TOURNAMENT_ADMISSION_AUDIT_BLOCKED' : 'TOURNAMENT_ADMISSION_BOUNDARY_PROVEN',
  proofLevel: blockers.length ? 'PARTIAL_PROVEN' : 'CONTRACT_PROVEN', authority: false,
  workspaceRevision: null, workspaceRevisionCandidate: plan.workspaceRevisionCandidate ?? plan.snapshotRevision ?? null,
  writesPerformed: false, datastoreWritesPerformed: false,
  sourceSelectionPlan: { path: planPath, status: plan.status ?? null, snapshotRevision: plan.snapshotRevision ?? null, workspaceRevisionCandidate: planCandidate, sourceCount: plan.sourceCount ?? 0, sourceSelectionChecksum: plan.sourceSelectionChecksum ?? null },
  workspaceRevisionDerivation: { path: DERIVATION, status: derivation.status ?? null, snapshotRevision: derivation.snapshotRevision ?? null, workspaceRevisionCandidate: derivationCandidate, sourceCount: derivation.sourceCount ?? 0, repositoryCount: derivation.repositoryCount ?? 0 },
  tournamentContract: contract,
  compatibility: { planRevisionNull: workspaceRevision === null, tournamentCanAcceptPlan: false, reason: 'Existing tournament request schema requires a non-null workspaceRevision; null is preserved until source-authority admission.' },
  blockers, firstBlockingInvariant: 'TOURNAMENT_REQUIRES_BOUND_WORKSPACE_REVISION',
  nextGate: 'WORKSPACE-REVISION-TOURNAMENT-SOURCE-AUTHORITY-01',
  safeNextCommand: 'npm run atlas:graphify:source-selection:plan',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, tournamentCanAcceptPlan: false, firstBlockingInvariant: report.firstBlockingInvariant, reportPath: REPORT }, null, 2));
