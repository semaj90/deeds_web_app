/**
 * Read-only implementation-order audit for the OpenSpec workboard.
 *
 * This classifies work into executable contracts, authority-gated lineage,
 * guarded semantic snapshots, fixture-only executor proofs, and promotion.
 * It does not query or mutate PostgreSQL, Qdrant, Valkey, Graphify, or GPU
 * state. The only output is a local planning receipt.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportDir = process.env.ATLAS_OPENSPEC_REPORTS_DIR
  ? path.resolve(root, process.env.ATLAS_OPENSPEC_REPORTS_DIR)
  : path.join(root, 'docs/reports');
const reportPath = path.join(reportDir, 'openspec-implementation-order-v1.json');

function readJson(relativePath, fallback = {}) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    return fallback;
  }
}

const workboard = readJson('docs/reports/openspec-workboard-v1.json');
const sourceOwner = readJson('docs/reports/current-source-owner-reconciliation-v1.json');
const sourceRepair = readJson('docs/reports/current-source-authority-repair-plan-v1.json');
const sourceAlignment = readJson('docs/reports/source-selection-authority-alignment-v1.json');
const lineage = readJson('docs/reports/current-lineage-closure-v1.json');
const freeze = readJson('docs/reports/candidate-population-freeze-v1.json');
const semanticSnapshot = readJson('docs/reports/current-semantic-candidate-snapshot-v1.json');
const executionController = readJson('docs/reports/openspec-execution-controller-v1.json');

const report = {
  schema: 'atlas.openspec-implementation-order.v1',
  generatedAt: new Date().toISOString(),
  source: {
    workboard: 'docs/reports/openspec-workboard-v1.json',
    workboardMarkdown: 'docs/OPENSPEC-WORKBOARD.md',
    totalTasks: Number(workboard.summary?.totalTasks ?? workboard.totalTasks ?? 0),
    openTasks: Number(workboard.summary?.openTasks ?? workboard.openTasks ?? 0),
    actionableTasks: Number(workboard.summary?.actionableTasks ?? 0),
    waitingTasks: Number(workboard.summary?.waitingTasks ?? 0),
    supersededTasks: Number(workboard.summary?.supersededTasks ?? 0),
    controllerActionableTasks: Number(executionController.summary?.actionable ?? 0),
    controllerWaitingTasks: Number(executionController.summary?.waiting ?? 0),
    controllerDeferredTasks: Number(executionController.summary?.deferred ?? 0),
    controllerNonProvenTasks: Number(executionController.summary?.actionable ?? 0)
      + Number(executionController.summary?.waiting ?? 0)
      + Number(executionController.summary?.deferred ?? 0),
    rawLedgerOpenTaskDelta: Number(workboard.summary?.openTasks ?? workboard.openTasks ?? 0)
      - (Number(executionController.summary?.actionable ?? 0)
        + Number(executionController.summary?.waiting ?? 0)
        + Number(executionController.summary?.deferred ?? 0)),
    rawLedgerRole: 'CENSUS_ONLY',
    controllerRole: 'SELECTION_AUTHORITY',
    writesPerformed: false,
  },
  decision: 'ORGANIZE_PARALLEL_IMPLEMENTATION_WITH_AUTHORITY_GATES',
  principle: 'Task counts are navigation data. Promotion requires the specific receipt and authority contract for that task.',
  executionController: {
    status: executionController.completionEnvelopes?.[0]?.state ?? 'UNAVAILABLE',
    goalId: executionController.completionEnvelopes?.[0]?.goalId ?? null,
    retryPolicy: executionController.retryPolicy ?? null,
    blockerGroups: executionController.blockerGroups ?? [],
    dependencyGraph: executionController.dependencyGraph ?? { status: 'UNAVAILABLE' },
    writesPerformed: false,
  },
  lanes: [
    {
      id: 'P10-CONTRACTS',
      status: 'PROVEN_OR_FIXTURE_PROVEN',
      canProceedNow: true,
      tasks: [
        'parent-atlas-prefill-routing-residency-convergence:FEAT-01',
        'parent-atlas-prefill-routing-residency-convergence:DAG-08',
        'parent-atlas-prefill-routing-residency-convergence:DAG-11',
        'parent-atlas-prefill-routing-residency-convergence:TRT-19',
        'parent-atlas-prefill-routing-residency-convergence:MODEL-01',
        'parent-atlas-prefill-routing-residency-convergence:TRAIN-04',
      ],
      nextAction: 'Keep the existing owners and receipts stable; add only focused replay tests or contract documentation.',
    },
    {
      id: 'P10-SOURCE-AUTHORITY',
      status: sourceOwner.ownerDecision === 'LEGACY_ONLY_NO_CURRENT_OWNER'
        ? 'BLOCKED_BY_EXTERNAL_AUTHORITY_DECISION'
        : 'REVIEW_REQUIRED',
      canProceedNow: false,
      tasks: ['CURRENT-SOURCE-COHORT-OWNER-01', 'PROMOTION-01', 'PKT-LINEAGE-08'],
      evidence: {
        ownerDecision: sourceOwner.ownerDecision ?? null,
        exactCurrentOwners: Number(sourceOwner.exactCurrentOwners ?? 0),
        currentExecutionCandidates: Number(sourceOwner.currentExecutionCandidates ?? 0),
        sourceSelectionSharedRefs: Number(sourceAlignment.comparison?.sharedRefs ?? 0),
        contentSourceRevisionMismatches: Number(sourceRepair.counts?.CURRENT_BINDING_MISMATCH ?? 0),
        unavailableSources: Number(sourceRepair.counts?.SOURCE_UNAVAILABLE ?? 0),
        authorizationRequired: sourceRepair.authorizationRequired === true,
      },
      nextAction: 'Obtain an explicit source/workspace admission decision or an authorized immutable snapshot capture. Do not repair or relabel rows from this report.',
    },
    {
      id: 'P10-SEMANTIC-SNAPSHOT',
      status: semanticSnapshot.status === 'BLOCKED_CURRENT_LINEAGE'
        ? 'CONTRACT_READY_LIVE_EXPORT_BLOCKED'
        : 'REVIEW_REQUIRED',
      canProceedNow: true,
      tasks: ['parent-atlas-prefill-routing-residency-convergence:ANN-03', 'Freeze shared candidate population and CandidateOrdinalMapV1'],
      evidence: {
        candidateOrdinalEligibleRows: Number(semanticSnapshot.candidateOrdinalEligibleRows ?? lineage.promotionFunnel?.candidateOrdinalEligibleRows ?? 0),
        historicalCandidateRows: Number(semanticSnapshot.candidateMapRowCount ?? 0),
        liveExportStatus: semanticSnapshot.status ?? null,
        canonicalAuthority: semanticSnapshot.canonicalAuthority === true,
        writesPerformed: semanticSnapshot.writesPerformed === true,
      },
      nextAction: 'Maintain the guarded export and identity-manifest contract; do not reuse a historical ordinal map as a live cohort.',
    },
    {
      id: 'P10-EXECUTOR-PROOFS',
      status: freeze.status === 'CANDIDATE_POPULATION_FREEZE_BLOCKED' ? 'FIXTURE_AND_READ_ONLY_ONLY' : 'REVIEW_REQUIRED',
      canProceedNow: true,
      tasks: ['Exact KNN population proof', 'KMeans centroid membership proof', 'SOM 20x20 derived-coordinate receipt', 'Qdrant/cuVS identity parity replay'],
      entryGate: 'CandidatePopulationFreezeV1 with lineageQualified=true and downstreamAllowed=true',
      nextAction: 'Improve fixture replay and receipt validation only; production execution remains disabled until the entry gate passes.',
    },
    {
      id: 'P10-PROMOTION',
      status: 'CLOSED_UNTIL_AUTHORITY_AND_AUTHORIZATION',
      canProceedNow: false,
      tasks: ['PROMOTION-01', 'PROMOTION-02', 'Qdrant projection promotion', 'Valkey/BitFrost canonical promotion'],
      entryGate: 'Independent lineage, representation, projection, migration, explicit target-list, rollback, readback, and human-authorization receipts',
      nextAction: 'Do not apply. Re-evaluate only after the source-authority lane produces a current qualified cohort.',
    },
  ],
  implementationOrder: [
    '1. Preserve and test the proven contract lanes.',
    '2. Resolve or explicitly re-admit the source/workspace/execution authority.',
    '3. Materialize one current semantic snapshot bound to CandidateOrdinalMapV1.',
    '4. Freeze the candidate population and exact KNN parameters.',
    '5. Prove Qdrant/cuVS identity and exact parity from the same matrix.',
    '6. Run KMeans and explicit SOM 20x20 as derived features only.',
    '7. Reassess PROMOTION-01/02 with independent readback and authorization.',
  ],
  safety: {
    databaseWrites: false,
    packetBackfill: false,
    qdrantWrites: false,
    valkeyWrites: false,
    graphifyRefresh: false,
    gpuMutation: false,
    canonicalAuthority: false,
  },
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  status: 'IMPLEMENTATION_ORDER_AUDITED',
  totalTasks: report.source.totalTasks,
  openTasks: report.source.openTasks,
  sourceAuthority: report.lanes.find((lane) => lane.id === 'P10-SOURCE-AUTHORITY')?.status,
  semanticSnapshot: report.lanes.find((lane) => lane.id === 'P10-SEMANTIC-SNAPSHOT')?.status,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
  writesPerformed: false,
}, null, 2));
