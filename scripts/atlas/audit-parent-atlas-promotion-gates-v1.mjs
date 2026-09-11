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
  snapshotConsumerPreflight: 'docs/reports/graphify-snapshot-consumer-preflight-v1.json',
};

// Independent lane observations are diagnostic only. They do not override the
// dependency gate or grant authority to any downstream projection.
const independentLaneReports = {
  structural: 'docs/reports/current-workspace-packet-chunk-join-v1.json',
  semanticOwner: 'docs/reports/semantic-768-writer-ownership-v1.json',
  representation: 'docs/reports/latent-representation-identity-audit-2026-09-10.json',
  graph: 'docs/reports/current-graph-artifact-readiness-v1.json',
  qdrant: 'docs/reports/qdrant-packet-fanout-v1.json',
  rrfWeights: 'docs/reports/rrf-lane-weight-census-v1.json',
  rrfIdentity: 'docs/reports/rrf-real-caller-identity-envelope-v1.json',
  classifier: 'docs/reports/domain-classifier-lineage-v1.json',
  ontology: 'docs/reports/parent-atlas-concept-fabric-audit-v1.json',
  ace: 'docs/reports/ace-live-dry-input-readiness-v2.json',
  judgment: 'docs/reports/golden-relevance-review-queue-validation-v1.json',
};

function readJson(relative) {
  const absolute = path.join(ROOT, relative);
  try {
    return { path: relative, exists: true, value: JSON.parse(fs.readFileSync(absolute, 'utf8')) };
  } catch {
    return { path: relative, exists: false, value: null };
  }
}

function firstFailedCheck(value) {
  if (!value || typeof value !== 'object') return null;
  const checks = value.checks;
  if (checks && typeof checks === 'object') {
    const failed = Object.entries(checks).find(([, passed]) => passed !== true);
    if (failed) return failed[0];
  }
  const metrics = value.metrics;
  if (metrics && typeof metrics === 'object') {
    const failed = Object.entries(metrics).find(([key, metric]) => {
      if (!/missing|mismatch|unproven|ambiguous|conflict|blocked|unknown|unclassified|orphan/i.test(key)) return false;
      return typeof metric === 'number' ? metric > 0 : metric === false;
    });
    if (failed) return failed[0];
  }
  return null;
}

function readIndependentLaneFindings() {
  return Object.fromEntries(Object.entries(independentLaneReports).map(([lane, relative]) => {
    const item = readJson(relative);
    const value = item.value;
    const status = value?.status ?? value?.verdict ?? value?.decision ?? null;
    const firstBlockingInvariant = value?.firstBlockingInvariant
      ?? value?.blockers?.[0]
      ?? value?.admissionBlockers?.[0]
      ?? value?.nextRequiredStep
      ?? firstFailedCheck(value)
      ?? (status && !/proven|pass|complete|admitted/i.test(String(status))
        ? `STATUS_NOT_PROMOTABLE:${status}`
        : null);
    return [lane, {
      report: relative,
      exists: item.exists,
      status,
      proofLevel: value?.proofLevel ?? null,
      authority: value?.authority ?? value?.canonicalAuthority ?? false,
      writesPerformed: value?.writesPerformed ?? value?.databaseWrites ?? value?.datastoreWritesPerformed ?? false,
      firstBlockingInvariant,
    }];
  }));
}

const admissionReceipt = readJson('docs/reports/workspace-revision-tournament-admission-v1.json');
const derivationReceipt = readJson('docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
const selectionPlan = readJson('docs/reports/graphify-source-selection-plan-v1.json');
const bindingReceipt = readJson('docs/reports/graphify-workspace-snapshot-binding-v1.json');
const consumerPreflight = readJson('docs/reports/graphify-snapshot-consumer-preflight-v1.json');
const ownerReceipt = readJson('docs/reports/current-graphify-run-owner-v1.json');
const currentCandidate = derivationReceipt.value?.status === 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION'
  && derivationReceipt.value?.snapshotRevision === selectionPlan.value?.snapshotRevision
  && derivationReceipt.value?.workspaceRevisionCandidate === selectionPlan.value?.workspaceRevisionCandidate
  ? derivationReceipt.value.workspaceRevisionCandidate : null;
// Workspace admission is its own authority decision. Do not require the
// derivation report to still be discoverable/current in order to preserve an
// already admitted revision; currentness conflicts are reported separately.
const admittedRevision = admissionReceipt.value?.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
  && admissionReceipt.value?.authority === true
  && typeof admissionReceipt.value?.workspaceRevision === 'string'
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
const ownerProven = ownerReceipt.value?.status === 'GRAPHIFY_RUN_OWNER_COMPLETE'
  && ownerReceipt.value?.expectedWorkspaceRevision === admittedRevision
  && Number(ownerReceipt.value?.completedOwnerCount ?? 0) === 1;
const bindingObserved = bindingReceipt.value?.status === 'GRAPHIFY_SNAPSHOT_BINDING_OBSERVED_NOT_ADMITTED';
const consumerPreflightProven = consumerPreflight.value?.status === 'GRAPHIFY_SNAPSHOT_CONSUMER_PREFLIGHT_PROVEN'
  && consumerPreflight.value?.sourceKind === 'ADMITTED_WORKSPACE_SNAPSHOT'
  && consumerPreflight.value?.workspaceRevision === admittedRevision
  && typeof consumerPreflight.value?.snapshotRevision === 'string'
  && Number(consumerPreflight.value?.persistentWrites ?? 1) === 0
  && Number(consumerPreflight.value?.liveInventoryBuilderCalls ?? 1) === 0
  && Number(consumerPreflight.value?.gitRevisionDerivationCalls ?? 1) === 0
  && Number(consumerPreflight.value?.unexpectedRepositoryDiscovery ?? 1) === 0
  && Number(consumerPreflight.value?.childApplyCommands ?? 1) === 0
  && Array.isArray(consumerPreflight.value?.violations)
  && consumerPreflight.value.violations.length === 0;
const firstBlockingInvariant = !admittedRevision
  ? 'WORKSPACE_REVISION_NOT_ADMITTED'
  : ownerProven
  ? 'CURRENT_STRUCTURAL_LINEAGE_NOT_PROVEN'
  : consumerPreflightProven
    ? 'SNAPSHOT_BOUND_GRAPHIFY_CANARY_NOT_AUTHORIZED'
  : bindingObserved
    ? 'CURRENT_GRAPHIFY_RUN_OWNER_UNPROVEN'
    : 'GRAPHIFY_SNAPSHOT_CONSUMER_NOT_REVISION_ADDRESSABLE';
const nextGate = ownerProven
  ? 'CURRENT-STRUCTURAL-LINEAGE-01'
  : consumerPreflightProven
    ? 'SNAPSHOT-BOUND-GRAPHIFY-CANARY-01'
    : 'CURRENT-SOURCE-TERMINAL-EXECUTION-01';

gates.push(gate(
  'CURRENT-SOURCE-TERMINAL-EXECUTION-01',
  'Current source terminal execution',
  ownerProven ? 'PROVEN' : 'BLOCKED',
  ownerProven ? 'PARTIAL_PROVEN' : 'BLOCKED',
  true,
  evidence('sourceAuthority', 'sourceOwner', 'sourceHydration', 'snapshotConsumerPreflight'),
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
  workspaceAuthority: {
    status: admittedRevision ? 'ADMITTED' : 'UNADMITTED',
    workspaceRevision: admittedRevision,
    snapshotRevision: admissionReceipt.value?.snapshotRevision ?? null,
    sourceCount: admissionReceipt.value?.sourceCount ?? null,
    sourceSelectionChecksum: admissionReceipt.value?.sourceSelectionChecksum ?? null,
    receiptPath: admissionReceipt.path,
    authority: Boolean(admittedRevision),
  },
  graphifyExecution: {
    status: ownerProven ? 'PROVEN' : 'BLOCKED',
    executionId: ownerReceipt.value?.currentRun?.executionId ?? null,
    expectedWorkspaceRevision: ownerReceipt.value?.expectedWorkspaceRevision ?? null,
    matchesAdmittedWorkspaceRevision: ownerProven,
    blocker: ownerProven ? null : 'NO_TERMINAL_GRAPHIFY_EXECUTION_MATCHES_ADMITTED_SNAPSHOT',
    receiptPath: ownerReceipt.path,
  },
  independentLaneFindings: readIndependentLaneFindings(),
  workspaceRevisionPolicy: admittedRevision
    ? 'TOURNAMENT_CONTROL_PLANE_ADMITTED_CANONICAL_OWNER_PENDING'
    : 'UNBOUND_UNTIL_TOURNAMENT',
  counts,
  violations: gates[0].violations,
  gates,
  firstBlockingGate: ownerProven ? gates[1].id : gates[0].id,
  firstBlockingInvariant,
  nextGate,
  safeNextCommand: ownerProven
    ? 'npx tsx scripts/atlas/audit-current-structural-lineage-v1.mjs'
    : 'npx tsx scripts/atlas/audit-current-graphify-run-owner-v1.mjs',
  reportPath: 'docs/reports/parent-atlas-promotion-gates-v1.json',
  evidence: Object.fromEntries(Object.entries(reportFiles).map(([key, relative]) => [key, readJson(relative)])),
  checksum: `sha256:${crypto.createHash('sha256').update(canonicalPayload).digest('hex')}`,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
const reportTempPath = `${REPORT_PATH}.${process.pid}.tmp`;
fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
try {
  fs.renameSync(reportTempPath, REPORT_PATH);
} catch (error) {
  try { fs.rmSync(reportTempPath, { force: true }); } catch {}
  console.error(`PROMOTION_GATE_REPORT_WRITE_BLOCKED:${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
console.log(JSON.stringify({
  status: report.status,
  firstBlockingGate: report.firstBlockingGate,
  firstBlockingInvariant: report.firstBlockingInvariant,
  nextGate: report.nextGate,
  workspaceRevision,
  writesPerformed: false,
  reportPath: report.reportPath,
}, null, 2));
