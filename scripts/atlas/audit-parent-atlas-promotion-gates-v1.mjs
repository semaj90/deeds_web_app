#!/usr/bin/env node
/**
 * Parent Atlas promotion-gate board.
 *
 * Read-only reconciliation over existing receipts. This is intentionally not
 * another source, graph, vector, or admission authority. Tournament admission
 * may bind a revision for control-plane comparison, but never promotes the
 * canonical source or projection authority by itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'parent-atlas-promotion-gates-v1.json');

const reportFiles = {
  sourceAuthority: 'docs/reports/current-graphify-snapshot-authority-v1.json',
  sourceOwner: 'docs/reports/current-source-owner-reconciliation-v1.json',
  sourceHydration: 'docs/reports/current-source-evidence-hydration-v1.json',
  semantic: 'docs/reports/current-semantic768-corpus-manifest-plan-v1.json',
  qdrant: 'docs/reports/lineage-qdrant-semantic-canary-v1.json',
  latent: 'docs/reports/latent-representation-identity-audit-2026-09-08.json',
  admission: 'docs/reports/admission-parameters-v1.json',
  graph: 'docs/reports/graph-projection-manifest-v1.json',
  judgment: 'docs/reports/retrieval-judgment-set-v1.json',
  parity: 'docs/reports/retrieval-parity-receipt-v1.json',
};

function readJson(relative) {
  const absolute = path.join(ROOT, relative);
  try {
    return { path: relative, exists: true, value: JSON.parse(fs.readFileSync(absolute, 'utf8')) };
  } catch {
    return { path: relative, exists: false, value: null };
  }
}

const admissionReceipt = readJson('docs/reports/workspace-revision-tournament-admission-v1.json');
const derivationReceipt = readJson('docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
const selectionPlan = readJson('docs/reports/graphify-source-selection-plan-v1.json');
const bindingReceipt = readJson('docs/reports/graphify-workspace-snapshot-binding-v1.json');
const ownerReceipt = readJson('docs/reports/current-graphify-run-owner-v1.json');
const currentCandidate = derivationReceipt.value?.status === 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION'
  && derivationReceipt.value?.snapshotRevision === selectionPlan.value?.snapshotRevision
  && derivationReceipt.value?.workspaceRevisionCandidate === selectionPlan.value?.workspaceRevisionCandidate
  ? derivationReceipt.value.workspaceRevisionCandidate : null;
const admittedRevision = admissionReceipt.value?.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
  && admissionReceipt.value?.authority === true
  && admissionReceipt.value?.workspaceRevision === currentCandidate
  ? admissionReceipt.value.workspaceRevision : null;
const workspaceRevision = admittedRevision;

function evidence(...keys) {
  return keys.map((key) => readJson(reportFiles[key])).map(({ path: report, exists, value }) => ({
    report,
    exists,
    status: value?.status ?? value?.verdict ?? value?.decision ?? null,
  }));
}

function gate(id, name, status, proofLevel, blocking, evidenceItems, violations = []) {
  return {
    id,
    name,
    status,
    proofLevel,
    blocking,
    writesPerformed: false,
    authority: false,
    evidence: evidenceItems,
    violations,
  };
}

const gates = [];
const ownerProven = ownerReceipt.value?.status === 'GRAPHIFY_RUN_OWNER_COMPLETE';
const bindingObserved = bindingReceipt.value?.status === 'GRAPHIFY_SNAPSHOT_BINDING_OBSERVED_NOT_ADMITTED';
const firstBlockingInvariant = ownerProven
  ? 'CURRENT_STRUCTURAL_LINEAGE_NOT_PROVEN'
  : bindingObserved
    ? 'CURRENT_GRAPHIFY_RUN_OWNER_UNPROVEN'
    : 'WORKSPACE_SNAPSHOT_BINDING_UNPROVEN';

gates.push(gate(
  'CURRENT-SOURCE-TERMINAL-EXECUTION-01',
  'Current source terminal execution',
  ownerProven ? 'PROVEN' : 'BLOCKED',
  ownerProven ? 'PARTIAL_PROVEN' : 'BLOCKED',
  true,
  evidence('sourceAuthority', 'sourceOwner', 'sourceHydration'),
  ownerProven ? [] : [firstBlockingInvariant],
));

const dependent = [
  ['CURRENT-STRUCTURAL-LINEAGE-01', 'Current structural lineage', ['sourceAuthority', 'sourceHydration']],
  ['SEMANTIC-768-OWNER-RECONCILIATION-01', 'Semantic 768 owner reconciliation', ['semantic']],
  ['REPRESENTATION-LEDGER-01', 'Representation ledger', ['latent', 'semantic']],
  ['QDRANT-V2-IDENTITY-LINEAGE-01', 'Qdrant v2 identity lineage', ['qdrant', 'semantic']],
  ['LEIDEN-EXACT-PROJECTION-IDENTITY-01', 'Leiden exact projection identity', ['qdrant', 'graph']],
  ['GRAPH-PROJECTION-MANIFEST-01', 'Graph projection manifest', ['graph']],
  ['RRF-CURRENT-PRODUCTION-REPLAY-01', 'RRF current production replay', []],
  ['RETRIEVAL-JUDGMENT-SET-01', 'Reviewed retrieval judgment set', ['judgment']],
  ['RETRIEVAL-PARITY-RECEIPT-01', 'Retrieval parity receipt', ['parity', 'qdrant', 'semantic']],
];

for (const [id, name, keys] of dependent) {
  gates.push(gate(id, name, 'BLOCKED_BY_PREVIOUS_GATE', 'BLOCKED', true, evidence(...keys), [firstBlockingInvariant]));
}

const counts = {
  totalGates: gates.length,
  evaluatedGates: 1,
  blockedGates: gates.length,
  provenGates: 0,
  workspaceRevision,
};

const canonicalPayload = JSON.stringify({
  schema: 'atlas.parent-atlas-promotion-gates.v1',
  workspaceRevision,
  gates: gates.map(({ id, status, proofLevel, violations }) => ({ id, status, proofLevel, violations })),
});

const report = {
  schema: 'atlas.parent-atlas-promotion-gates.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status: 'BLOCKED',
  proofLevel: 'BLOCKED',
  writesPerformed: false,
  authority: false,
  workspaceRevision,
  workspaceRevisionCandidate: currentCandidate,
  authorityInputConsistency: {
    derivationStatus: derivationReceipt.value?.status ?? null,
    planStatus: selectionPlan.value?.status ?? null,
    derivationPlanSnapshotMatch: Boolean(currentCandidate),
    admissionMatchesCurrentCandidate: Boolean(admittedRevision),
  },
  workspaceRevisionPolicy: admittedRevision
    ? 'TOURNAMENT_CONTROL_PLANE_ADMITTED_CANONICAL_OWNER_PENDING'
    : 'UNBOUND_UNTIL_TOURNAMENT',
  counts,
  violations: gates[0].violations,
  gates,
  firstBlockingGate: ownerProven ? gates[1].id : gates[0].id,
  firstBlockingInvariant,
  nextGate: ownerProven ? gates[1].id : gates[0].id,
  safeNextCommand: ownerProven
    ? 'npx tsx scripts/atlas/audit-current-structural-lineage-v1.mjs'
    : 'npx tsx scripts/atlas/audit-current-graphify-run-owner-v1.mjs',
  reportPath: 'docs/reports/parent-atlas-promotion-gates-v1.json',
  evidence: Object.fromEntries(Object.entries(reportFiles).map(([key, relative]) => [key, readJson(relative)])),
  checksum: `sha256:${crypto.createHash('sha256').update(canonicalPayload).digest('hex')}`,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  firstBlockingGate: report.firstBlockingGate,
  firstBlockingInvariant: report.firstBlockingInvariant,
  nextGate: report.nextGate,
  workspaceRevision,
  writesPerformed: false,
  reportPath: report.reportPath,
}, null, 2));
