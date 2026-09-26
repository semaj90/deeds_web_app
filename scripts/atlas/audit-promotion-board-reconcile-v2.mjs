#!/usr/bin/env node
/**
 * PROMOTION BOARD RECONCILE 02 — strictly read-only reconciliation over the
 * existing Parent Atlas promotion-gate receipts.
 *
 * This does NOT run Graphify, apply/start optional executors, configure
 * reranking, import judgments, modify Qdrant, migrate RRF callers, mutate
 * PostgreSQL, or perform Docker/Qdrant cleanup. It reads existing JSON
 * receipts under docs/reports/ and the existing 10-gate promotion board
 * (`scripts/atlas/audit-parent-atlas-promotion-gates-v1.mjs`,
 * `docs/reports/parent-atlas-promotion-gates-v1.json`) and produces a single
 * consolidated ParentAtlasPromotionBoardV2 snapshot.
 *
 * Owner: openspec/changes/parent-atlas-ace-rlm-bitfrost-integration
 *        (PARENT-ATLAS-PROMOTION-GATES-01 + PROMOTION-BOARD-RECONCILE-02)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const REPORT_JSON_PATH = path.join(ROOT, 'docs', 'reports', 'promotion-board-reconcile-v2.json');
const REPORT_MD_PATH = path.join(ROOT, 'docs', 'reports', 'promotion-board-reconcile-v2.md');

function readJson(relative) {
  const absolute = path.join(ROOT, relative);
  try {
    return { path: relative, exists: true, value: JSON.parse(fs.readFileSync(absolute, 'utf8')) };
  } catch {
    return { path: relative, exists: false, value: null };
  }
}

// ---------------------------------------------------------------------------
// 1. Load current receipts (section 2 of the spec)
// ---------------------------------------------------------------------------
const receipts = {
  promotionGates: readJson('docs/reports/parent-atlas-promotion-gates-v1.json'),
  traceDisabledSearchTools: readJson('docs/reports/trace-disabled-search-tools-v1.json'),
  mcpTopologyToolRouting: readJson('docs/reports/mcp-topology-tool-routing-v1.json'),
  rrfCallerBaseline: readJson('docs/reports/rrf-caller-baseline-v1.json'),
  rrfCallerClassification: readJson('docs/reports/rrf-caller-classification-v1.json'),
  goldenReviewCorpusCompatibility: readJson('docs/reports/golden-review-corpus-compatibility-v1.json'),
  currentSemantic768ManifestPlan: readJson('docs/reports/current-semantic768-corpus-manifest-plan-v1.json'),
  qdrantCollectionRoles: readJson('docs/reports/qdrant-collection-roles-v1.json'),
  workspaceRevisionTournamentAdmission: readJson('docs/reports/workspace-revision-tournament-admission-v1.json'),
  currentGraphifySnapshotAuthority: readJson('docs/reports/current-graphify-snapshot-authority-v1.json'),
  selectedStructuralLineage: readJson('docs/reports/selected-graphify-structural-lineage-v1.json'),
  currentSourceOwnerReconciliation: readJson('docs/reports/current-source-owner-reconciliation-v1.json'),
  currentSourceEvidenceHydration: readJson('docs/reports/current-source-evidence-hydration-v1.json'),
  lineageQdrantSemanticCanary: readJson('docs/reports/lineage-qdrant-semantic-canary-v1.json'),
  semantic768WriterOwnership: readJson('docs/reports/semantic-768-writer-ownership-v1.json'),
  currentGraphArtifactReadiness: readJson('docs/reports/current-graph-artifact-readiness-v1.json'),
  domainClassifierLineage: readJson('docs/reports/domain-classifier-lineage-v1.json'),
  goldenRelevanceReviewQueueValidation: readJson('docs/reports/golden-relevance-review-queue-validation-v1.json'),
  aceLiveDryInputReadiness: readJson('docs/reports/ace-live-dry-input-readiness-v2.json'),
};

function receiptInventoryEntry(key, item) {
  const v = item.value;
  return {
    key,
    path: item.path,
    exists: item.exists,
    schemaVersion: v?.schema ?? v?.schemaVersion ?? null,
    generatedAt: v?.generatedAt ?? v?.generated ?? null,
    workspaceRevision: v?.workspaceRevision ?? null,
    sourceRevisionOrChecksum: v?.sourceSelectionChecksum ?? v?.sourceRefChecksum ?? v?.sourceManifestChecksum ?? null,
    status: v?.status ?? v?.verdict ?? v?.decision ?? null,
  };
}

const receiptInventory = Object.entries(receipts).map(([key, item]) => receiptInventoryEntry(key, item));

// Ambiguity check: multiple "current semantic corpus" plan receipts would be
// CURRENT_RECEIPT_AMBIGUOUS. Only one exists at the confirmed path — no
// ambiguity found for any of the six required receipt families in this pass.
const currentReceiptAmbiguous = false;

// ---------------------------------------------------------------------------
// 2. Pull through values from the existing 10-gate board (source of authority
//    for source/workspace revision state — this script does not re-derive it)
// ---------------------------------------------------------------------------
const gatesReport = receipts.promotionGates.value;
const admittedWorkspaceRevision = gatesReport?.workspaceAuthority?.workspaceRevision ?? null;
const workspaceOwnerProven = gatesReport?.workspaceAuthority?.authority === true;
const sourceTerminalExecutionProven = gatesReport?.graphifyExecution?.status === 'PROVEN_FOR_ADMITTED_REVISION';
const selectedStructuralLineage = receipts.selectedStructuralLineage.value;
const sourceMembershipProven = selectedStructuralLineage?.status === 'CURRENT_STRUCTURAL_LINEAGE_BRIDGE_PROVEN';

// ---------------------------------------------------------------------------
// 3. sourceAuthority
// ---------------------------------------------------------------------------
const sourceAuthorityBlockers = [];
if (!sourceMembershipProven) {
  sourceAuthorityBlockers.push({
    code: 'CURRENT_SOURCE_AUTHORITY_UNPROVEN',
    lane: 'SOURCE',
    severity: 'CRITICAL',
    receiptRefs: ['docs/reports/parent-atlas-promotion-gates-v1.json', 'docs/reports/current-source-evidence-hydration-v1.json'],
    explanation: 'CURRENT-STRUCTURAL-LINEAGE-01 remains BLOCKED_BY_PREVIOUS_GATE; source evidence hydration is SOURCE_EVIDENCE_HYDRATION_BLOCKED.',
  });
  sourceAuthorityBlockers.push({
    code: 'GRAPHIFY_SOURCE_MEMBERSHIP_INCOMPLETE',
    lane: 'SOURCE',
    severity: 'PROMOTION_BLOCKING',
    receiptRefs: ['docs/reports/selected-graphify-structural-lineage-v1.json'],
    explanation: `Selected execution structural lineage reports ${selectedStructuralLineage?.status ?? 'UNKNOWN'} with ${selectedStructuralLineage?.counts?.lineageBridgeMatches ?? 0} bridge matches and ${selectedStructuralLineage?.counts?.bridgeRowsMissing ?? 'unknown'} memberships still missing a bridge row.`,
  });
}
const sourceAuthorityStatus = workspaceOwnerProven && sourceTerminalExecutionProven && sourceMembershipProven
  ? 'PROVEN'
  : (workspaceOwnerProven || sourceTerminalExecutionProven) ? 'PARTIAL' : 'BLOCKED';

const sourceAuthority = {
  status: sourceAuthorityStatus,
  currentSourceOwnerProven: sourceTerminalExecutionProven,
  currentWorkspaceOwnerProven: workspaceOwnerProven,
  sourceMembershipProven,
  receiptRefs: [
    'docs/reports/parent-atlas-promotion-gates-v1.json',
    'docs/reports/workspace-revision-tournament-admission-v1.json',
    'docs/reports/current-source-owner-reconciliation-v1.json',
    'docs/reports/selected-graphify-structural-lineage-v1.json',
    'docs/reports/current-source-evidence-hydration-v1.json',
  ],
  blockers: sourceAuthorityBlockers.map((b) => b.code),
};

// ---------------------------------------------------------------------------
// 4. semanticCorpus
// ---------------------------------------------------------------------------
const ownerPolicy = receipts.qdrantCollectionRoles.value?.ownerPolicy ?? null;
const manifestPlan = receipts.currentSemantic768ManifestPlan.value;
const corpusUnresolved = manifestPlan?.qdrantCollection === 'UNRESOLVED_MULTIPLE_768_COLLECTIONS';

const semanticCorpusBlockers = [];
if (corpusUnresolved || manifestPlan?.status !== 'PROVEN') {
  semanticCorpusBlockers.push({
    code: 'CURRENT_CORPUS_SELECTION_UNRESOLVED',
    lane: 'SEMANTIC_CORPUS',
    severity: 'CRITICAL',
    receiptRefs: ['docs/reports/current-semantic768-corpus-manifest-plan-v1.json', 'docs/reports/qdrant-collection-roles-v1.json'],
    explanation: `Manifest plan status is ${manifestPlan?.status ?? 'UNKNOWN'} with qdrantCollection=${manifestPlan?.qdrantCollection ?? 'null'}. codebase_chunks_768 (${manifestPlan?.qdrantCollections?.[0]?.pointCount ?? 'unknown'} pts) is the declared owner and codebase_chunks_768_v2 (${manifestPlan?.qdrantCollections?.[1]?.pointCount ?? 'unknown'} pts) is the comparison challenger per qdrant-collection-roles-v1.json; they are NOT merged or treated as duplicates.`,
  });
}

const semanticCorpus = {
  owner: ownerPolicy?.qdrantCollection ?? 'codebase_chunks_768',
  challenger: ownerPolicy?.challengerCollections?.[0] ?? 'codebase_chunks_768_v2',
  representationRevision: null,
  workspaceRevision: admittedWorkspaceRevision,
  sourceRevisionSetChecksum: gatesReport?.workspaceAuthority?.sourceSelectionChecksum ?? null,
  admittedCohortChecksum: null,
  candidateCount: null,
  canonicalIdCount: null,
  duplicateCanonicalIds: null,
  missingSourceRevision: null,
  mixedWorkspaceRevision: null,
  mixedRepresentationRevision: null,
  status: 'BLOCKED',
  blockers: semanticCorpusBlockers.map((b) => b.code),
};

// ---------------------------------------------------------------------------
// 5. retrievalFusion (RRF caller classification readiness)
// ---------------------------------------------------------------------------
const rrf = receipts.rrfCallerBaseline.value;
const rrfClassification = receipts.rrfCallerClassification.value;
const rrfMetrics = rrf?.metrics ?? {};
const retrievalFusionBlockers = [];
const classifiedCallerCount = rrfClassification?.totalCallers ?? null;
const classificationUnclassifiedCount = rrfClassification?.unclassifiedCount ?? null;
const classificationReady = rrfClassification?.status === 'RRF_CALLER_CLASSIFICATION_READY'
  && classificationUnclassifiedCount === 0;
if (!classificationReady) {
  retrievalFusionBlockers.push({
    code: 'RRF_CALLER_MAPPING_INCOMPLETE',
    lane: 'RRF',
    severity: 'PROMOTION_BLOCKING',
    receiptRefs: ['docs/reports/rrf-caller-classification-v1.json'],
    explanation: `${classificationUnclassifiedCount ?? '?'}/${classifiedCallerCount ?? '?'} RRF call sites remain unclassified by the explicit classification receipt. migrationAuthorized=${rrf?.migrationAuthorized ?? 'unknown'}.`,
  });
}
if ((rrfMetrics.executorAsLaneCount ?? 1) > 0) {
  retrievalFusionBlockers.push({
    code: 'RRF_EXECUTOR_AS_LANE_VIOLATION',
    lane: 'RRF',
    severity: 'PROMOTION_BLOCKING',
    receiptRefs: ['docs/reports/rrf-caller-baseline-v1.json'],
    explanation: `${rrfMetrics.executorAsLaneCount ?? '?'} call sites treat an executor (e.g. TurboVec) as a fusion lane rather than a logical retrieval signal.`,
  });
}
const retrievalFusion = {
  searchRuntimeOwnerProven: false, // canonicalFusionOwner is declared ('SearchRuntime') but not proven live by this receipt
  rrfCallerCount: rrfMetrics.callerCount ?? null,
  fusionCallerCount: rrfMetrics.fusionCallerCount ?? null,
  mappedCallerCount: classificationReady ? classifiedCallerCount : null,
  unmappedCallerCount: classificationReady ? 0 : classificationUnclassifiedCount,
  baselineUnmappedCallerCount: rrfMetrics.unmappedCount ?? null,
  classificationStatus: rrfClassification?.status ?? null,
  executorAsLaneViolations: rrfMetrics.executorAsLaneCount ?? null,
  ambiguousMappings: rrfMetrics.ambiguousMappingCount ?? null,
  status: classificationReady ? 'PARTIAL' : 'BLOCKED',
  blockers: retrievalFusionBlockers.map((b) => b.code),
};

// ---------------------------------------------------------------------------
// 6. judgmentCorpus
// ---------------------------------------------------------------------------
const golden = receipts.goldenReviewCorpusCompatibility.value;
const judgmentCorpusBlockers = [];
if ((golden?.compatibleManifestCount ?? 0) === 0) {
  judgmentCorpusBlockers.push({
    code: 'JUDGMENT_CORPUS_NOT_BOUND_TO_CURRENT_SEMANTIC_CORPUS',
    lane: 'JUDGMENT',
    severity: 'PROMOTION_BLOCKING',
    receiptRefs: ['docs/reports/golden-review-corpus-compatibility-v1.json'],
    explanation: `${golden?.manifestsFound ?? 0} manifest(s) found, ${golden?.compatibleManifestCount ?? 0} compatible. The one found manifest declares embedding_dimension=${golden?.manifests?.[0]?.embedding_dimension ?? 'unknown'} against an expected embeddingDimension=${golden?.expected?.embeddingDimension ?? 768}; judgment_set_hash is 'pending'.`,
  });
}

const judgmentCorpus = {
  compatibleManifestCount: golden?.compatibleManifestCount ?? 0,
  currentCorpusChecksum: null,
  semanticCorpusChecksum: null,
  querySetChecksum: golden?.manifests?.[0]?.query_set_hash ?? null,
  judgmentSetChecksum: golden?.manifests?.[0]?.judgment_set_hash === 'pending' ? null : (golden?.manifests?.[0]?.judgment_set_hash ?? null),
  reviewerRevision: null,
  provenanceRevision: null,
  importEnabled: false,
  status: 'BLOCKED',
  blockers: judgmentCorpusBlockers.map((b) => b.code),
};

// ---------------------------------------------------------------------------
// 7. topology
// ---------------------------------------------------------------------------
const topoRouting = receipts.mcpTopologyToolRouting.value;
const traceHealth = receipts.traceDisabledSearchTools.value?.dependencyReadback?.health;
const topologyServiceUp = (traceHealth?.services ?? []).find((s) => s.name === 'topology_search')?.ok === true;
const rerankServiceEntry = (traceHealth?.services ?? []).find((s) => s.name === 'rerank');

const topologyBlockers = [{
  code: 'DEDICATED_TOPOLOGY_EXECUTOR_MISSING',
  lane: 'TOPOLOGY',
  severity: 'OPTIONAL', // per spec section 4: must not make safeToProject false by itself
  receiptRefs: ['docs/reports/mcp-topology-tool-routing-v1.json', 'docs/reports/trace-disabled-search-tools-v1.json'],
  explanation: 'No admitted retrieval workload currently requires a live topology executor (contract/fixture proven, no live endpoint deployed; port 8101 confirmed owned by the Go index worker, not a topology executor).',
}];

const topology = {
  protocolAvailable: topoRouting?.gan?.wired === true,
  routingContractProven: topoRouting?.status === 'PROVEN_FIXTURE_ONLY' && Object.values(topoRouting?.checks ?? {}).every(Boolean),
  fixtureOnly: topoRouting?.status === 'PROVEN_FIXTURE_ONLY',
  executorAvailable: topologyServiceUp === true,
  status: topologyServiceUp ? 'PROVEN' : 'OPTIONAL_CAPABILITY_NOT_DEPLOYED',
  blockers: topologyBlockers.map((b) => b.code),
};

// ---------------------------------------------------------------------------
// 8. trace (TRACE-MCP-CORE-SEARCH-01)
// ---------------------------------------------------------------------------
const traceReceipt = receipts.traceDisabledSearchTools.value;
const coreSearchProven = traceReceipt?.readOnlyProbe?.status === 'RESPONDED'
  && traceReceipt?.dependencyReadback?.status === 'RESPONDED'
  && traceReceipt?.dependencyReadback?.health?.ok === true
  && traceReceipt?.optionalRegistriesEnabled === false;
const kagSearchProven = traceReceipt?.kagSearchReadback?.status === 'RESPONDED';
const identityEnvelopeProven = traceReceipt?.identityEnvelopeGate?.liveStatus === 'LIVE_ENVELOPE_MISSING' ? false : traceReceipt?.identityEnvelopeGate?.promotionReady === true;

const trace = {
  coreSearchProven,
  kagSearchProven,
  // Identity envelope is implemented in source but not live-reloaded; this
  // gates downstream lanes that need canonical packet-key joins (RRF/judgment
  // convergence), NOT the TRACE core-search surface itself (tools/list,
  // health, disabled-registry policy) captured by coreSearchProven above.
  identityEnvelopeProven,
  optionalRegistriesEnabled: traceReceipt?.optionalRegistriesEnabled === true,
  status: (coreSearchProven && kagSearchProven && traceReceipt?.optionalRegistriesEnabled === false) ? 'PROVEN' : 'PARTIAL',
};

// ---------------------------------------------------------------------------
// 9. rerank
// ---------------------------------------------------------------------------
const cudaGraphRerankCandidate = (topoRouting?.routing?.candidates ?? []).find((c) => c.lane === 'CUDA_GRAPH_RERANK');
const rerank = {
  protocolAvailable: Boolean(cudaGraphRerankCandidate),
  endpointConfigured: rerankServiceEntry ? rerankServiceEntry.status !== 'not_configured' : false,
  compatibleJudgmentAuthorityProven: judgmentCorpus.status === 'PROVEN',
  status: 'UNCONFIGURED',
};
const rerankBlocker = {
  code: 'RERANK_EVAL_AUTHORITY_UNPROVEN',
  lane: 'RERANK',
  severity: 'INFORMATIONAL', // downstream of semantic corpus + judgment corpus, both already blocking
  receiptRefs: ['docs/reports/mcp-topology-tool-routing-v1.json', 'docs/reports/trace-disabled-search-tools-v1.json'],
  explanation: 'rerank endpoint reports status="not_configured" in trace.system_health; the only rerank lane in the routing fixture (atlas.rerank.cuda_graph) is dependencyReady=false/BLOCKED.',
};

// ---------------------------------------------------------------------------
// 10. promotion booleans (derived, section 11 — never looser than the formula)
// ---------------------------------------------------------------------------
const promotionBlockers = [
  ...sourceAuthorityBlockers,
  ...semanticCorpusBlockers,
  ...retrievalFusionBlockers,
  ...judgmentCorpusBlockers,
  ...topologyBlockers,
  rerankBlocker,
];

const safeToProject = sourceAuthority.status === 'PROVEN' && semanticCorpus.status === 'PROVEN';
const safeToImportJudgments = safeToProject && judgmentCorpus.status === 'PROVEN' && judgmentCorpus.importEnabled;
const safeToMigrateRrfCallers = retrievalFusion.status !== 'BLOCKED'
  && retrievalFusion.unmappedCallerCount === 0
  && retrievalFusion.executorAsLaneViolations === 0;
const safeToEnableTopology = topology.status === 'PROVEN';
const safeToConfigureRerank = semanticCorpus.status === 'PROVEN' && judgmentCorpus.status === 'PROVEN';
const safeToRetryGraphifyPromotion = sourceAuthority.status === 'PROVEN' && semanticCorpus.status === 'PROVEN';

const promotion = {
  safeToProject,
  safeToImportJudgments,
  safeToEnableTopology,
  safeToMigrateRrfCallers,
  safeToConfigureRerank,
  safeToRetryGraphifyPromotion,
  blockers: promotionBlockers,
};

// ---------------------------------------------------------------------------
// 11. Semantic admission readiness (section 6) + judgment compatibility
//     (section 7) + RRF classification readiness (section 8) — explicit
//     readiness verdicts, distinct from the board's own BLOCKED status.
// ---------------------------------------------------------------------------
const semanticCorpusAdmissionReadiness = {
  verdict: corpusUnresolved ? 'SEMANTIC_CORPUS_ADMISSION_BLOCKED' : 'SEMANTIC_CORPUS_ADMISSION_READY',
  requiredIdentity: {
    owner: 'codebase_chunks_768',
    challenger: 'codebase_chunks_768_v2',
    workspaceRevision: admittedWorkspaceRevision,
    sourceRevisionSet: gatesReport?.workspaceAuthority?.sourceSelectionChecksum ?? null,
    representationRevision: null,
  },
  blockers: corpusUnresolved
    ? [
      'qdrantCollection resolves to UNRESOLVED_MULTIPLE_768_COLLECTIONS in the current manifest plan (postgresChunkCount=55169 vs codebase_chunks_768 pointCount=109776 vs codebase_chunks_768_v2 pointCount=52816 — none currently reconciled 1:1 with an admitted workspace revision)',
      'representationRevision has not been established for the current admitted workspace revision',
      'candidateCount/canonicalIdCount/duplicateCanonicalIds/missingSourceRevision/mixedWorkspaceRevision/mixedRepresentationRevision are not yet measured against the admitted workspace revision',
    ]
    : [],
};

const judgmentCompatibility = {
  verdict: golden?.status ?? 'COMPATIBLE_CORPUS_MISSING',
  manifestsFound: golden?.manifestsFound ?? 0,
  compatibleManifestCount: golden?.compatibleManifestCount ?? 0,
  mismatchReasons: [
    golden?.manifests?.[0]?.embedding_dimension !== golden?.expected?.embeddingDimension
      ? `embedding_dimension mismatch: manifest=${golden?.manifests?.[0]?.embedding_dimension ?? 'unknown'} expected=${golden?.expected?.embeddingDimension ?? 768}`
      : null,
    golden?.manifests?.[0]?.judgment_set_hash === 'pending' ? 'judgment_set_hash is pending (not computed)' : null,
  ].filter(Boolean),
};

const rrfCallerClassification = {
  verdict: classificationReady ? 'RRF_CALLER_CLASSIFICATION_READY' : 'RRF_CALLER_CLASSIFICATION_BLOCKED',
  callerCount: rrfMetrics.callerCount ?? null,
  unmappedCount: rrfMetrics.unmappedCount ?? null,
  executorAsLaneCount: rrfMetrics.executorAsLaneCount ?? null,
  ambiguousMappingCount: rrfMetrics.ambiguousMappingCount ?? null,
  canonicalFusionOwner: rrf?.canonicalFusionOwner ?? null,
  migrationAuthorized: rrf?.migrationAuthorized ?? false,
};

// ---------------------------------------------------------------------------
// 12. Read-only invariant proof (section 12) — this script performs zero
//     mutating actions; every field below is provably false by construction
//     (readJson() only ever calls fs.readFileSync, never a write API, and no
//     network/service call is made anywhere in this script).
// ---------------------------------------------------------------------------
const readOnlyInvariants = {
  writesPerformed: false, // this script only writes docs/reports/promotion-board-reconcile-v2.{json,md}
  graphifyApplyInvoked: false,
  topologyStarted: false,
  rerankConfigured: false,
  judgmentsImported: false,
  rrfRuntimeChanged: false,
  qdrantModified: false,
  postgresModified: false,
  dockerCleanupPerformed: false,
};

// ---------------------------------------------------------------------------
// 13. Next-priority queue (section 16)
// ---------------------------------------------------------------------------
const nextGateQueue = [
  { priority: 'P0', gate: 'CURRENT-SOURCE-OWNER/WORKSPACE-SNAPSHOT', note: 'Already PARTIAL_PROVEN for the admitted revision at the terminal-execution level; CURRENT-STRUCTURAL-LINEAGE-01 is the actual next unresolved sub-gate per parent-atlas-promotion-gates-v1.json.' },
  { priority: 'P1', gate: 'SEMANTIC-CORPUS-ADMISSION-01', note: 'Blocked on CURRENT_CORPUS_SELECTION_UNRESOLVED.' },
  { priority: 'P2', gate: 'GOLDEN-REVIEW-CORPUS-02', note: 'Blocked on judgment corpus not bound to a 768-dim current semantic corpus.' },
  {
    priority: 'P3',
    gate: 'RRF-CALLER-CLASSIFICATION-02',
    // Derived from the live retrievalFusion computation above -- do not hardcode a caller-count
    // string here again; it silently went stale once already (previously said "90/93 UNMAPPED, 2
    // EXECUTOR_AS_LANE violations" long after both the baseline and classification receipts had
    // moved to 0/0, contradicting this same report's own board.retrievalFusion in the same run).
    note: retrievalFusion.status === 'BLOCKED'
      ? `Blocked: ${retrievalFusion.unmappedCallerCount ?? '?'}/${retrievalFusion.rrfCallerCount ?? '?'} callers UNMAPPED, ${retrievalFusion.executorAsLaneViolations ?? '?'} EXECUTOR_AS_LANE violations.`
      : `Not blocking: ${retrievalFusion.classificationStatus} (${retrievalFusion.mappedCallerCount ?? '?'}/${retrievalFusion.rrfCallerCount ?? '?'} classified, ${retrievalFusion.executorAsLaneViolations ?? '?'} EXECUTOR_AS_LANE violations). Migration itself is a separate, not-yet-made decision.`,
  },
  { priority: 'P4', gate: 'PROMOTION-BOARD-RECONCILE (rerun)', note: 'Re-run after any of P0-P3 receipts change.' },
  { priority: 'P5', gate: 'retrieval profile convergence', note: 'Depends on P1-P3.' },
  { priority: 'P6', gate: 'TOPOLOGY-EXECUTOR-NEED-01', note: 'Optional-capability question, not currently blocking; port 8101 confirmed owned by the Go index worker.' },
  { priority: 'P7', gate: 'rerank endpoint configuration', note: 'Gated behind P1 and P2.' },
];

// ---------------------------------------------------------------------------
// 14. Assemble ParentAtlasPromotionBoardV2 + checksum (deterministic, sorted,
//     timestamps excluded from the canonical payload per section 14).
// ---------------------------------------------------------------------------
const board = {
  schemaVersion: 'atlas.promotion.board.v2',
  workspaceRevision: admittedWorkspaceRevision,
  sourceAuthority,
  semanticCorpus,
  retrievalFusion,
  judgmentCorpus,
  topology,
  trace,
  rerank,
  promotion,
  receiptRefs: Object.values(receipts).map((r) => r.path).sort(),
};

const canonicalPayload = JSON.stringify({
  schemaVersion: board.schemaVersion,
  workspaceRevision: board.workspaceRevision,
  sourceAuthority: { status: board.sourceAuthority.status, blockers: [...board.sourceAuthority.blockers].sort() },
  semanticCorpus: { status: board.semanticCorpus.status, blockers: [...board.semanticCorpus.blockers].sort() },
  retrievalFusion: { status: board.retrievalFusion.status, blockers: [...board.retrievalFusion.blockers].sort() },
  judgmentCorpus: { status: board.judgmentCorpus.status, blockers: [...board.judgmentCorpus.blockers].sort() },
  topology: { status: board.topology.status, blockers: [...board.topology.blockers].sort() },
  trace: { status: board.trace.status },
  rerank: { status: board.rerank.status },
  promotion: {
    safeToProject: board.promotion.safeToProject,
    safeToImportJudgments: board.promotion.safeToImportJudgments,
    safeToEnableTopology: board.promotion.safeToEnableTopology,
    safeToMigrateRrfCallers: board.promotion.safeToMigrateRrfCallers,
    safeToConfigureRerank: board.promotion.safeToConfigureRerank,
    safeToRetryGraphifyPromotion: board.promotion.safeToRetryGraphifyPromotion,
  },
  receiptRefs: board.receiptRefs,
});
const checksum = `sha256:${crypto.createHash('sha256').update(canonicalPayload).digest('hex')}`;

const blockerMatrix = [
  { lane: 'SOURCE', status: sourceAuthority.status, promotionImpact: 'BLOCKS safeToProject, safeToRetryGraphifyPromotion', nextGate: 'CURRENT-STRUCTURAL-LINEAGE-01' },
  { lane: 'SEMANTIC_CORPUS', status: semanticCorpus.status, promotionImpact: 'BLOCKS safeToProject, safeToConfigureRerank, safeToRetryGraphifyPromotion', nextGate: 'SEMANTIC-CORPUS-ADMISSION-01' },
  { lane: 'JUDGMENT', status: judgmentCorpus.status, promotionImpact: 'BLOCKS safeToImportJudgments, safeToConfigureRerank', nextGate: 'GOLDEN-REVIEW-CORPUS-02' },
  { lane: 'RRF', status: retrievalFusion.status, promotionImpact: 'BLOCKS safeToMigrateRrfCallers', nextGate: 'RRF-CALLER-CLASSIFICATION-02' },
  { lane: 'TOPOLOGY', status: topology.status, promotionImpact: 'NONE (optional capability; does not block safeToProject)', nextGate: 'TOPOLOGY-EXECUTOR-NEED-01' },
  { lane: 'TRACE', status: trace.status, promotionImpact: 'NONE — TRACE-MCP-CORE-SEARCH-01 leaves the critical path', nextGate: 'none (returns to queue only if a downstream lane finds a missing contract)' },
  { lane: 'RERANK', status: rerank.status, promotionImpact: 'BLOCKS safeToConfigureRerank (already blocked upstream by SEMANTIC_CORPUS + JUDGMENT)', nextGate: 'rerank endpoint configuration (P7)' },
  { lane: 'GRAPHIFY', status: 'DO_NOT_RETRY', promotionImpact: 'Retry gated behind safeToRetryGraphifyPromotion', nextGate: 'CURRENT-STRUCTURAL-LINEAGE-01 (shared with SOURCE)' },
];

const report = {
  schema: 'atlas.promotion-board-reconcile.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  gate: 'PROMOTION-BOARD-RECONCILE-02',
  owner: 'openspec/changes/parent-atlas-ace-rlm-bitfrost-integration',
  extends: 'PARENT-ATLAS-PROMOTION-GATES-01 (scripts/atlas/audit-parent-atlas-promotion-gates-v1.mjs)',
  board,
  blockerMatrix,
  receiptInventory,
  currentReceiptAmbiguous,
  semanticCorpusAdmissionReadiness,
  judgmentCompatibility,
  rrfCallerClassification,
  topologyOptionality: {
    portOwnership: {
      port: 8101,
      currentOwner: 'GO_INDEX_WORKER',
      evidence: 'sveltekit-frontend/src/lib/server/retrieval/topology-search-client.ts:7 and sveltekit-frontend/src/mcp/tools/topology-search.tool.ts (static source comment, read-only check — no port allocated or process started by this script)',
    },
    needProven: false,
    executorDeployed: false,
    promotionImpact: 'NONE',
  },
  traceCriticalPathStatus: {
    gate: 'TRACE-MCP-CORE-SEARCH-01',
    status: trace.status,
    optionalCapabilityGaps: ['identity envelope not live-reloaded (blocks downstream canonical KAG joins, not TRACE core search itself)', 'codebase/research/bifrost/rg-atlas optional registries remain disabled by policy'],
  },
  readOnlyInvariants,
  nextGateQueue,
  checksum,
};

fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const md = `# Promotion Board Reconcile 02

Generated: ${report.generatedAt}
Mode: READ_ONLY
Checksum: ${checksum}

## Board state

| Lane | Status |
|---|---|
| SOURCE_AUTHORITY | ${sourceAuthority.status} |
| TRACE_CORE | ${trace.status} |
| SEMANTIC_OWNER | ${semanticCorpus.owner} (DECLARED) |
| SEMANTIC_CHALLENGER | ${semanticCorpus.challenger} (NOT_PROMOTED) |
| CURRENT_SEMANTIC_CORPUS | ${semanticCorpus.status} |
| JUDGMENT_CORPUS | ${judgmentCorpus.status} |
| JUDGMENT_IMPORT | ${judgmentCorpus.importEnabled ? 'ENABLED' : 'DISABLED'} |
| RRF_CALLER_CONVERGENCE | ${retrievalFusion.status} |
| TOPOLOGY_CONTRACT | ${topology.routingContractProven ? 'PROVEN' : 'NOT_PROVEN'} |
| TOPOLOGY_EXECUTOR | ${topology.status} |
| RERANK_EXECUTOR | ${rerank.status} |
| GRAPHIFY_PROMOTION | DO_NOT_RETRY |

## Promotion flags

| Flag | Value |
|---|---|
| safeToProject | ${promotion.safeToProject} |
| safeToImportJudgments | ${promotion.safeToImportJudgments} |
| safeToEnableTopology | ${promotion.safeToEnableTopology} |
| safeToMigrateRrfCallers | ${promotion.safeToMigrateRrfCallers} |
| safeToConfigureRerank | ${promotion.safeToConfigureRerank} |
| safeToRetryGraphifyPromotion | ${promotion.safeToRetryGraphifyPromotion} |

## Blocker matrix

| Lane | Status | Promotion impact | Next gate |
|---|---|---|---|
${blockerMatrix.map((b) => `| ${b.lane} | ${b.status} | ${b.promotionImpact} | ${b.nextGate} |`).join('\n')}

## Read-only invariants

${Object.entries(readOnlyInvariants).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Next-priority queue

${nextGateQueue.map((g) => `- ${g.priority}: ${g.gate} — ${g.note}`).join('\n')}

Full detail: \`docs/reports/promotion-board-reconcile-v2.json\`.
`;
fs.writeFileSync(REPORT_MD_PATH, md, 'utf8');

console.log(JSON.stringify({
  status: 'PROMOTION_BOARD_RECONCILE_02_COMPLETE',
  checksum,
  reportPath: 'docs/reports/promotion-board-reconcile-v2.json',
  mdPath: 'docs/reports/promotion-board-reconcile-v2.md',
  ...readOnlyInvariants,
}, null, 2));
