#!/usr/bin/env node
/**
 * OWNER-COLLISION-RECONCILE-01 / PROMOTION-BOARD-RECONCILE-02 -- READ ONLY.
 *
 * V2 separates two questions that V1 incorrectly coupled:
 *   1. WHO owns a capability?           -> ownershipStatus
 *   2. IS current evidence admissible?  -> evidenceStatus
 *
 * ACE is only the promotion-board coordination ledger. It is never inferred to
 * be the canonical data/runtime owner merely because its OpenSpec change holds
 * receipts.
 *
 * No Postgres, Qdrant, Neo4j, Graphify, cache, model, judgment, symbol,
 * representation, Docker, or projection writes are performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const noReport = process.argv.includes('--no-report');

const paths = {
  portfolio: path.resolve(root, argValue('portfolio', 'docs/reports/openspec-portfolio-implementation-readiness-v1.json')),
  promotionGates: path.resolve(root, argValue('promotion-gates', 'docs/reports/parent-atlas-promotion-gates-v1.json')),
  rrfLedger: path.resolve(root, argValue('rrf-ledger', 'openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md')),
  aceLedger: path.resolve(root, argValue('ace-ledger', 'openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md')),
  report: path.resolve(root, argValue('out', 'docs/reports/promotion-critical-owner-reconciliation-v2.json')),
};

const ROLE = Object.freeze({
  CANONICAL_OWNER: 'CANONICAL_OWNER',
  DERIVED_PROJECTION: 'DERIVED_PROJECTION',
  EXECUTOR: 'EXECUTOR',
  CACHE: 'CACHE',
  COMPATIBILITY_LAYER: 'COMPATIBILITY_LAYER',
  CHALLENGER: 'CHALLENGER',
  TEST_ONLY: 'TEST_ONLY',
  DEAD_ORPHAN: 'DEAD_ORPHAN',
  DUPLICATE_OWNER_VIOLATION: 'DUPLICATE_OWNER_VIOLATION',
  UNRESOLVED: 'UNRESOLVED',
});

const OWNERSHIP = Object.freeze({
  RESOLVED: 'OWNER_RESOLVED',
  COLLISION: 'OWNER_COLLISION',
  UNRESOLVED: 'OWNER_UNRESOLVED',
});

const EVIDENCE = Object.freeze({
  PROVEN: 'PROVEN',
  PARTIAL: 'PARTIAL',
  BLOCKED: 'BLOCKED',
  NA: 'NOT_APPLICABLE',
});

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function activeChange(portfolio, changeId) {
  return portfolio?.activeChanges?.find((entry) => entry?.changeId === changeId) ?? null;
}

function changeExists(portfolio, changeId) {
  return Boolean(activeChange(portfolio, changeId));
}

function promotionGate(promotion, id) {
  return promotion?.gates?.find((gate) => gate?.id === id) ?? null;
}

function laneFinding(promotion, id) {
  return promotion?.independentLaneFindings?.[id] ?? null;
}

function compact(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0))];
}

function parseRrfCallerEvidence(text) {
  // Prefer explicit latest ledger claims. If they are absent, fail closed rather
  // than silently inferring convergence from owner existence.
  const unmappedMatch = text.match(/\bunmapped(?:\s+callers?)?\s*(?::|=|→)?\s*(\d+)\s*\/\s*(\d+)/i)
    ?? text.match(/\b(\d+)\s*\/\s*(\d+)\s+callers?\s+(?:remain\s+)?unmapped\b/i);
  const mappedMatch = text.match(/\bmapped(?:\s+callers?)?\s*(?::|=|→)?\s*(\d+)\s*\/\s*(\d+)/i);
  const executorMatch = text.match(/executor[-\s]as[-\s]lane(?:\s+violations?)?\s*(?::|=|→)?\s*(\d+)/i)
    ?? text.match(/\b(\d+)\s+(?:TurboVec|executor)[^\n]{0,80}as[-\s]lane/i);

  const unmapped = unmappedMatch ? Number(unmappedMatch[1]) : null;
  const total = unmappedMatch ? Number(unmappedMatch[2]) : mappedMatch ? Number(mappedMatch[2]) : null;
  const mapped = mappedMatch ? Number(mappedMatch[1]) : (unmapped !== null && total !== null ? total - unmapped : null);
  const executorAsLaneViolations = executorMatch ? Number(executorMatch[1]) : null;

  return { mapped, unmapped, total, executorAsLaneViolations };
}

function parseSymbolRegistryResolution(text) {
  const explicitlyResolved = /SYMBOL_REPRESENTATION_REGISTRY_RESOLVED\s*(?::|=)\s*(?:true|PROVEN|OWNER_RESOLVED)/i.test(text);
  const currentRevisionProven = /SYMBOL_REPRESENTATION_CURRENT_REVISION_PROVEN\s*(?::|=)\s*(?:true|PROVEN)/i.test(text);
  return { explicitlyResolved, currentRevisionProven };
}

const inputErrors = [];
let portfolio = null;
let promotion = null;
try {
  portfolio = readJsonIfExists(paths.portfolio);
  if (!portfolio) throw new Error(`PORTFOLIO_REPORT_MISSING:${relative(paths.portfolio)}`);
  if (portfolio.schema !== 'atlas.openspec-portfolio-implementation-readiness.v1') {
    throw new Error(`PORTFOLIO_SCHEMA_UNEXPECTED:${portfolio.schema ?? 'missing'}`);
  }
  if (portfolio.readOnly !== true) throw new Error('PORTFOLIO_NOT_READ_ONLY');
  if (portfolio.policy?.automaticMutation !== false) throw new Error('PORTFOLIO_AUTOMATIC_MUTATION_POLICY_UNSAFE');
} catch (error) {
  inputErrors.push(error instanceof Error ? error.message : String(error));
}

try {
  promotion = readJsonIfExists(paths.promotionGates);
  if (!promotion) throw new Error(`PROMOTION_GATES_REPORT_MISSING:${relative(paths.promotionGates)}`);
  if (promotion.mode !== 'READ_ONLY' || promotion.writesPerformed !== false) {
    throw new Error('PROMOTION_GATES_NOT_READ_ONLY');
  }
} catch (error) {
  inputErrors.push(error instanceof Error ? error.message : String(error));
}

const rrfLedgerText = readTextIfExists(paths.rrfLedger);
const aceLedgerText = readTextIfExists(paths.aceLedger);
const rrfCallerEvidence = parseRrfCallerEvidence(rrfLedgerText);
const symbolRegistryEvidence = parseSymbolRegistryResolution(aceLedgerText);

const workspaceAdmitted = promotion?.workspaceAuthority?.status === 'ADMITTED'
  && promotion?.workspaceAuthority?.authority === true;
const terminalGraphifyMatches = promotion?.graphifyExecution?.matchesAdmittedWorkspaceRevision === true
  && !['BLOCKED', 'ERROR'].includes(promotion?.graphifyExecution?.status);
const sourceEvidenceStatus = workspaceAdmitted && terminalGraphifyMatches
  ? EVIDENCE.PROVEN
  : workspaceAdmitted ? EVIDENCE.PARTIAL : EVIDENCE.BLOCKED;

const structuralFinding = laneFinding(promotion, 'structural');
const packetChunkEvidenceStatus = structuralFinding?.status && /PROVEN|READY|ADMITTED/i.test(structuralFinding.status)
  ? EVIDENCE.PROVEN
  : structuralFinding?.status ? EVIDENCE.BLOCKED : EVIDENCE.PARTIAL;

const semanticOwnerFinding = laneFinding(promotion, 'semanticOwner');
const semanticOwnerEvidenceStatus = semanticOwnerFinding?.status && /OWNER_PROVEN|PROVEN|ADMITTED/i.test(semanticOwnerFinding.status)
  ? EVIDENCE.PROVEN
  : semanticOwnerFinding?.status ? EVIDENCE.PARTIAL : EVIDENCE.BLOCKED;
const semanticCorpusGate = promotionGate(promotion, 'SEMANTIC-768-OWNER-RECONCILIATION-01');
const currentSemanticCorpusEvidenceStatus = semanticCorpusGate?.status === 'PROVEN'
  && semanticOwnerEvidenceStatus === EVIDENCE.PROVEN
  ? EVIDENCE.PROVEN
  : EVIDENCE.BLOCKED;

const judgmentFinding = laneFinding(promotion, 'judgment');
const currentJudgmentEvidenceStatus = judgmentFinding?.status && /PROVEN|COMPLETE|ADMITTED/i.test(judgmentFinding.status)
  && !/INCOMPLETE|BLOCKED|FAIL/i.test(judgmentFinding.status)
  ? EVIDENCE.PROVEN
  : EVIDENCE.BLOCKED;

const graphifyEvidenceStatus = terminalGraphifyMatches ? EVIDENCE.PROVEN : EVIDENCE.BLOCKED;
const aceFinding = laneFinding(promotion, 'ace');
const aceEvidenceStatus = aceFinding?.status && /PROVEN|READY|ADMITTED/i.test(aceFinding.status)
  && !/BLOCKED|FAIL/i.test(aceFinding.status)
  ? EVIDENCE.PROVEN
  : EVIDENCE.BLOCKED;

const symbolOwnershipStatus = symbolRegistryEvidence.explicitlyResolved
  ? OWNERSHIP.RESOLVED
  : OWNERSHIP.UNRESOLVED;
const symbolEvidenceStatus = symbolRegistryEvidence.explicitlyResolved && symbolRegistryEvidence.currentRevisionProven
  ? EVIDENCE.PROVEN
  : EVIDENCE.BLOCKED;

const rrfCallerEvidenceComplete = [
  rrfCallerEvidence.unmapped,
  rrfCallerEvidence.total,
  rrfCallerEvidence.executorAsLaneViolations,
].every((value) => Number.isInteger(value) && value >= 0);
const rrfCallerEvidenceStatus = rrfCallerEvidenceComplete
  && rrfCallerEvidence.unmapped === 0
  && rrfCallerEvidence.executorAsLaneViolations === 0
  ? EVIDENCE.PROVEN
  : EVIDENCE.BLOCKED;

const frozenEvidenceSnapshotStatus = sourceEvidenceStatus === EVIDENCE.PROVEN
  && packetChunkEvidenceStatus === EVIDENCE.PROVEN
  && currentSemanticCorpusEvidenceStatus === EVIDENCE.PROVEN
  ? EVIDENCE.PROVEN
  : EVIDENCE.BLOCKED;

const resources = [];
function addResource(row) {
  resources.push({
    resource: row.resource,
    coordinationChange: row.coordinationChange,
    canonicalOwnerArtifact: row.canonicalOwnerArtifact,
    ownershipStatus: row.ownershipStatus,
    evidenceStatus: row.evidenceStatus,
    competingChanges: row.competingChanges ?? [],
    competingArtifacts: row.competingArtifacts ?? [],
    evidenceRefs: compact(row.evidenceRefs ?? []),
    blocksPromotion: Boolean(row.blocksPromotion),
    blockers: compact(row.blockers ?? []),
    notes: row.notes ?? null,
  });
}

addResource({
  resource: 'SOURCE_WORKSPACE_AUTHORITY',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'PostgreSQL canonical source/workspace lineage bound to the admitted Graphify snapshot',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: sourceEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-code-ingestion-pipeline', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-graphify-recovery-proof-ladder', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-canonical-directory-ingestion-fabric', classification: ROLE.DERIVED_PROJECTION },
  ],
  evidenceRefs: [
    'docs/reports/parent-atlas-promotion-gates-v1.json',
    promotion?.workspaceAuthority?.receiptPath,
    promotion?.graphifyExecution?.receiptPath,
    'docs/reports/current-source-owner-reconciliation-v1.json',
  ],
  blocksPromotion: sourceEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [
    !workspaceAdmitted ? 'WORKSPACE_AUTHORITY_NOT_ADMITTED' : null,
    !terminalGraphifyMatches ? (promotion?.graphifyExecution?.blocker ?? 'NO_TERMINAL_GRAPHIFY_EXECUTION_BOUND_TO_ADMITTED_SNAPSHOT') : null,
  ],
  notes: 'ACE coordinates receipts only; it is not emitted as canonical source storage.',
});

addResource({
  resource: 'PACKET_CHUNK_IDENTITY',
  coordinationChange: 'parent-atlas-retrieval-lineage-dag-convergence',
  canonicalOwnerArtifact: 'PostgreSQL atlas_packets + atlas_packet_chunk_lineage + codebase_chunk_index canonical chunk identity',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: packetChunkEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-graph-retrieval-proof', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-candidate-feature-execution-fabric', classification: ROLE.DERIVED_PROJECTION },
    { changeId: 'add-packet-ontology-registry', classification: ROLE.UNRESOLVED },
  ],
  evidenceRefs: ['docs/reports/current-workspace-packet-chunk-join-v1.json', 'docs/reports/atlas-registry-writer-ownership-v2.json'],
  blocksPromotion: packetChunkEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [structuralFinding?.firstBlockingInvariant, structuralFinding?.status && packetChunkEvidenceStatus !== EVIDENCE.PROVEN ? structuralFinding.status : null],
});

addResource({
  resource: 'SYMBOL_REPRESENTATION_REGISTRY',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'UNRESOLVED: one current-revision symbol/version/representation registry must be selected after writer/reader/migration reconciliation',
  ownershipStatus: symbolOwnershipStatus,
  evidenceStatus: symbolEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-code-ingestion-pipeline', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-graph-retrieval-proof', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-topology-representation-admission', classification: ROLE.UNRESOLVED },
  ],
  competingArtifacts: [
    { artifact: 'graphify_symbols', classification: ROLE.COMPATIBILITY_LAYER, reason: 'Current promotion gate checks this surface, but latest audit found it empty.' },
    { artifact: 'atlas_symbol_registry / atlas_symbol_versions', classification: ROLE.UNRESOLVED, reason: 'Populated candidate owner, but latest audit binds it to non-admitted canary/staging workspace revision.' },
    { artifact: 'pending atlas_representations migration', classification: ROLE.UNRESOLVED, reason: 'Schema candidate is not applied and therefore cannot be selected from intent alone.' },
  ],
  evidenceRefs: [relative(paths.aceLedger), 'docs/reports/parent-atlas-promotion-gates-v1.json'],
  blocksPromotion: symbolOwnershipStatus !== OWNERSHIP.RESOLVED || symbolEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [
    symbolOwnershipStatus !== OWNERSHIP.RESOLVED ? 'SYMBOL_REPRESENTATION_REGISTRY_OWNER_UNRESOLVED' : null,
    symbolEvidenceStatus !== EVIDENCE.PROVEN ? 'SYMBOL_REPRESENTATION_CURRENT_REVISION_NOT_PROVEN' : null,
  ],
  notes: 'Do not select a registry by row count; require current workspace binding, stable symbol-version identity, active writer/readers, migration ownership, and promotion-gate adoption.',
});

addResource({
  resource: 'SEMANTIC_768_CONTRACT',
  coordinationChange: 'parent-atlas-semantic-768-canonical-contract',
  canonicalOwnerArtifact: 'semantic_768 representation/identity contract with PostgreSQL exact-vector lineage',
  ownershipStatus: changeExists(portfolio, 'parent-atlas-semantic-768-canonical-contract') ? OWNERSHIP.RESOLVED : OWNERSHIP.UNRESOLVED,
  evidenceStatus: semanticOwnerEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-semantic-512-canonicalization', classification: ROLE.CHALLENGER },
    { changeId: 'parent-atlas-768-dim-migration', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-gpu-graph-vector-substrate', classification: ROLE.EXECUTOR },
    { changeId: 'parent-atlas-topology-representation-admission', classification: ROLE.DERIVED_PROJECTION },
  ],
  evidenceRefs: ['docs/reports/semantic-768-writer-ownership-v1.json', 'docs/reports/semantic-768-contract-proof.json'],
  blocksPromotion: semanticOwnerEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [semanticOwnerFinding?.status, semanticOwnerFinding?.firstBlockingInvariant],
  notes: 'Owner selection and writer/current-corpus admission are intentionally separate.',
});

addResource({
  resource: 'CURRENT_SEMANTIC_CORPUS',
  coordinationChange: 'parent-atlas-semantic-768-canonical-contract',
  canonicalOwnerArtifact: 'One revision-qualified semantic_768 cohort bound one-to-one to the admitted workspace/source frame',
  ownershipStatus: changeExists(portfolio, 'parent-atlas-semantic-768-canonical-contract') ? OWNERSHIP.RESOLVED : OWNERSHIP.UNRESOLVED,
  evidenceStatus: currentSemanticCorpusEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-retrieval-staging-planes', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-gpu-sidecar-patch-tournament', classification: ROLE.EXECUTOR },
  ],
  competingArtifacts: [
    { artifact: 'codebase_chunks_768', classification: ROLE.DERIVED_PROJECTION, reason: 'Declared current online Qdrant projection; rebuildable, not canonical source truth.' },
    { artifact: 'codebase_chunks_768_v2', classification: ROLE.CHALLENGER, reason: 'Challenger until one-to-one source/representation lineage and caller/eval promotion are proven.' },
  ],
  evidenceRefs: ['docs/reports/current-semantic768-corpus-manifest-plan-v1.json', 'docs/reports/semantic-768-writer-ownership-v1.json', 'docs/reports/qdrant-collection-roles-v1.json'],
  blocksPromotion: currentSemanticCorpusEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [
    semanticCorpusGate?.status !== 'PROVEN' ? (semanticCorpusGate?.status ?? 'CURRENT_SEMANTIC_CORPUS_GATE_MISSING') : null,
    semanticOwnerEvidenceStatus !== EVIDENCE.PROVEN ? 'SEMANTIC_768_WRITER_AUTHORITY_NOT_PROVEN' : null,
    'ONE_TO_ONE_REVISION_QUALIFIED_CORPUS_RECONCILIATION_REQUIRED',
  ],
});

addResource({
  resource: 'RRF_SEARCH_RUNTIME_OWNER',
  coordinationChange: 'parent-atlas-retrieval-fusion-reachability',
  canonicalOwnerArtifact: 'SearchRuntime / combineViaRRF() canonical fusion owner with one logical vote per lane',
  ownershipStatus: changeExists(portfolio, 'parent-atlas-retrieval-fusion-reachability') ? OWNERSHIP.RESOLVED : OWNERSHIP.UNRESOLVED,
  evidenceStatus: /FUSION_OWNER|combineViaRRF\(\)/i.test(rrfLedgerText) ? EVIDENCE.PROVEN : EVIDENCE.PARTIAL,
  competingChanges: [
    { changeId: 'phase1-rrf-semantic-fusion', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-rrf-weight-table-lane-registry-consolidation', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-gpu-graph-vector-substrate', classification: ROLE.EXECUTOR },
  ],
  evidenceRefs: [relative(paths.rrfLedger), 'docs/reports/rrf-lane-weight-census-v1.json', 'docs/reports/rrf-real-caller-identity-envelope-v1.json'],
  blocksPromotion: false,
  blockers: [],
});

addResource({
  resource: 'RRF_CALLER_CONVERGENCE',
  coordinationChange: 'parent-atlas-retrieval-fusion-reachability',
  canonicalOwnerArtifact: 'All live RRF/fusion callers classified and delegated to the selected SearchRuntime owner without executor-as-lane inflation',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: rrfCallerEvidenceStatus,
  competingChanges: [],
  evidenceRefs: [relative(paths.rrfLedger), 'docs/reports/rrf-lane-weight-census-v1.json'],
  blocksPromotion: rrfCallerEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [
    !rrfCallerEvidenceComplete ? 'RRF_CALLER_COUNTS_NOT_EXTRACTABLE_FROM_CURRENT_LEDGER' : null,
    rrfCallerEvidence.unmapped !== null && rrfCallerEvidence.unmapped !== 0 ? `RRF_UNMAPPED_CALLERS:${rrfCallerEvidence.unmapped}/${rrfCallerEvidence.total}` : null,
    rrfCallerEvidence.executorAsLaneViolations !== null && rrfCallerEvidence.executorAsLaneViolations !== 0 ? `EXECUTOR_AS_LANE_VIOLATIONS:${rrfCallerEvidence.executorAsLaneViolations}` : null,
  ],
  notes: rrfCallerEvidence,
});

addResource({
  resource: 'CURRENT_JUDGMENT_CORPUS',
  coordinationChange: 'phase-2f1-real-evaluation-corpus',
  canonicalOwnerArtifact: 'Historical evaluation corpus retained as compatibility owner; current judgments must be rebound to current semantic/workspace/representation/query/judgment checksums',
  ownershipStatus: changeExists(portfolio, 'phase-2f1-real-evaluation-corpus') ? OWNERSHIP.RESOLVED : OWNERSHIP.UNRESOLVED,
  evidenceStatus: currentJudgmentEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-neural-prefill-encoder', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-best-fit-score-fabric', classification: ROLE.TEST_ONLY },
  ],
  evidenceRefs: ['docs/reports/golden-relevance-review-queue-validation-v1.json', 'docs/reports/retrieval-judgment-set-v1.json'],
  blocksPromotion: currentJudgmentEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [judgmentFinding?.status, judgmentFinding?.firstBlockingInvariant, 'CURRENT_SEMANTIC_CORPUS_CHECKSUM_BINDING_REQUIRED'],
});

addResource({
  resource: 'GRAPHIFY_PROMOTION_BOUNDARY',
  coordinationChange: 'parent-atlas-code-ingestion-pipeline',
  canonicalOwnerArtifact: 'Graphify producer/materializer lifecycle under PostgreSQL source/workspace authority',
  ownershipStatus: changeExists(portfolio, 'parent-atlas-code-ingestion-pipeline') ? OWNERSHIP.RESOLVED : OWNERSHIP.UNRESOLVED,
  evidenceStatus: graphifyEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-graphify-recovery-proof-ladder', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'ace-hyperrag-chr97-graphify-audit', classification: ROLE.TEST_ONLY },
    { changeId: 'parent-atlas-graph-analysis-contract', classification: ROLE.DERIVED_PROJECTION },
  ],
  evidenceRefs: [promotion?.graphifyExecution?.receiptPath, 'docs/reports/current-graphify-snapshot-authority-v1.json'],
  blocksPromotion: graphifyEvidenceStatus !== EVIDENCE.PROVEN,
  blockers: [!terminalGraphifyMatches ? (promotion?.graphifyExecution?.blocker ?? 'CURRENT_GRAPHIFY_EXECUTION_NOT_ADMITTED') : null],
});

addResource({
  resource: 'ACE_CONTEXT_ADMISSION',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'ACE context admission / ContextManifest coordination; canonical source data remains outside ACE',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: aceEvidenceStatus,
  competingChanges: [
    { changeId: 'parent-atlas-neural-prefill-encoder', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-ace-bitfrost-cache-correctness', classification: ROLE.CACHE },
  ],
  evidenceRefs: ['docs/reports/ace-live-dry-input-readiness-v2.json'],
  blocksPromotion: false,
  blockers: [aceFinding?.firstBlockingInvariant],
});

addResource({
  resource: 'BITFROST_RESIDENCY_CACHE',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'BitFrost/Valkey revision-qualified cache/residency state only',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: EVIDENCE.NA,
  competingChanges: [
    { changeId: 'parent-atlas-ace-bitfrost-cache-correctness', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-memory-architecture-freeze', classification: ROLE.COMPATIBILITY_LAYER },
  ],
  evidenceRefs: ['docs/reports/bitfrost-valkey-tracking-proof.json'],
  blocksPromotion: false,
  blockers: [],
});

addResource({
  resource: 'KAG_HYPERGRAPH_EVIDENCE',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'Derived KAG/hypergraph evidence expansion linked back to canonical source/packet identity',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: EVIDENCE.PARTIAL,
  competingChanges: [
    { changeId: 'parent-atlas-ontology-kernel', classification: ROLE.COMPATIBILITY_LAYER },
    { changeId: 'parent-atlas-grounded-knowledge-fabric', classification: ROLE.DERIVED_PROJECTION },
    { changeId: 'parent-atlas-telemetry-lowrank-recommendation-okf-integration', classification: ROLE.DERIVED_PROJECTION },
  ],
  evidenceRefs: ['docs/reports/atlas-hypergraph-current-arity-census-v1.json', 'docs/.okf/ontology-tuples.jsonl'],
  blocksPromotion: false,
  blockers: ['REVISION_QUALIFIED_ONTOLOGY_TUPLE_SOURCE_MISSING'],
});

addResource({
  resource: 'FROZEN_EVIDENCE_SNAPSHOT',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'Immutable evidence snapshot/checksum used by HEVAL and judgment replay',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: frozenEvidenceSnapshotStatus,
  competingChanges: [],
  evidenceRefs: ['docs/reports/parent-atlas-promotion-gates-v1.json'],
  blocksPromotion: false,
  blockers: [
    sourceEvidenceStatus !== EVIDENCE.PROVEN ? 'CURRENT_SOURCE_CLOSURE_NOT_PROVEN' : null,
    packetChunkEvidenceStatus !== EVIDENCE.PROVEN ? 'PACKET_CHUNK_LINEAGE_NOT_PROVEN' : null,
    currentSemanticCorpusEvidenceStatus !== EVIDENCE.PROVEN ? 'CURRENT_SEMANTIC_CORPUS_NOT_PROVEN' : null,
  ],
});

addResource({
  resource: 'HEVAL_EVALUATION_RECEIPTS',
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  canonicalOwnerArtifact: 'HEVAL/WikiSkill evaluation receipts over frozen evidence; no production mutation authority',
  ownershipStatus: OWNERSHIP.RESOLVED,
  evidenceStatus: frozenEvidenceSnapshotStatus === EVIDENCE.PROVEN && currentJudgmentEvidenceStatus === EVIDENCE.PROVEN
    ? EVIDENCE.PROVEN : EVIDENCE.BLOCKED,
  competingChanges: [
    { changeId: 'parent-atlas-best-fit-score-fabric', classification: ROLE.TEST_ONLY },
    { changeId: 'parent-atlas-neural-prefill-encoder', classification: ROLE.TEST_ONLY },
  ],
  evidenceRefs: ['docs/reports/atlas-heval-wikiskill-integration-v1.json'],
  blocksPromotion: false,
  blockers: [
    frozenEvidenceSnapshotStatus !== EVIDENCE.PROVEN ? 'FROZEN_EVIDENCE_SNAPSHOT_NOT_PROVEN' : null,
    currentJudgmentEvidenceStatus !== EVIDENCE.PROVEN ? 'CURRENT_JUDGMENT_CORPUS_NOT_PROVEN' : null,
  ],
});

const ownershipBlockingResources = resources.filter((row) => row.blocksPromotion && row.ownershipStatus !== OWNERSHIP.RESOLVED);
const evidenceBlockingResources = resources.filter((row) => row.blocksPromotion && ![EVIDENCE.PROVEN, EVIDENCE.NA].includes(row.evidenceStatus));
const duplicateOwnerViolations = resources.filter((row) => row.ownershipStatus === OWNERSHIP.COLLISION).length;
const unresolvedOwnerClaims = resources.filter((row) => row.ownershipStatus === OWNERSHIP.UNRESOLVED).length;
const criticalOwnerCollisions = duplicateOwnerViolations + unresolvedOwnerClaims;
const criticalEvidenceBlockers = evidenceBlockingResources.length;

const resource = (name) => resources.find((row) => row.resource === name);
const ownerResolved = (name) => resource(name)?.ownershipStatus === OWNERSHIP.RESOLVED;
const evidenceProven = (name) => resource(name)?.evidenceStatus === EVIDENCE.PROVEN;
const criticalOwnerCollisionsZero = criticalOwnerCollisions === 0;

const safeToBuildSemanticCohort = Boolean(
  criticalOwnerCollisionsZero
  && evidenceProven('SOURCE_WORKSPACE_AUTHORITY')
  && evidenceProven('PACKET_CHUNK_IDENTITY')
  && ownerResolved('SYMBOL_REPRESENTATION_REGISTRY')
  && evidenceProven('SYMBOL_REPRESENTATION_REGISTRY')
);

const safeToProject = Boolean(
  safeToBuildSemanticCohort
  && ownerResolved('SEMANTIC_768_CONTRACT')
  && evidenceProven('SEMANTIC_768_CONTRACT')
  && evidenceProven('CURRENT_SEMANTIC_CORPUS')
);

const safeToImportJudgments = Boolean(
  safeToProject
  && evidenceProven('CURRENT_JUDGMENT_CORPUS')
);

const safeToMigrateRrfCallers = Boolean(
  ownerResolved('RRF_SEARCH_RUNTIME_OWNER')
  && rrfCallerEvidenceComplete
  && rrfCallerEvidence.unmapped === 0
  && rrfCallerEvidence.executorAsLaneViolations === 0
);

const safeToRunHEVAL = Boolean(
  safeToImportJudgments
  && evidenceProven('FROZEN_EVIDENCE_SNAPSHOT')
);

const ownershipGateStatus = inputErrors.length > 0
  ? 'OWNER_COLLISION_RECONCILE_INPUT_BLOCKED'
  : criticalOwnerCollisionsZero
    ? 'OWNER_COLLISION_RECONCILE_PROVEN'
    : 'OWNER_COLLISION_RECONCILE_BLOCKED';

const promotionStatus = [safeToBuildSemanticCohort, safeToProject, safeToImportJudgments, safeToMigrateRrfCallers, safeToRunHEVAL].every(Boolean)
  ? 'PROMOTION_BOARD_READY'
  : 'PROMOTION_BOARD_BLOCKED';

const report = {
  schema: 'atlas.promotion-critical-owner-reconciliation.v2',
  generatedAt: new Date().toISOString(),
  gate: 'OWNER-COLLISION-RECONCILE-01',
  promotionBoardGate: 'PROMOTION-BOARD-RECONCILE-02',
  ownershipGateStatus,
  promotionStatus,
  readOnly: true,
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  policy: {
    mcpDefault: portfolio?.policy?.mcpDefault ?? 'READ_ONLY',
    canonicalOwner: portfolio?.policy?.canonicalOwner ?? 'POSTGRESQL',
    derivedStores: portfolio?.policy?.derivedStores ?? ['QDRANT', 'NEO4J', 'GPU', 'CACHE', 'MODEL_ARTIFACT'],
    automaticMutation: false,
  },
  inputs: {
    portfolio: relative(paths.portfolio),
    promotionGates: relative(paths.promotionGates),
    rrfLedger: relative(paths.rrfLedger),
    aceLedger: relative(paths.aceLedger),
  },
  portfolio: portfolio ? {
    generatedAt: portfolio.generatedAt ?? null,
    changeCount: portfolio.summary?.changeCount ?? null,
    taskTotal: portfolio.summary?.taskTotal ?? null,
    taskComplete: portfolio.summary?.taskComplete ?? null,
    relationCount: portfolio.summary?.relationCount ?? null,
    ownerCollisionCount: portfolio.summary?.ownerCollisionCount ?? null,
    ownerCollisionPriorityCounts: portfolio.summary?.ownerCollisionPriorityCounts ?? null,
    mutationRecommendedCount: portfolio.summary?.mutationRecommendedCount ?? null,
  } : null,
  summary: {
    criticalResources: resources.length,
    criticalOwnerCollisions,
    duplicateOwnerViolations,
    unresolvedOwnerClaims,
    criticalEvidenceBlockers,
    ownershipBlockingResources: ownershipBlockingResources.map((row) => row.resource),
    evidenceBlockingResources: evidenceBlockingResources.map((row) => row.resource),
  },
  liveEvidence: {
    workspaceAdmitted,
    terminalGraphifyMatches,
    rrfCallerEvidence,
    symbolRegistryEvidence,
  },
  resources,
  readiness: {
    safeToBuildSemanticCohort,
    safeToProject,
    safeToImportJudgments,
    safeToMigrateRrfCallers,
    safeToRunHEVAL,
  },
  inputErrors,
  writesPerformed: false,
  databaseWrites: 0,
  qdrantWrites: 0,
  neo4jWrites: 0,
  graphifyWrites: 0,
  cacheWrites: 0,
  modelWrites: 0,
  judgmentWrites: 0,
  symbolWrites: 0,
  representationWrites: 0,
  dockerMutations: 0,
  projectionWrites: 0,
  nextGate: ownershipGateStatus !== 'OWNER_COLLISION_RECONCILE_PROVEN'
    ? 'REVIEW_PROMOTION_CRITICAL_OWNER_BLOCKERS'
    : !safeToBuildSemanticCohort
      ? 'CURRENT_SOURCE_PACKET_SYMBOL_AUTHORITY_CLOSURE'
      : !safeToProject
        ? 'SEMANTIC-CORPUS-ADMISSION-01'
        : !safeToImportJudgments
          ? 'GOLDEN-REVIEW-CORPUS-02'
          : !safeToMigrateRrfCallers
            ? 'RRF-CALLER-CLASSIFICATION-02'
            : !safeToRunHEVAL
              ? 'HEVAL_FROZEN_EVIDENCE_CLOSURE'
              : 'PROMOTION-BOARD-RECONCILE-03',
};

if (!noReport) {
  fs.mkdirSync(path.dirname(paths.report), { recursive: true });
  fs.writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  ownershipGateStatus,
  promotionStatus,
  summary: report.summary,
  liveEvidence: report.liveEvidence,
  readiness: report.readiness,
  nextGate: report.nextGate,
  reportPath: noReport ? null : relative(paths.report),
  writesPerformed: false,
  inputErrors,
}, null, 2));

// A blocked promotion board is expected evidence, but still exits nonzero so CI/
// operators cannot accidentally interpret the audit as promotion authorization.
if (inputErrors.length > 0) process.exitCode = 3;
else if (promotionStatus !== 'PROMOTION_BOARD_READY') process.exitCode = 2;
