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

const root = process.cwd();
const reportsDir = path.join(root, 'docs/reports');
const reportPath = path.join(reportsDir, 'parent-atlas-governed-audit-v1.json');

const steps = [
  {
    id: 'SOURCE_OWNER_RECONCILIATION',
    command: process.execPath,
    args: ['scripts/atlas/audit-current-source-owner-reconciliation-v1.mjs'],
    reports: ['current-source-owner-reconciliation-v1.json'],
  },
  {
    id: 'AST_CANARY_READINESS',
    command: process.execPath,
    args: ['scripts/atlas/audit-ast-canary-readiness-v1.mjs'],
    reports: ['ast-canary-readiness-v1.json'],
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
  });
  stepResults.push(stepSummary(step, result));
  if (result.error) {
    stepResults[stepResults.length - 1].error = String(result.error.message ?? result.error);
  }
}

const controller = readJson('openspec-execution-controller-v1.json') ?? {};
const sourceOwner = readJson('current-source-owner-reconciliation-v1.json') ?? {};
const astCanary = readJson('ast-canary-readiness-v1.json') ?? {};
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
  lineageSubgates: {
    astCanary: {
      status: astCanary.status ?? 'UNPROVEN',
      blockers: astCanary.blockers ?? [],
      nextGate: astCanary.nextGate ?? null,
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
