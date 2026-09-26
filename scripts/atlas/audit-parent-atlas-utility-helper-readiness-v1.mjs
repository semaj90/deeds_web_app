#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const reportsDir = path.resolve(process.argv[2] ?? path.join(process.cwd(), 'docs/reports'));
const outputPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'parent-atlas-utility-helper-readiness-v1.json'));

function read(name) {
  try { return JSON.parse(fs.readFileSync(path.join(reportsDir, name), 'utf8')); }
  catch { return null; }
}

function readTmp(name) {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), '.tmp', name), 'utf8')); }
  catch { return null; }
}

const capability = read('parent-atlas-capability-census-v1.json');
const topic = read('topic-identity-readiness-v1.json');
const okf = read('okf-claim-freshness-v1.json');
const astContext = read('okf-ast-context-classification-v1.json');
const schemaProof = read('okf-schema-boundaries-v1.json');
const okfV02 = read('okf-v02-bundle-audit-v1.json');
const openwikiBoundary = read('openwiki-review-input-boundary-v1.json');
const workItemFixture = read('okf-work-item-fixture-v1.json');
const gapRecommendations = read('okf-gap-recommendations-v1.json');
const runtime = read('atlas-runtime-readiness-v1.json');
const tournament = read('patch-tournament-worktree-seam-v1.json');
const tournamentReplay = read('patch-tournament-replay-v1.json');
const centroid = read('ace-bitfrost-centroid-alignment-v1.json');
const astCanary = read('ast-canary-readiness-v1.json');
const ontologyDecision = read('ontology-population-decision-v1.json');
const packetScope = read('packet-source-scope-v1.json');
const structuralProof = read('structural-intelligence-integration-proof.json');
const nlp = readTmp('atlas-nlp-analysis-smoke-v1.json');

const capabilityMap = new Map((capability?.capabilities ?? []).map((item) => [item.id, item]));
const cap = (id) => ({
  id,
  state: capabilityMap.get(id)?.state ?? 'UNPROVEN',
  criticality: capabilityMap.get(id)?.criticality ?? 'UNKNOWN'
});

const helpers = [
  {
    id: 'TOPIC_IDENTITY',
    owner: 'topic-identity-v1',
    state: topic?.status ?? 'UNPROVEN',
    evidence: topic ? 'topic-identity-readiness-v1.json' : null,
    details: topic?.summary ?? null
  },
  {
    id: 'OKF_CLAIM_FRESHNESS',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: okf?.summary?.validClaims > 0 ? 'DERIVED_CLAIMS_PRESENT' : 'REVIEW_REQUIRED',
    evidence: okf ? 'okf-claim-freshness-v1.json' : null,
    details: okf?.summary ?? null
  },
  {
    id: 'OKF_AST_CONTEXT_CLASSIFICATION',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: astContext?.status ?? 'UNPROVEN',
    evidence: astContext ? 'okf-ast-context-classification-v1.json' : null,
    details: astContext ? {
      filesScanned: astContext.filesScanned,
      findings: astContext.findings,
      dispositionCounts: astContext.dispositionCounts
    } : null
  },
  {
    id: 'OKF_SCHEMA_PROOF',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: schemaProof?.status ?? 'UNPROVEN',
    evidence: schemaProof ? 'okf-schema-boundaries-v1.json' : null,
    gan: schemaProof?.gan ?? null,
    invariants: schemaProof?.invariants ?? null
  },
  {
    id: 'OKF_V02_BUNDLE_PROFILE',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: okfV02?.status ?? 'UNPROVEN',
    evidence: okfV02 ? 'okf-v02-bundle-audit-v1.json' : null,
    filesScanned: okfV02?.filesScanned ?? 0,
    validFiles: okfV02?.validFiles ?? 0,
    manifestDrift: okfV02?.manifestDrift ?? null
  },
  {
    id: 'OPENWIKI_INPUT_BOUNDARY',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: openwikiBoundary?.status ?? 'UNPROVEN',
    evidence: openwikiBoundary ? 'openwiki-review-input-boundary-v1.json' : null,
    eligibleCount: openwikiBoundary?.eligibleCount ?? 0,
    excludedCount: openwikiBoundary?.excludedCount ?? 0,
    runtimeInvoked: openwikiBoundary?.openwikiRuntimeInvoked ?? false
  },
  {
    id: 'OKF_WORK_ITEM_FIXTURE',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: workItemFixture?.status ?? 'UNPROVEN',
    evidence: workItemFixture ? 'okf-work-item-fixture-v1.json' : null,
    persistence: workItemFixture?.persistence ?? 'UNKNOWN',
    checks: workItemFixture?.checks ?? null
  },
  {
    id: 'OKF_GAP_RECOMMENDATIONS',
    owner: 'parent-atlas-okf-knowledge-layers',
    state: gapRecommendations?.status ?? 'UNPROVEN',
    evidence: gapRecommendations ? 'okf-gap-recommendations-v1.json' : null,
    records: gapRecommendations?.records?.length ?? 0,
    createdKanbanTasks: gapRecommendations?.delivery?.createdKanbanTasks ?? false
  },
  {
    id: 'NLP_ANALYSIS_PIPELINE',
    owner: 'python/miniforge_nlp_sidecar_v2.py',
    state: nlp?.status ?? 'UNPROVEN',
    evidence: nlp ? '.tmp/atlas-nlp-analysis-smoke-v1.json' : null,
    checks: nlp?.checks ? {
      pythonSidecarTests: nlp.checks.pythonSidecarTests?.passed === true,
      ontologyAdmission: nlp.checks.ontologyAdmission?.passed === true,
      okfPydanticFixture: nlp.checks.okfPydanticFixture?.status ?? 'UNKNOWN',
      hmmAgenticError: nlp.checks.hmmAgenticError?.status ?? 'UNKNOWN',
      hmmTestSignal: nlp.checks.hmmAgenticError?.testSignal?.status ?? 'UNKNOWN'
    } : null
  },
  { id: 'DOMAIN_TAXONOMY', owner: 'V5 capability census', ...cap('TOPIC_CONCEPT_DOMAIN_TAXONOMY') },
  { id: 'AST_GRAPHIFY_RELATIONS', owner: 'V5 capability census', ...cap('GRAPHIFY_RELATIONS') },
  { id: 'ACE_PACKET', owner: 'V5 capability census', ...cap('ACE_PACKET_V1') },
  { id: 'VALKEY_CENTROID_CACHE', owner: 'V5 capability census', ...cap('VALKEY_CENTROID_CACHE') },
  { id: 'BITFROST_BUCKET_WARMING', owner: 'V5 capability census', ...cap('BITFROST_BUCKET_WARMING') },
  {
    id: 'ACE_CENTROID_ALIGNMENT',
    owner: 'ace-bitfrost-centroid-alignment-v1',
    state: centroid?.status ?? 'UNPROVEN',
    evidence: centroid ? 'ace-bitfrost-centroid-alignment-v1.json' : null,
    nextGate: centroid?.safeNextGate ?? null
  },
  {
    id: 'TOURNAMENT_HELPER',
    owner: tournament?.owner?.planner ?? 'patch-tournament.ts',
    state: tournament?.status ?? 'UNPROVEN',
    evidence: tournament ? 'patch-tournament-worktree-seam-v1.json' : null,
    replayStatus: tournamentReplay?.status ?? null,
    nextGate: tournament?.nextGate ?? tournamentReplay?.nextGate ?? null
  },
  {
    id: 'AST_CANARY_READINESS',
    owner: 'parent-atlas-nlp-sidecar-feature-compiler',
    state: astCanary?.status ?? 'UNPROVEN',
    evidence: astCanary ? 'ast-canary-readiness-v1.json' : null,
    blockers: astCanary?.blockers ?? [],
    nextGate: astCanary?.nextGate ?? null,
    canonicalAuthority: astCanary?.canonicalAuthority ?? false,
    writesPerformed: astCanary?.writesPerformed ?? false
  },
  {
    id: 'STRUCTURAL_PROVENANCE_RUNTIME',
    owner: 'parent-atlas-nlp-sidecar-feature-compiler',
    state: structuralProof?.status === 'PROVEN_WITH_LIVE_8095' ? 'PROVEN_LIVE_RUNTIME_NONCANONICAL' : structuralProof?.status ?? 'UNPROVEN',
    evidence: structuralProof ? 'structural-intelligence-integration-proof.json' : null,
    live8095: structuralProof?.status === 'PROVEN_WITH_LIVE_8095',
    canonicalAuthority: false,
    writesPerformed: false
  },
  {
    id: 'ONTOLOGY_POPULATION_DECISION',
    owner: 'parent-atlas-nlp-sidecar-feature-compiler',
    state: ontologyDecision?.status ?? 'UNPROVEN',
    evidence: ontologyDecision ? 'ontology-population-decision-v1.json' : null,
    conceptRows: ontologyDecision?.ontologyConceptRows ?? 0,
    relationRows: ontologyDecision?.ontologyRelationRows ?? 0,
    unresolvedTuples: ontologyDecision?.unresolvedTuples ?? null,
    nextGate: ontologyDecision?.nextGate ?? null,
    canonicalAuthority: ontologyDecision?.canonicalAuthority ?? false,
    writesPerformed: ontologyDecision?.writesPerformed ?? false
  },
  {
    id: 'PACKET_SOURCE_SCOPE',
    owner: 'parent-atlas-retrieval-lineage-dag-convergence',
    state: packetScope?.status ?? 'UNPROVEN',
    evidence: packetScope ? 'packet-source-scope-v1.json' : null,
    folderCount: packetScope?.folderCount ?? 0,
    packetRows: packetScope?.totals?.packetRows ?? 0,
    exactAdmittedBindingMatches: packetScope?.totals?.exactAdmittedBindingMatches ?? 0,
    operatorDispositionRequired: packetScope?.operatorDispositionRequired ?? false,
    noAutomaticFolderPromotion: packetScope?.noAutomaticFolderPromotion ?? true,
    canonicalAuthority: packetScope?.canonicalAuthority ?? false,
    writesPerformed: packetScope?.writesPerformed ?? false
  },
  {
    id: 'RUNTIME_READINESS',
    owner: 'atlas-runtime-readiness-v1',
    state: runtime?.summary?.livePromotionReady ? 'PROVEN' : runtime ? 'WAITING' : 'UNPROVEN',
    evidence: runtime ? 'atlas-runtime-readiness-v1.json' : null,
    summary: runtime?.summary ?? null
  }
];

const output = {
  schema: 'atlas.parent-atlas-utility-helper-readiness.v1',
  status: helpers.every((helper) => ['PROVEN', 'PROVEN_LIVE_RUNTIME_NONCANONICAL', 'DERIVED_TOPIC_IDENTITIES_PROVEN', 'DERIVED_CLAIMS_PRESENT', 'READ_ONLY_AST_CONTEXT_AUDIT', 'OKF_SCHEMA_BOUNDARIES_PROVEN', 'OPENWIKI_INPUT_BOUNDARY_PROVEN', 'OKF_WORK_ITEM_FIXTURE_PROVEN', 'OKF_GAP_RECOMMENDATIONS_DERIVED'].includes(helper.state))
    ? 'UTILITY_HELPERS_PROVEN'
    : 'UTILITY_HELPERS_PARTIAL_WITH_GATES',
  helpers,
  invariants: [
    'TOPIC_UUID_AND_TITLE_ID_REMAIN_DISTINCT',
    'OKF_IS_DERIVED_DOCUMENTATION_NOT_CANONICAL_IDENTITY',
    'OKF_AST_CONTEXT_IS_ADVISORY_ONLY',
    'AST_GRAPHIFY_AND_CLUSTERS_ARE_NAVIGATION_OR_PROJECTION_EVIDENCE',
    'AST_CANARY_REQUIRES_CURRENT_SOURCE_AUTHORITY_AND_CONFLICT_DISPOSITION',
    'ONTOLOGY_POPULATION_REQUIRES_SOURCE_AUTHORITY_AND_CANONICAL_VOCABULARY',
    'PACKET_FOLDER_SCOPE_REQUIRES_OPERATOR_DISPOSITION',
    'ACE_BITFROST_VALKEY_REQUIRE_REVISIONED_READBACK',
    'TOURNAMENT_REQUIRES_ISOLATED_EXECUTION_AND_HUMAN_APPROVAL',
    'NO_HELPER_RECEIPT_AUTHORIZES_CANONICAL_WRITES'
  ],
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  schema: output.schema,
  status: output.status,
  helpers: helpers.length,
  waiting: helpers.filter((helper) => !['PROVEN', 'PROVEN_LIVE_RUNTIME_NONCANONICAL', 'DERIVED_TOPIC_IDENTITIES_PROVEN', 'DERIVED_CLAIMS_PRESENT', 'READ_ONLY_AST_CONTEXT_AUDIT', 'OKF_SCHEMA_BOUNDARIES_PROVEN', 'OPENWIKI_INPUT_BOUNDARY_PROVEN', 'OKF_WORK_ITEM_FIXTURE_PROVEN', 'OKF_GAP_RECOMMENDATIONS_DERIVED'].includes(helper.state)).length,
  writesPerformed: false
}, null, 2));
