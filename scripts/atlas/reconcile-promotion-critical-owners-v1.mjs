#!/usr/bin/env node
/**
 * OWNER-COLLISION-RECONCILE-01 -- READ ONLY.
 *
 * Consumes the OpenSpec portfolio readiness report and classifies ONLY the
 * critical Parent Atlas promotion spine. It is a promotion-board input, not a
 * new runtime owner and not a datastore materializer.
 *
 * No Postgres/Qdrant/Neo4j/cache/model/projection writes are performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const portfolioArg = process.argv.find((arg) => arg.startsWith('--portfolio='));
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
const noReport = process.argv.includes('--no-report');
const portfolioPath = path.resolve(
  root,
  portfolioArg?.slice('--portfolio='.length)
    ?? 'docs/reports/openspec-portfolio-implementation-readiness-v1.json',
);
const reportPath = path.resolve(
  root,
  outArg?.slice('--out='.length)
    ?? 'docs/reports/promotion-critical-owner-reconciliation-v1.json',
);

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

const criticalResources = [
  {
    resource: 'SOURCE_WORKSPACE_AUTHORITY',
    selectedOwnerChange: 'parent-atlas-ace-rlm-bitfrost-integration',
    selectedOwnerArtifact: 'PostgreSQL canonical source/workspace lineage + current source authority receipts',
    competitors: [
      ['parent-atlas-code-ingestion-pipeline', ROLE.COMPATIBILITY_LAYER, 'Graphify/source ingestion producer; cannot supersede canonical source/workspace truth.'],
      ['parent-atlas-graphify-recovery-proof-ladder', ROLE.COMPATIBILITY_LAYER, 'Recovery/projection proof ladder; not source authority.'],
      ['parent-atlas-canonical-directory-ingestion-fabric', ROLE.DERIVED_PROJECTION, 'Directory/search projection over canonical source identity.'],
      ['parent-atlas-unordered-execution-contract', ROLE.COMPATIBILITY_LAYER, 'Execution ordering contract; not source authority.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'Promotion requires one revision-qualified source/workspace authority before any derived projection can be admitted.',
  },
  {
    resource: 'PACKET_CHUNK_IDENTITY',
    selectedOwnerChange: 'parent-atlas-ace-rlm-bitfrost-integration',
    selectedOwnerArtifact: 'PostgreSQL atlas_packets + atlas_packet_chunk_lineage + existing canonical chunk identity contract',
    competitors: [
      ['parent-atlas-graph-retrieval-proof', ROLE.COMPATIBILITY_LAYER, 'Graph identity/join proofs consume packet/chunk identity; they do not own it.'],
      ['parent-atlas-candidate-feature-execution-fabric', ROLE.DERIVED_PROJECTION, 'Candidate ordinals/features are derived from canonical packet/chunk identity.'],
      ['add-packet-ontology-registry', ROLE.UNRESOLVED, 'Proposes packet schema ownership while its portfolio entry has no evidence; requires separate migration/owner reconciliation before apply.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'Canonical packet/chunk identity must remain PostgreSQL-owned and must not be minted by graph/vector/feature layers.',
  },
  {
    resource: 'SEMANTIC_768_CONTRACT',
    selectedOwnerChange: 'parent-atlas-semantic-768-canonical-contract',
    selectedOwnerArtifact: 'semantic_768 canonical representation contract + Postgres exact vector lineage',
    competitors: [
      ['parent-atlas-semantic-512-canonicalization', ROLE.CHALLENGER, '512/MRL and latent routing views are derived/challenger representations, not semantic_768 owner.'],
      ['parent-atlas-768-dim-migration', ROLE.COMPATIBILITY_LAYER, 'Migration work may transform storage but cannot establish a second semantic identity owner.'],
      ['parent-atlas-gpu-graph-vector-substrate', ROLE.EXECUTOR, 'cuVS/CAGRA are semantic executors/challengers, not canonical semantic ownership.'],
      ['parent-atlas-topology-representation-admission', ROLE.DERIVED_PROJECTION, 'Topology/latent representations are derived feature artifacts.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'One canonical semantic_768 contract is required; Qdrant/GPU/latent representations remain projections or executors.',
  },
  {
    resource: 'SEMANTIC_ONLINE_COLLECTION',
    selectedOwnerChange: 'parent-atlas-semantic-768-canonical-contract',
    selectedOwnerArtifact: 'codebase_chunks_768 current online semantic projection; codebase_chunks_768_v2 remains challenger until lineage/caller/QRELS promotion',
    competitors: [
      ['parent-atlas-retrieval-staging-planes', ROLE.COMPATIBILITY_LAYER, 'Staging plane may route/query collections but does not own semantic identity.'],
      ['parent-atlas-gpu-sidecar-patch-tournament', ROLE.EXECUTOR, 'GPU sidecar is an executor/challenger.'],
    ],
    blockingIfOwnerMissing: false,
    reason: 'Online Qdrant corpus is rebuildable projection state; promotion still requires canonical semantic/source lineage.',
  },
  {
    resource: 'RRF_SEARCH_RUNTIME',
    selectedOwnerChange: 'parent-atlas-retrieval-fusion-reachability',
    selectedOwnerArtifact: 'SearchRuntime + combineViaRRF() fusion ownership; one logical vote per lane',
    competitors: [
      ['phase1-rrf-semantic-fusion', ROLE.COMPATIBILITY_LAYER, 'Historical/parallel RRF implementation surface; must converge behind SearchRuntime.'],
      ['parent-atlas-rrf-weight-table-lane-registry-consolidation', ROLE.COMPATIBILITY_LAYER, 'Weight/lane registry feeds selected fusion owner; not a second fusion runtime.'],
      ['parent-atlas-gpu-graph-vector-substrate', ROLE.EXECUTOR, 'GPU retrieval is executor provenance, never an extra semantic vote.'],
      ['parent-atlas-retrieval-staging-planes', ROLE.COMPATIBILITY_LAYER, 'Staging/execution integration must converge through SearchRuntime.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'Promotion requires a single fusion/runtime owner and zero executor-as-lane vote inflation.',
  },
  {
    resource: 'CURRENT_EVALUATION_CORPUS',
    selectedOwnerChange: 'phase-2f1-real-evaluation-corpus',
    selectedOwnerArtifact: 'historical evaluation corpus contract; must be rebound to current semantic corpus/workspace/representation/query/judgment checksums before use',
    selectedOwnerRole: ROLE.COMPATIBILITY_LAYER,
    forceUnresolved: true,
    competitors: [
      ['parent-atlas-neural-prefill-encoder', ROLE.COMPATIBILITY_LAYER, 'Current QRELS/review-pool work is stricter and should supply current revision-bound judgments, not create an unrelated second corpus owner.'],
      ['parent-atlas-best-fit-score-fabric', ROLE.TEST_ONLY, 'Ranking evaluation consumes frozen judgments; does not own the corpus.'],
      ['parent-atlas-graph-analysis-contract', ROLE.TEST_ONLY, 'Structural proxy/golden evaluation is separate derived evaluation evidence.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'Historical evaluation tasks predate current corpus binding and must not run blindly; a current corpus rebind is still required.',
  },
  {
    resource: 'GRAPHIFY_PROMOTION_BOUNDARY',
    selectedOwnerChange: 'parent-atlas-code-ingestion-pipeline',
    selectedOwnerArtifact: 'Graphify producer/materializer lifecycle under canonical source authority',
    competitors: [
      ['parent-atlas-graphify-recovery-proof-ladder', ROLE.COMPATIBILITY_LAYER, 'Recovery/admission receipts verify Graphify; they do not become a second producer owner.'],
      ['ace-hyperrag-chr97-graphify-audit', ROLE.TEST_ONLY, 'Audit evidence only.'],
      ['parent-atlas-graph-analysis-contract', ROLE.DERIVED_PROJECTION, 'Graph analysis consumes Graphify output and emits derived graph revisions.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'Graphify may produce/materialize but cannot supersede source/workspace authority.',
  },
  {
    resource: 'ACE_CONTEXT_ADMISSION',
    selectedOwnerChange: 'parent-atlas-ace-rlm-bitfrost-integration',
    selectedOwnerArtifact: 'ACE context admission + ContextManifest handoff receipts',
    competitors: [
      ['parent-atlas-ace-bitfrost-cache-correctness', ROLE.CACHE, 'Cache/prefill correctness supports ACE but does not own source/context truth.'],
      ['parent-atlas-ace-radix-residency', ROLE.CACHE, 'Residency/radix ordering is derived hot-state behavior.'],
      ['parent-atlas-neural-prefill-encoder', ROLE.COMPATIBILITY_LAYER, 'Prefill consumes ContextManifest identity; it must not replace ACE/source authority.'],
    ],
    blockingIfOwnerMissing: true,
    reason: 'ACE coordinates context admission but is not canonical source storage.',
  },
  {
    resource: 'BITFROST_RESIDENCY_CACHE',
    selectedOwnerChange: 'parent-atlas-ace-rlm-bitfrost-integration',
    selectedOwnerArtifact: 'BitFrost/Valkey revision-qualified hot residency/cache',
    selectedOwnerRole: ROLE.CACHE,
    competitors: [
      ['parent-atlas-ace-bitfrost-cache-correctness', ROLE.COMPATIBILITY_LAYER, 'Cache correctness/change ledger; selected runtime remains cache-only.'],
      ['parent-atlas-memory-architecture-freeze', ROLE.COMPATIBILITY_LAYER, 'Memory policy defines residency constraints, not canonical data ownership.'],
    ],
    blockingIfOwnerMissing: false,
    reason: 'BitFrost is explicitly cache/residency state and cannot promote canonical truth.',
  },
  {
    resource: 'KAG_HYPERGRAPH_EVIDENCE',
    selectedOwnerChange: 'parent-atlas-ace-rlm-bitfrost-integration',
    selectedOwnerArtifact: 'KAG/hypergraph discovery and n-ary evidence receipts linked into canonical evidence; no packet/source ownership',
    selectedOwnerRole: ROLE.DERIVED_PROJECTION,
    competitors: [
      ['parent-atlas-ontology-kernel', ROLE.COMPATIBILITY_LAYER, 'Ontology kernel validates/resolves evidence semantics; it does not own source/packet identity.'],
      ['parent-atlas-grounded-knowledge-fabric', ROLE.DERIVED_PROJECTION, 'Grounded knowledge/page state is downstream evidence projection.'],
      ['parent-atlas-telemetry-lowrank-recommendation-okf-integration', ROLE.DERIVED_PROJECTION, 'N-ary event/ontology enrichments are derived evidence.'],
    ],
    blockingIfOwnerMissing: false,
    reason: 'KAG/hypergraph expands evidence and relations but must not promote canonical packet/source identity.',
  },
  {
    resource: 'HEVAL_EVALUATION_RECEIPTS',
    selectedOwnerChange: 'parent-atlas-ace-rlm-bitfrost-integration',
    selectedOwnerArtifact: 'HEVAL/WikiSkill evaluation receipts over frozen evidence',
    selectedOwnerRole: ROLE.TEST_ONLY,
    competitors: [
      ['parent-atlas-best-fit-score-fabric', ROLE.TEST_ONLY, 'Ranking experiments consume evaluation evidence; no production mutation authority.'],
      ['parent-atlas-neural-prefill-encoder', ROLE.TEST_ONLY, 'Prefill quality gate consumes frozen judgments/evidence.'],
    ],
    blockingIfOwnerMissing: false,
    reason: 'HEVAL produces evaluation evidence only and cannot mutate production ownership.',
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function existsChange(portfolio, changeId) {
  return Array.isArray(portfolio.activeChanges)
    && portfolio.activeChanges.some((entry) => entry?.changeId === changeId);
}

function activeChange(portfolio, changeId) {
  return portfolio.activeChanges?.find((entry) => entry?.changeId === changeId) ?? null;
}

let portfolio = null;
let inputError = null;
try {
  if (!fs.existsSync(portfolioPath)) throw new Error(`PORTFOLIO_REPORT_MISSING:${path.relative(root, portfolioPath)}`);
  portfolio = readJson(portfolioPath);
  if (portfolio?.schema !== 'atlas.openspec-portfolio-implementation-readiness.v1') {
    throw new Error(`PORTFOLIO_SCHEMA_UNEXPECTED:${portfolio?.schema ?? 'missing'}`);
  }
  if (portfolio?.readOnly !== true) throw new Error('PORTFOLIO_NOT_READ_ONLY');
  if (portfolio?.policy?.automaticMutation !== false) throw new Error('PORTFOLIO_AUTOMATIC_MUTATION_POLICY_UNSAFE');
} catch (error) {
  inputError = error instanceof Error ? error.message : String(error);
}

const resources = [];
if (portfolio) {
  for (const definition of criticalResources) {
    const selectedPresent = existsChange(portfolio, definition.selectedOwnerChange);
    const selectedChange = activeChange(portfolio, definition.selectedOwnerChange);
    const selectedOwnerRole = definition.selectedOwnerRole ?? ROLE.CANONICAL_OWNER;
    const competingChanges = definition.competitors.map(([changeId, classification, reason]) => ({
      changeId,
      presentInPortfolio: existsChange(portfolio, changeId),
      classification,
      reason,
    }));

    let classification = selectedOwnerRole;
    let blocking = false;
    let reason = definition.reason;

    if (!selectedPresent && definition.blockingIfOwnerMissing) {
      classification = ROLE.UNRESOLVED;
      blocking = true;
      reason = `Selected owner change missing from portfolio. ${definition.reason}`;
    }
    if (definition.forceUnresolved) {
      classification = ROLE.UNRESOLVED;
      blocking = true;
    }

    const duplicateOwnerClaims = competingChanges.filter((entry) => entry.classification === ROLE.DUPLICATE_OWNER_VIOLATION && entry.presentInPortfolio);
    if (duplicateOwnerClaims.length > 0) {
      classification = ROLE.DUPLICATE_OWNER_VIOLATION;
      blocking = true;
      reason = `Competing canonical owner claim(s): ${duplicateOwnerClaims.map((entry) => entry.changeId).join(', ')}`;
    }

    resources.push({
      resource: definition.resource,
      selectedOwnerChange: definition.selectedOwnerChange,
      selectedOwnerArtifact: definition.selectedOwnerArtifact,
      selectedOwnerRole,
      selectedOwnerPresent: selectedPresent,
      selectedOwnerStatus: selectedChange?.status ?? null,
      competingChanges,
      classification,
      evidenceRefs: selectedChange?.referencedReports ?? [],
      blocking,
      reason,
    });
  }
}

const duplicateOwnerViolations = resources.filter((row) => row.classification === ROLE.DUPLICATE_OWNER_VIOLATION).length;
const unresolvedOwnerClaims = resources.filter((row) => row.classification === ROLE.UNRESOLVED).length;
const criticalOwnerCollisions = resources.filter((row) => row.blocking).length;
const criticalCanonicalResources = resources.length;

const sourceAuthorityProven = resources.find((row) => row.resource === 'SOURCE_WORKSPACE_AUTHORITY')?.classification === ROLE.CANONICAL_OWNER;
const semanticCorpusOwnerProven = resources.find((row) => row.resource === 'SEMANTIC_768_CONTRACT')?.classification === ROLE.CANONICAL_OWNER;
const currentEvaluationCorpusCompatible = resources.find((row) => row.resource === 'CURRENT_EVALUATION_CORPUS')?.classification !== ROLE.UNRESOLVED;
const rrfOwnerProven = resources.find((row) => row.resource === 'RRF_SEARCH_RUNTIME')?.classification === ROLE.CANONICAL_OWNER;

const safeToProject = Boolean(sourceAuthorityProven && semanticCorpusOwnerProven && criticalOwnerCollisions === 0);
const safeToImportJudgments = Boolean(safeToProject && currentEvaluationCorpusCompatible);
const safeToMigrateRrfCallers = Boolean(rrfOwnerProven && duplicateOwnerViolations === 0 && unresolvedOwnerClaims === 0);
const safeToRunHEVAL = Boolean(sourceAuthorityProven && semanticCorpusOwnerProven && currentEvaluationCorpusCompatible);

const status = inputError
  ? 'OWNER_COLLISION_RECONCILE_INPUT_BLOCKED'
  : duplicateOwnerViolations === 0 && unresolvedOwnerClaims === 0
    ? 'OWNER_COLLISION_RECONCILE_PROVEN'
    : 'OWNER_COLLISION_RECONCILE_BLOCKED';

const report = {
  schema: 'atlas.promotion-critical-owner-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  gate: 'OWNER-COLLISION-RECONCILE-01',
  status,
  readOnly: true,
  coordinationChange: 'parent-atlas-ace-rlm-bitfrost-integration',
  policy: {
    mcpDefault: portfolio?.policy?.mcpDefault ?? 'READ_ONLY',
    canonicalOwner: portfolio?.policy?.canonicalOwner ?? 'POSTGRESQL',
    derivedStores: portfolio?.policy?.derivedStores ?? ['QDRANT', 'NEO4J', 'GPU', 'CACHE', 'MODEL_ARTIFACT'],
    automaticMutation: false,
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
  criticalCanonicalResources,
  criticalOwnerCollisions,
  duplicateOwnerViolations,
  unresolvedOwnerClaims,
  resources,
  readiness: {
    safeToProject,
    safeToImportJudgments,
    safeToMigrateRrfCallers,
    safeToRunHEVAL,
  },
  blockers: resources.filter((row) => row.blocking).map((row) => ({ resource: row.resource, classification: row.classification, reason: row.reason })),
  inputError,
  storageFindingsInScope: false,
  writesPerformed: false,
  databaseWrites: 0,
  qdrantWrites: 0,
  neo4jWrites: 0,
  cacheWrites: 0,
  modelWrites: 0,
  projectionWrites: 0,
  nextGate: status === 'OWNER_COLLISION_RECONCILE_PROVEN'
    ? 'PROMOTION-BOARD-RECONCILE-02'
    : 'REVIEW_PROMOTION_CRITICAL_OWNER_BLOCKERS',
};

if (!noReport) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  status,
  criticalCanonicalResources,
  criticalOwnerCollisions,
  duplicateOwnerViolations,
  unresolvedOwnerClaims,
  readiness: report.readiness,
  reportPath: noReport ? null : path.relative(root, reportPath),
  writesPerformed: false,
  inputError,
}, null, 2));

if (status !== 'OWNER_COLLISION_RECONCILE_PROVEN') process.exitCode = 2;
