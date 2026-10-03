import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyOpenSpecEvidenceRunManifestV1 } from './compile-openspec-evidence-run-manifest-v1.mjs';

const ROOT = process.cwd();
const reportsRoot = path.join(ROOT, 'docs', 'reports');
const outputPath = process.env.OPENSPEC_EVIDENCE_HEALTH_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_HEALTH_OUTPUT)
  : path.join(reportsRoot, 'openspec-evidence-health-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstNumber(source, ...keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function summary(source) {
  return source?.summary && typeof source.summary === 'object' ? source.summary : {};
}

function stage(id, report, fallbackStatus = 'REPORT_MISSING') {
  return {
    id,
    status: report?.status ?? (report ? 'REPORT_PRESENT' : fallbackStatus),
    writesPerformed: report?.writesPerformed === true,
    report: report ? relative(report.__path) : null,
  };
}

function loadReport(filePath) {
  const report = readJson(filePath);
  if (!report) return null;
  return { ...report, __path: filePath };
}

function main() {
  if (!process.env.OPENSPEC_EVIDENCE_MANIFEST_PATH) throw new Error('FINAL_RUN_MANIFEST_REQUIRED');
  const { manifest, summary: finalSummary, manifestPath } = verifyOpenSpecEvidenceRunManifestV1(process.env.OPENSPEC_EVIDENCE_MANIFEST_PATH);
  const censusPath = path.resolve(ROOT, manifest.stages.census.path);
  const census = readJson(censusPath);
  if (!census) throw new Error(`Census report is unreadable: ${censusPath}`);

  const censusSummary = summary(census);
  const binding = loadReport(path.resolve(ROOT, manifest.stages.receiptBinding.path));
  const predicates = loadReport(path.resolve(ROOT, manifest.stages.predicateResolution.path));
  const graph = loadReport(path.join(reportsRoot, 'openspec-dependency-graph-v1.json'));
  const migration = loadReport(path.join(reportsRoot, 'openspec-evidence-migration-dry-run-v1.json'));
  const readback = loadReport(path.join(reportsRoot, 'openspec-evidence-ledger-readback-v1.json'));
  const embedding = loadReport(path.join(reportsRoot, 'openspec-evidence-embedding-plan-v1.json'));
  const retrieval = loadReport(path.join(reportsRoot, 'openspec-evidence-retrieval-plan-v1.json'));
  const hybrid = loadReport(path.join(reportsRoot, 'openspec-evidence-hybrid-rrf-audit-v1.json'));
  const context = loadReport(path.join(reportsRoot, 'openspec-evidence-context-manifest-v1.json'));
  const synthesis = loadReport(path.join(reportsRoot, 'openspec-evidence-synthesis-plan-v1.json'));
  const lowRank = loadReport(path.join(reportsRoot, 'openspec-evidence-low-rank-plan-v1.json'));
  const parity = loadReport(path.join(reportsRoot, 'openspec-evidence-projection-parity-plan-v1.json'));
  const gpuAcceleration = loadReport(path.join(reportsRoot, 'openspec-evidence-gpu-acceleration-plan-v1.json'));
  const turbovecMemory = loadReport(path.join(reportsRoot, 'openspec-evidence-turbovec-memory-plan-v1.json'));
  const workboardReconciliation = loadReport(path.join(reportsRoot, 'openspec-workboard-evidence-reconciliation-v1.json'));
  const mutationPreflight = loadReport(path.join(reportsRoot, 'openspec-controlled-task-mutation-preflight-v1.json'));
  const workboardProjection = loadReport(path.join(reportsRoot, 'openspec-evidence-workboard-projection-v1.json'));
  const identityReconciliation = loadReport(path.join(reportsRoot, 'openspec-task-identity-reconciliation-v1.json'));
  const identityRecovery = loadReport(path.resolve(ROOT, manifest.stages.identityRecovery.path));
  const receiptTypes = loadReport(path.resolve(ROOT, manifest.stages.receiptTyping.path));
  const orphanBindings = loadReport(path.resolve(ROOT, manifest.stages.receiptBinding.path));
  const compactSummary = loadReport(path.resolve(ROOT, manifest.finalSummary.path));

  const predicateSummary = summary(predicates);
  const identityMappings = identityRecovery?.mappings ?? [];
  const graphSummary = summary(graph);
  const receiptSummary = summary(binding);
  const reconciliationBaseline = record(workboardReconciliation?.baseline);
  const reconciliationDiff = record(workboardReconciliation?.diff);
  const source = census.source ?? {};
  const unsigned = {
    schema: 'atlas.openspec-evidence-health.v1',
    mode: 'READ_ONLY_STUDIO_PROJECTION',
    status: 'FINAL_RUN_AUTHORITY_VERIFIED_READ_ONLY',
    promotionEligible: census.promotionEligible === true,
    source: {
      census: relative(censusPath),
      manifest: relative(manifestPath),
      finalSummary: relative(path.resolve(ROOT, manifest.finalSummary.path)),
      runId: manifest.runId,
      workspaceRevision: source.workspaceRevision ?? null,
      generatedAt: census.generatedAt ?? null,
      canonicalAuthority: 'scripts/atlas/compile-openspec-evidence-run-manifest-v1.mjs',
    },
    claims: {
      changes: firstNumber(finalSummary.counts, 'changes'),
      activeChanges: firstNumber(censusSummary, 'activeChanges'),
      archivedChanges: firstNumber(censusSummary, 'archivedChanges'),
      tasks: firstNumber(finalSummary.counts, 'tasks'),
      checked: firstNumber(finalSummary.counts, 'checkedClaims'),
      unchecked: firstNumber(censusSummary, 'uncheckedTasks'),
      checkedWithEvidence: firstNumber(finalSummary.counts, 'checkedClaimsProven'),
      checkedWithoutEvidence: Math.max(0, firstNumber(finalSummary.counts, 'checkedClaims') - firstNumber(finalSummary.counts, 'checkedClaimsProven')),
      uncheckedButProven: firstNumber(finalSummary.counts, 'uncheckedTasksProven'),
    },
    identity: {
      taskIdMissing: identityMappings.filter((mapping) => !mapping.declaredId).length,
      duplicateTaskIds: firstNumber(identityRecovery?.summary, 'duplicateDiagnosticGroupCount'),
      explicitTaskIds: identityMappings.filter((mapping) => Boolean(mapping.declaredId)).length,
      derivedTaskIds: firstNumber(identityRecovery?.summary?.identityStateCounts, 'DERIVED_STABLE_KEY'),
      ambiguousTaskIdentities: firstNumber(finalSummary.counts, 'ambiguousIdentities'),
      recoveredLegacyIds: firstNumber(identityRecovery?.summary?.identityStateCounts, 'LEGACY_ID_RECOVERED'),
      identityCollisions: firstNumber(identityRecovery?.summary, 'canonicalKeyCollisionGroupCount'),
      collisionClasses: identityRecovery?.summary?.collisionClassCounts ?? {},
    },
    receipts: {
      total: firstNumber(finalSummary.counts, 'receiptCandidates'),
      bound: firstNumber(finalSummary.counts, 'exactBound') + firstNumber(finalSummary.counts, 'legacyBound'),
      orphan: firstNumber(finalSummary.counts, 'trueOrphan') + firstNumber(finalSummary.counts, 'missingTask'),
      ambiguous: firstNumber(finalSummary.counts, 'ambiguous'),
      staleOrMissingRevision: firstNumber(finalSummary.counts, 'missingOrStaleRevision'),
      checksumFailures: firstNumber(censusSummary, 'checksum_failed_receipts'),
      typed: firstNumber(finalSummary.counts, 'typedReceipts'),
      candidateTyped: firstNumber(finalSummary.counts, 'candidateTypedReceipts'),
      recoveredLegacyBindings: firstNumber(orphanBindings?.summary, 'legacyBoundCount'),
      orphanResolutionMissingTask: firstNumber(orphanBindings?.summary, 'missingTaskCount'),
      bindingReasons: orphanBindings?.summary?.bindingReasonCounts ?? {},
      unknownReceiptTypes: firstNumber(receiptTypes?.summary, 'unknownCount'),
    },
    proof: {
      states: finalSummary.counts.proofStateCounts ?? {},
      contradictionTasks: firstNumber(predicateSummary, 'contradictionTaskCount'),
      blockedTasks: firstNumber(predicateSummary, 'blockedTaskCount'),
      heuristicPromotionCount: firstNumber(predicateSummary, 'heuristicPromotionCount'),
      predicateCount: firstNumber(predicateSummary, 'predicateCount'),
    },
    graph: {
      nodes: firstNumber(graphSummary, 'nodeCount'),
      edges: firstNumber(graphSummary, 'edgeCount'),
      unresolvedEdges: firstNumber(graphSummary, 'unresolvedEdgeCount'),
      cycles: firstNumber(graphSummary, 'cycleCount'),
      aliasGroups: firstNumber(graphSummary, 'aliasGroupCount'),
      supersessionCandidates: firstNumber(graphSummary, 'supersessionCandidateCount'),
    },
    workboard: {
      status: workboardReconciliation?.status ?? 'REPORT_MISSING',
      boardTaskCount: firstNumber(reconciliationBaseline, 'workboardTaskCount'),
      evidenceCardCount: firstNumber(reconciliationBaseline, 'evidenceCardCount'),
      exactSourceRefJoinCount: firstNumber(reconciliationDiff, 'exactSourceRefJoinCount'),
      boardOnlyCount: firstNumber(reconciliationDiff, 'boardOnlyCount'),
      evidenceOnlyCount: firstNumber(reconciliationDiff, 'evidenceOnlyCount'),
      doneWithoutProvenCount: firstNumber(reconciliationDiff, 'doneWithoutProvenCount'),
      openWithProvenCount: firstNumber(reconciliationDiff, 'openWithProvenCount'),
    },
    stages: [
      stage('EVF-02_IDENTITY', graph, graph ? 'GRAPH_REPORT_PRESENT' : undefined),
      stage('EVF-02_IDENTITY_RECONCILIATION', identityReconciliation),
      stage('EVF-03A_IDENTITY_RECOVERY', identityRecovery),
      stage('EVF-03B_RECEIPT_TYPING', receiptTypes),
      stage('EVF-03C_ORPHAN_BINDING', orphanBindings),
      stage('EVF-03C_COMPACT_SUMMARY', compactSummary),
      stage('EVF-03_RECEIPT_BINDING', binding),
      stage('EVF-04_PREDICATE_RESOLUTION', predicates),
      stage('EVF-06_POSTGRES_LEDGER', readback ?? migration),
      stage('EVF-08_EMBEDDING', embedding),
      stage('EVF-09_RETRIEVAL', retrieval),
      stage('EVF-10_HYBRID_RRF', hybrid),
      stage('EVF-11_CONTEXT', context),
      stage('EVF-12_SYNTHESIS', synthesis),
      stage('EVF-13_LOW_RANK', lowRank),
      stage('EVF-16_PROJECTION_PARITY', parity),
      stage('EVF-17_GPU_GRAPH_ACCELERATION', gpuAcceleration),
      stage('EVF-18_TURBOVEC_MEMORY', turbovecMemory),
      stage('EVF-19_WORKBOARD_RECONCILIATION', workboardReconciliation),
      stage('EVF-19_WORKBOARD_PROJECTION', workboardProjection),
      stage('EVF-20_CONTROLLED_MUTATION', mutationPreflight),
    ],
    contracts: {
      canonicalVector: 'semantic_768',
      vectorDimension: 768,
      writesPerformed: false,
      taskMutationAllowed: false,
      projectionMutationAllowed: false,
      authoritativeSurface: 'tasks.md claims + revision-bound receipts',
    },
    likely_cause: 'Evidence health must be displayed from a bounded projection because the authoritative census contains the full task corpus and is too large for request-time UI reads.',
    evidence: [relative(censusPath), relative(path.join(reportsRoot, 'openspec-task-evidence-bindings-v1.json')), relative(path.join(reportsRoot, 'openspec-evidence-summary-v1.json'))],
    patch_targets: ['scripts/atlas/compile-openspec-evidence-health-v1.mjs'],
    safe_next_command: 'node scripts/atlas/compile-openspec-evidence-health-v1.mjs',
    smoke_command: 'node --check scripts/atlas/compile-openspec-evidence-health-v1.mjs',
    report_path: relative(outputPath),
  };
  const report = { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, workspaceRevision: report.source.workspaceRevision, output: outputPath }, null, 2));
}

main();
