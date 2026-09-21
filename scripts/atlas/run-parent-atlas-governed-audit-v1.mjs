/**
 * Reproducible read-only Parent Atlas control-plane audit.
 *
 * The order is intentional: refresh task authority first, then derived
 * awareness/readiness, then repair/tournament owner audits. This runner does
 * not become an authority and does not mutate tasks or runtime stores.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertResourceHeadroom } from './lib/resource-headroom.mjs';

const root = process.cwd();
const reportsDir = path.join(root, 'docs/reports');
const reportPath = path.join(reportsDir, 'parent-atlas-governed-audit-v1.json');
try {
  assertResourceHeadroom(root, process.env);
} catch (error) {
  const details = error?.details ?? {};
  console.error(JSON.stringify({
    schema: 'atlas.governed-audit-resource-preflight.v1',
    status: error?.message ?? 'REFUSED_INSUFFICIENT_RESOURCE_HEADROOM',
    freeDiskGiB: details.freeDiskBytes === null || details.freeDiskBytes === undefined ? null : Number((details.freeDiskBytes / 1024 ** 3).toFixed(2)),
    minimumFreeDiskGiB: details.minimumFreeDiskBytes === undefined ? null : Number((details.minimumFreeDiskBytes / 1024 ** 3).toFixed(2)),
    freeMemoryGiB: details.freeMemoryBytes === undefined ? null : Number((details.freeMemoryBytes / 1024 ** 3).toFixed(2)),
    minimumFreeMemoryGiB: details.minimumFreeMemoryBytes === undefined ? null : Number((details.minimumFreeMemoryBytes / 1024 ** 3).toFixed(2)),
    writesPerformed: false,
    nextGate: 'RESTORE_AUDIT_RESOURCE_HEADROOM',
  }, null, 2));
  process.exit(2);
}

const steps = [
  {
    id: 'SOURCE_OWNER_RECONCILIATION',
    command: process.execPath,
    args: ['scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs'],
    reports: ['current-source-owner-reconciliation-v1.json'],
  },
  {
    id: 'SOURCE_AUTHORITY_REPAIR_PLAN',
    command: process.execPath,
    args: ['node_modules/tsx/dist/cli.mjs', 'scripts/atlas/plan-current-source-authority-repair-v1.mts'],
    reports: ['current-source-authority-repair-plan-v1.json'],
  },
  {
    id: 'SOURCE_COHORT_LINEAGE',
    command: process.execPath,
    args: ['scripts/atlas/audit-current-source-cohort-lineage-v1.mjs'],
    reports: ['current-source-cohort-lineage-v1.json'],
  },
  {
    id: 'WORKSPACE_FRAME_ADMISSION',
    command: process.execPath,
    args: ['scripts/atlas/audit-current-workspace-frame-admission-v1.mjs'],
    reports: ['current-workspace-frame-admission-v1.json'],
  },
  {
    id: 'LINEAGE_CLOSURE',
    command: process.execPath,
    args: ['scripts/atlas/audit-current-lineage-closure-v1.mjs'],
    reports: ['current-lineage-closure-v1.json', 'parent-atlas-current-lineage-funnel-v1.json'],
  },
  {
    id: 'AST_HASH_COLUMN_CONTRACT',
    command: process.execPath,
    args: ['scripts/atlas/audit-ast-hash-column-contract-v1.mjs'],
    reports: ['ast-hash-column-contract-v1.json'],
  },
  {
    id: 'AST_HASH_GRAIN_CLASSIFICATION',
    command: process.execPath,
    args: ['scripts/atlas/audit-ast-hash-grain-classification-v1.mjs'],
    reports: ['ast-hash-grain-classification-v1.json'],
  },
  {
    id: 'AST_OFFSET_BASIS_PROOF',
    command: process.execPath,
    args: ['scripts/atlas/prove-ast-offset-basis-v1.mjs'],
    reports: ['ast-offset-basis-proof-v1.json'],
  },
  {
    id: 'AST_DIGEST_DIVERGENCE',
    command: process.execPath,
    args: ['scripts/atlas/audit-ast-digest-divergence-v1.mjs'],
    reports: ['ast-digest-divergence-v1.json'],
  },
  {
    id: 'AST_CONFLICT_DISPOSITION',
    command: process.execPath,
    args: ['scripts/atlas/audit-ast-conflict-disposition-v1.mjs'],
    reports: ['ast-conflict-disposition-v1.json'],
  },
  {
    id: 'AST_CANARY_READINESS',
    command: process.execPath,
    args: ['scripts/atlas/audit-ast-canary-readiness-v1.mjs'],
    reports: ['ast-canary-readiness-v1.json'],
  },
  {
    id: 'STRUCTURAL_PROVENANCE_RUNTIME',
    command: process.execPath,
    args: ['scripts/atlas/prove-structural-intelligence-integration.mjs'],
    env: { ...process.env, ATLAS_PROVE_LIVE_SIDECAR: '1' },
    reports: ['structural-intelligence-integration-proof.json'],
  },
  {
    id: 'ONTOLOGY_POPULATION_DECISION',
    command: process.execPath,
    args: ['scripts/atlas/audit-ontology-population-decision-v1.mjs'],
    reports: ['ontology-population-decision-v1.json'],
  },
  {
    id: 'PACKET_SOURCE_SCOPE',
    command: process.execPath,
    args: ['scripts/atlas/audit-packet-source-scope-v1.mjs'],
    reports: ['packet-source-scope-v1.json'],
  },
  {
    id: 'EXECUTION_CONTROLLER',
    command: process.execPath,
    args: ['scripts/atlas/run-openspec-execution-controller-atomic-v1.mjs'],
    reports: ['openspec-execution-controller-v1.json', 'openspec-waiting-dependencies-v1.json'],
  },
  {
    id: 'AUTHORITY_TEXT_REVIEW',
    command: process.execPath,
    args: ['scripts/atlas/audit-openspec-authority-text-review-v1.mjs'],
    reports: ['openspec-authority-text-review-v1.json'],
  },
  {
    id: 'ACTIONABLE_RANKER',
    command: process.execPath,
    args: ['scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs'],
    reports: ['actionable-workboard-v3.json'],
  },
  {
    id: 'CAPABILITY_CENSUS',
    command: process.execPath,
    args: ['scripts/atlas/audit-parent-atlas-capability-census-v1.mjs', '.', 'docs/reports', 'docs/reports/parent-atlas-capability-census-v1.json'],
    reports: ['parent-atlas-capability-census-v1.json'],
  },
  {
    id: 'AWARENESS_READINESS',
    command: process.execPath,
    args: ['scripts/atlas/run-openspec-awareness-audit-v1.mjs', '.', 'docs/reports'],
    reports: ['staging/openspec-progress-audit-v2.json', 'staging/atlas-runtime-readiness-v1.json'],
  },
  {
    id: 'TOURNAMENT_OWNER',
    command: process.execPath,
    args: ['scripts/atlas/audit-patch-tournament-owner-v1.mjs'],
    reports: ['patch-tournament-owner-audit-v1.json'],
  },
  {
    id: 'TOURNAMENT_SEAM',
    command: process.execPath,
    args: ['scripts/atlas/plan-patch-tournament-worktree-seam-v1.mjs'],
    reports: ['patch-tournament-worktree-seam-v1.json'],
  },
  {
    id: 'RECEIPT_OWNER',
    command: process.execPath,
    args: ['scripts/atlas/audit-agentic-receipt-owner-v1.mjs'],
    reports: ['agentic-receipt-owner-audit-v1.json'],
  },
  {
    id: 'RECEIPT_SCHEMA',
    command: process.execPath,
    args: ['scripts/atlas/audit-agentic-receipt-live-schema-v1.mjs'],
    reports: ['agentic-receipt-live-schema-v1.json'],
  },
];

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'docs/reports', relativePath), 'utf8'));
  } catch {
    return null;
  }
}

function stepSummary(step, result) {
  const reportAvailability = Object.fromEntries(step.reports.map((relativePath) => [
    relativePath,
    Boolean(readJson(relativePath)),
  ]));
  return {
    id: step.id,
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    passed: result.status === 0,
    reportAvailability,
    writesPerformed: false,
  };
}

const stepResults = [];
for (const step of steps) {
  const result = spawnSync(step.command, step.args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: step.env ?? process.env,
  });
  stepResults.push(stepSummary(step, result));
  if (result.error) {
    stepResults[stepResults.length - 1].error = String(result.error.message ?? result.error);
  }
}

const controller = readJson('openspec-execution-controller-v1.json') ?? {};
const sourceOwner = readJson('current-source-owner-reconciliation-v1.json') ?? {};
const sourceRepair = readJson('current-source-authority-repair-plan-v1.json') ?? {};
const sourceCohort = readJson('current-source-cohort-lineage-v1.json') ?? {};
const workspaceFrame = readJson('current-workspace-frame-admission-v1.json') ?? {};
const lineageClosure = readJson('current-lineage-closure-v1.json') ?? {};
const astCanary = readJson('ast-canary-readiness-v1.json') ?? {};
const astHashContract = readJson('ast-hash-column-contract-v1.json') ?? {};
const astHashGrain = readJson('ast-hash-grain-classification-v1.json') ?? {};
const astOffsetBasis = readJson('ast-offset-basis-proof-v1.json') ?? {};
const astDigestDivergence = readJson('ast-digest-divergence-v1.json') ?? {};
const astConflictDisposition = readJson('ast-conflict-disposition-v1.json') ?? {};
const structuralProof = readJson('structural-intelligence-integration-proof.json') ?? {};
const ontologyDecision = readJson('ontology-population-decision-v1.json') ?? {};
const packetScope = readJson('packet-source-scope-v1.json') ?? {};
const capability = readJson('parent-atlas-capability-census-v1.json') ?? {};
const readiness = readJson('staging/atlas-runtime-readiness-v1.json') ?? {};
const progress = readJson('staging/openspec-progress-audit-v2.json') ?? {};
const authorityReview = readJson('openspec-authority-text-review-v1.json') ?? {};
const actionableRanker = readJson('actionable-workboard-v3.json') ?? {};
const receiptSchema = readJson('agentic-receipt-live-schema-v1.json') ?? {};
const actionableTasks = Array.isArray(actionableRanker.tasks) ? actionableRanker.tasks : [];
const laneCounts = actionableTasks.reduce((counts, task) => {
  const lane = typeof task?.lane === 'string' && task.lane.length > 0 ? task.lane : 'GENERAL';
  counts[lane] = (counts[lane] ?? 0) + 1;
  return counts;
}, {});

const report = {
  schema: 'atlas.parent-atlas-governed-audit.v1',
  generatedAt: new Date().toISOString(),
  status: stepResults.every((step) => step.passed) ? 'COMPLETE_READ_ONLY_AUDIT' : 'PARTIAL_READ_ONLY_AUDIT',
  order: steps.map((step) => step.id),
  steps: stepResults,
  controller: {
    summary: controller.summary ?? null,
    blockerGroups: controller.blockerGroups ?? [],
  },
  sourceOwner: {
    status: sourceOwner.admission?.status ?? 'UNPROVEN',
    ownerDecision: sourceOwner.ownerDecision ?? null,
    reasons: sourceOwner.admission?.reasons ?? [],
    selectedExecutionId: sourceOwner.sourceAuthority?.ownerSelection?.requestedExecutionId ?? null,
    workspaceRevision: sourceOwner.sourceAuthority?.sourceSnapshot?.workspaceRevision ?? null,
    writesPerformed: false,
  },
  sourceAuthorityChain: {
    repairPlan: {
      status: sourceRepair.status ?? 'UNPROVEN',
      counts: sourceRepair.counts ?? null,
      exactCurrentBindingCount: sourceRepair.exactCurrentBindingCount ?? null,
      currentWorkspaceRevision: sourceRepair.currentWorkspaceRevision ?? null,
      authorizationRequired: sourceRepair.authorizationRequired !== false,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    cohort: {
      status: sourceCohort.status ?? 'UNPROVEN',
      nextGate: sourceCohort.nextGate ?? null,
      counts: sourceCohort.counts ?? null,
      sourceAuthority: sourceCohort.sourceAuthority ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    workspaceFrame: {
      status: workspaceFrame.status ?? 'UNPROVEN',
      nextGate: workspaceFrame.nextGate ?? null,
      admittedWorkspaceRevision: workspaceFrame.admittedWorkspaceRevision ?? null,
      sourceAuthority: workspaceFrame.sourceAuthority ?? null,
      canonicalAuthority: false,
      promotionEligible: false,
      writesPerformed: false,
    },
    closure: {
      status: lineageClosure.status ?? 'UNPROVEN',
      firstFailureBoundary: lineageClosure.firstFailureBoundary ?? null,
      counts: lineageClosure.promotionFunnel
        ?? lineageClosure.funnel
        ?? lineageClosure.counts
        ?? null,
      supportingCounts: lineageClosure.supportingCounts ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
  },
  lineageSubgates: {
    astCanary: {
      status: astCanary.status ?? 'UNPROVEN',
      blockers: astCanary.blockers ?? [],
      nextGate: astCanary.nextGate ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    astHashContract: {
      status: astHashContract.status ?? 'UNPROVEN',
      counts: astHashContract.counts ?? null,
      nextGate: astHashContract.nextGate ?? null,
      contract: astHashContract.contract ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    astOffsetBasis: {
      status: astOffsetBasis.status ?? 'UNPROVEN',
      candidateRows: astOffsetBasis.candidateRows ?? null,
      bomFiles: astOffsetBasis.bomFiles ?? null,
      shiftedRoundTrip: astOffsetBasis.shiftedRoundTrip ?? null,
      unshiftedWouldDiffer: astOffsetBasis.unshiftedWouldDiffer ?? null,
      nextGate: astOffsetBasis.status === 'BOM_OFFSET_BASIS_PROVEN'
        ? 'DIGEST_DIVERGENCE_AND_STRUCTURAL_CONFLICT_REVIEW'
        : 'BOM_OFFSET_BASIS_REVIEW_REQUIRED',
      canonicalAuthority: false,
      writesPerformed: false,
    },
    astHashGrain: {
      status: astHashGrain.status ?? 'UNPROVEN',
      counts: astHashGrain.counts ?? null,
      nextGate: astHashGrain.nextGate ?? 'REVIEW_UNKNOWN_HASH_GRAIN_BEFORE_SUPERSESSION',
      policy: astHashGrain.policy ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    astDigestDivergence: {
      status: astDigestDivergence.sourceCount === 0
        ? 'NO_DIGEST_DIVERGENCE'
        : 'DIGEST_DIVERGENCE_REVIEW_REQUIRED',
      sourceCount: astDigestDivergence.sourceCount ?? 0,
      byClassification: astDigestDivergence.byClassification ?? {},
      checksum: astDigestDivergence.checksum ?? null,
      nextGate: astDigestDivergence.sourceCount > 0
        ? 'EXCLUDE_DIVERGED_SOURCES_FROM_CANARY'
        : null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    astConflictDisposition: {
      status: astConflictDisposition.status ?? 'UNPROVEN',
      conflictCount: astConflictDisposition.input?.conflictCount ?? null,
      byClass: astConflictDisposition.input?.byClass ?? {},
      supersessionProposalsAllowed: astConflictDisposition.input?.supersessionProposalsAllowed ?? null,
      nextGate: astConflictDisposition.disposition ?? 'REVIEW_REQUIRED',
      canonicalAuthority: false,
      writesPerformed: false,
    },
    structuralProvenance: {
      status: structuralProof.status ?? 'UNPROVEN',
      live8095: structuralProof.status === 'PROVEN_WITH_LIVE_8095',
      canonicalAuthority: false,
      writesPerformed: false,
    },
    ontology: {
      status: ontologyDecision.status ?? 'UNPROVEN',
      ontologyConceptRows: ontologyDecision.readback?.ontologyConceptRows ?? 0,
      ontologyRelationRows: ontologyDecision.readback?.ontologyRelationRows ?? 0,
      unresolvedTuples: ontologyDecision.readback?.unresolvedTupleRows ?? null,
      nextGate: ontologyDecision.nextGate ?? null,
      canonicalAuthority: false,
      writesPerformed: false,
    },
    packetScope: {
      status: packetScope.status ?? 'UNPROVEN',
      folderCount: Array.isArray(packetScope.rows) ? packetScope.rows.length : 0,
      packetRows: packetScope.totals?.packetRows ?? 0,
      exactAdmittedBindingMatches: packetScope.totals?.exactAdmittedBindingMatches ?? 0,
      operatorDispositionRequired: packetScope.policy?.operatorDispositionRequired ?? false,
      noAutomaticFolderPromotion: packetScope.policy?.noAutomaticFolderPromotion ?? true,
      canonicalAuthority: false,
      writesPerformed: false,
    },
  },
  capability: {
    summary: capability.summary ?? null,
    semanticChecksum: capability.semanticChecksum ?? null,
  },
  awareness: {
    progress: progress.summary ?? null,
    readiness: readiness.summary ?? null,
  },
  selection: {
    actionableTasks: actionableTasks.length,
    selectionEligible: actionableTasks
      .filter((task) => task.selectionEligible === true).length,
    selectionReviewRequired: actionableTasks
      .filter((task) => task.selectionDisposition === 'REVIEW_BEFORE_SELECTION').length,
    laneCounts,
    authorityReview: authorityReview.summary ?? null,
    writesPerformed: false,
  },
  receiptSchema: {
    status: receiptSchema.status ?? 'UNPROVEN',
    missingColumns: receiptSchema.missingColumns ?? [],
    receiptIdUniqueIndex: receiptSchema.receiptIdUniqueIndex ?? null,
    rowCount: receiptSchema.rowCount ?? null,
    readbackStatus: 'DEFERRED_NO_NEW_RECEIPT_WRITTEN',
  },
  authority: {
    canonicalAuthority: false,
    writesPerformed: false,
    taskLedgerMutation: false,
    databaseMutation: false,
    vectorStoreMutation: false,
    cachePromotion: false,
    worktreeCreation: false,
    candidateExecution: false,
    automaticMerge: false,
    training: false,
  },
  nextGates: [
    'CURRENT_SOURCE_AUTHORITY',
    'AST_CANARY_SOURCE_PARITY_AND_CONFLICT_DISPOSITION',
    'ONTOLOGY_CANONICAL_VOCABULARY_AND_SOURCE_AUTHORITY',
    'PACKET_FOLDER_OPERATOR_DISPOSITION',
    'PACKET_MATERIALIZATION',
    'CANDIDATE_POPULATION_FREEZE',
    'AUTHORIZED_ISOLATED_CANDIDATE_EXECUTION',
    'LIVE_POSTGRES_RECEIPT_READBACK',
  ],
  reportPath: 'docs/reports/parent-atlas-governed-audit-v1.json',
};

fs.mkdirSync(reportsDir, { recursive: true });
const temporary = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporary, reportPath);

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  stepsPassed: stepResults.filter((step) => step.passed).length,
  stepsTotal: stepResults.length,
  writesPerformed: false,
  reportPath,
}, null, 2));

process.exitCode = report.status === 'COMPLETE_READ_ONLY_AUDIT' ? 0 : 1;
