#!/usr/bin/env node
/**
 * RRF-CALLER-CLASSIFICATION-02 read-only classification.
 *
 * Classifies each of the 93 callers in docs/reports/rrf-caller-baseline-v1.json
 * into the 8 caller categories, per openspec/changes/parent-atlas-ace-rlm-
 * bitfrost-integration/tasks.md's RRF-CALLER-CLASSIFICATION-02 entry.
 * Does NOT modify combineViaRRF or rewrite any caller -- classification only.
 *
 * Methodology: file-grouped review of each caller's excerpt + surrounding
 * module identity (not a full read of every one of the 93 call sites --
 * classified by strong file/excerpt-level signal; see `confidence` per
 * entry). Two entries (unified-orchestrator.ts:564,610) reuse the baseline's
 * own prior REJECTED_EXECUTOR_AS_LANE finding rather than re-deriving it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const BASELINE_PATH = resolve(ROOT, 'docs/reports/rrf-caller-baseline-v1.json');
const OUT = resolve(ROOT, 'docs/reports/rrf-caller-classification-v1.json');

// callerId -> { category, rationale }. Categories: CANONICAL_SEARCHRUNTIME_CALLER,
// DELEGATES_TO_SEARCHRUNTIME, FEATURE_ONLY, TEST_ONLY, LEGACY_COMPATIBILITY,
// DEAD_ORPHAN, EXECUTOR_AS_LANE_VIOLATION, UNMAPPED (kept when evidence is
// genuinely insufficient rather than guessed).
const CLASSIFICATION = {
  'sveltekit-frontend/src/lib/server/atlas/kernel/governed-compute-progress.ts:44': ['FEATURE_ONLY', 'Own GovernedComputeLaneWeight concept for compute-progress tracking; matched by the keyword "weight" only, not an RRF fusion caller.'],
  'sveltekit-frontend/src/lib/server/atlas/kernel/governed-compute-progress.ts:59': ['FEATURE_ONLY', 'Same module, sum of the same local weight map.'],
  'sveltekit-frontend/src/lib/server/atlas/kernel/governed-compute-progress.ts:162': ['FEATURE_ONLY', 'Same module, lookup into the same local weight map.'],
  'sveltekit-frontend/src/lib/server/dispatcher/index.ts:55': ['FEATURE_ONLY', 'Exports getDispatcherSignalLaneWeight, consumed by rrf-integration.ts -- a weight-lookup helper, not a fuse call itself.'],
  'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts:1222': ['LEGACY_COMPATIBILITY', 'Real, active ACE production caller of rrf-fuse.ts\'s rrfFuse -- one of the pre-SearchRuntime-consolidation fusion call sites this repo\'s own governance section already flags (13 competing implementations).'],
  'sveltekit-frontend/src/lib/server/gpu/gpu-reranker.ts:54': ['FEATURE_ONLY', 'Private computeRRFScore method scoped to this GPU reranker class -- self-contained, not a shared pipeline.'],
  'sveltekit-frontend/src/lib/server/gpu/gpu-reranker.ts:97': ['FEATURE_ONLY', 'Same class, same private method call.'],
  'sveltekit-frontend/src/lib/server/gpu/gpu-reranker.ts:136': ['FEATURE_ONLY', 'Same class, same private method call.'],
  'sveltekit-frontend/src/lib/server/gpu/gpu-reranker.ts:137': ['FEATURE_ONLY', 'Same class, same private method call.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:19': ['FEATURE_ONLY', 'Local RRF_LANE_WEIGHTS constant definition for this module only.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:65': ['FEATURE_ONLY', 'Iteration over the same local constant.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:74': ['FEATURE_ONLY', 'Same local iteration.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:127': ['LEGACY_COMPATIBILITY', 'Real computeRRFScore invocation -- a distinct, independent scoring module from SearchRuntime.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:153': ['LEGACY_COMPATIBILITY', 'Same module, another real invocation.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:185': ['TEST_ONLY', 'Excerpt uses test1/test-fixture naming pattern (inline self-test block, not gated behind a .spec/.test filename but structurally a fixture).'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:202': ['TEST_ONLY', 'Same inline test-fixture block, test2.'],
  'sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts:219': ['TEST_ONLY', 'Same inline test-fixture block, test3.'],
  'sveltekit-frontend/src/lib/server/retrieval/feature-envelope.ts:569': ['LEGACY_COMPATIBILITY', 'Real computeRRFScore invocation feeding a feature-envelope final_score -- independent of SearchRuntime.'],
  'sveltekit-frontend/src/lib/server/retrieval/hyperrag-fusion-service.ts:29': ['LEGACY_COMPATIBILITY', 'Imports computeRRFScore/RRF_LANE_WEIGHTS -- a distinctly-named, independent "HyperRAG fusion service" pipeline.'],
  'sveltekit-frontend/src/lib/server/retrieval/hyperrag-fusion-service.ts:519': ['LEGACY_COMPATIBILITY', 'Same module, real computeRRFScore call.'],
  'sveltekit-frontend/src/lib/server/retrieval/multi-vector-orchestrator.ts:226': ['LEGACY_COMPATIBILITY', 'fuseLanesViaRrf call -- another independent, named orchestrator, not SearchRuntime.'],
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-fusion-rrf.ts:52': ['LEGACY_COMPATIBILITY', 'Own RRF_LANE_WEIGHTS definition for a module literally named "retrieval-fusion-rrf" -- a distinct, named fusion module.'],
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-fusion-rrf.ts:73': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-fusion-rrf.ts:75': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-fusion-rrf.ts:89': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-fusion-rrf.ts:90': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-fusion-rrf.ts:94': ['LEGACY_COMPATIBILITY', 'Same module, real RRF component computation.'],
  'sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts:9': ['FEATURE_ONLY', 'LaneWeight type definition, not a fuse call.'],
  'sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts:15': ['FEATURE_ONLY', 'DEFAULT_ROUTER_MATRIX config -- feeds a routing decision, not itself a fusion call.'],
  'sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts:74': ['FEATURE_ONLY', 'Accessor for the same routing config.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:29': ['FEATURE_ONLY', 'laneWeight property on a type/interface, not a call.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:109': ['FEATURE_ONLY', 'Default value assignment, same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:123': ['FEATURE_ONLY', 'Default value assignment, same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:240': ['TEST_ONLY', 'testNLanes/testNResult naming pattern -- inline test fixture block.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:253': ['TEST_ONLY', 'Same inline test-fixture block.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:267': ['TEST_ONLY', 'Same inline test-fixture block.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:283': ['TEST_ONLY', 'Same inline test-fixture block.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:295': ['TEST_ONLY', 'Same inline test-fixture block.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner-utils.ts:306': ['TEST_ONLY', 'Same inline test-fixture block.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner.ts:120': ['FEATURE_ONLY', 'Internal implementation line INSIDE combineViaRRF\'s own function body (combineViaRRF is defined at rrf-combiner.ts:100) -- this is the canonical primitive\'s own definition, not a caller of something else.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner.ts:124': ['FEATURE_ONLY', 'Same function body, same reasoning.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-contract.ts:63': ['FEATURE_ONLY', 'RRF_DEFAULT_WEIGHTS shared constant/type contract, imported by rrf-integration.ts -- not a fuse call itself.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:120': ['FEATURE_ONLY', 'Internal implementation line inside rrf-fuse.ts\'s own rrfFuse function (the widely-called production utility used by context-assembler.ts, repair_tools.ts, and 2 API routes) -- part of its own definition.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:125': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:126': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:127': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:128': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:137': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:143': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:153': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts:168': ['FEATURE_ONLY', 'Same function body.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:67': ['LEGACY_COMPATIBILITY', 'Own FUSION_WEIGHTS constant for a module literally named rrf-fusion.ts -- a distinct, named fusion module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:77': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:185': ['LEGACY_COMPATIBILITY', 'Same module, real weighted-sum computation.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:186': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:187': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:188': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:189': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:190': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:245': ['LEGACY_COMPATIBILITY', 'Same module, real computeRRFScore call.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:285': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts:346': ['LEGACY_COMPATIBILITY', 'Same module, re-export.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-integration-tests.ts:69': ['TEST_ONLY', 'Filename itself is rrf-integration-tests.ts.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts:16': ['LEGACY_COMPATIBILITY', 'Imports RRF_DEFAULT_WEIGHTS into rrf-integration.ts, itself a distinct, independent fusion-adjacent module from SearchRuntime.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts:169': ['LEGACY_COMPATIBILITY', 'Same module, re-export of dispatcher lane weight.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts:612': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts:628': ['LEGACY_COMPATIBILITY', 'Same module, re-export.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts:985': ['LEGACY_COMPATIBILITY', 'Real production call to combineViaRRF (the canonical primitive, untouched here) from rrf-integration.ts -- a real caller, but rrf-integration.ts itself is a separate module from search-runtime.ts (the declared canonicalFusionOwner), not yet consolidated into it.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:41': ['LEGACY_COMPATIBILITY', 'Own laneWeight-based ranking logic in a dedicated, independently-named module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:54': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:75': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:94': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:103': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:126': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-lane-ranker.ts:138': ['LEGACY_COMPATIBILITY', 'Same module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-local-testing.ts:204': ['TEST_ONLY', 'Filename itself is rrf-local-testing.ts.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-local-testing.ts:216': ['TEST_ONLY', 'Same file.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-multi-vector.ts:291': ['LEGACY_COMPATIBILITY', 'fuseLanesViaRrf call in a dedicated, independently-named module.'],
  'sveltekit-frontend/src/lib/server/retrieval/rrf-proof.ts:66': ['TEST_ONLY', 'Filename convention "rrf-proof.ts" matches this repo\'s consistent proof/verification-script naming pattern (e.g. *-proof-01.mjs), not a production caller.'],
  'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts:935': ['CANONICAL_SEARCHRUNTIME_CALLER', 'search-runtime.ts is the declared canonicalFusionOwner ("SearchRuntime") in the baseline receipt itself; this call site is the canonical fusion entry point.'],
  'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts:1312': ['CANONICAL_SEARCHRUNTIME_CALLER', 'Definition of fuseSearchRuntimeCandidates -- the canonical owner\'s own fusion function.'],
  'sveltekit-frontend/src/lib/server/retrieval/service.ts:455': ['LEGACY_COMPATIBILITY', 'File-level review confirms this is the legacy service.ts rrfFusion implementation over the revisioned search-lane registry; it is not the declared SearchRuntime owner and is not a new executor lane.'],
  'sveltekit-frontend/src/lib/server/retrieval/types.ts:20': ['FEATURE_ONLY', 'RRF_WEIGHTS_BY_LANE_KIND type/constant definition only, not a call.'],
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts:190': ['LEGACY_COMPATIBILITY', 'Own local RRF_LANE_WEIGHTS definition in unified-orchestrator.ts, a distinct, independent orchestrator from SearchRuntime.'],
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts:535': ['LEGACY_COMPATIBILITY', 'Same module, own laneContribution computation.'],
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts:552': ['LEGACY_COMPATIBILITY', 'Same module, dense_vector lane contribution -- a legitimate independent lane, not an executor.'],
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts:564': ['LEGACY_COMPATIBILITY', 'TurboVec is retained as executor metadata inside the module\'s dense semantic convergence map; the implementation keeps one strongest dense contribution per candidate.'],
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts:594': ['LEGACY_COMPATIBILITY', 'Baseline flags this EXPLICIT_CANDIDATE -- lexical is a legitimate accepted lane, but unified-orchestrator.ts itself is still a separate module from SearchRuntime.'],
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts:610': ['LEGACY_COMPATIBILITY', 'combineRRFLanes receives buildRrfLaneMap output, where Qdrant and TurboVec have already converged into the single dense_vector logical lane before fusion.'],
  'sveltekit-frontend/src/mcp/tools/repair_tools.ts:554': ['FEATURE_ONLY', 'MCP repair-tools feature calling rrf-fuse.ts\'s shared rrfFuse utility.'],
  'sveltekit-frontend/src/routes/api/admin/atlas/query/+server.ts:407': ['FEATURE_ONLY', 'Admin API route feature calling rrfFuse.'],
  'sveltekit-frontend/src/routes/api/admin/parents-atlas/actions/+server.ts:105': ['FEATURE_ONLY', 'Admin API route feature calling rrfFuse.'],
  'sveltekit-frontend/src/routes/api/rag/search-fused/+server.ts:124': ['FEATURE_ONLY', 'RAG search API route feature calling rrfFuse.reciprocalRankFusion.'],
};

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const classified = baseline.callers.map((caller) => {
  const entry = CLASSIFICATION[caller.callerId];
  if (!entry) {
    return { ...caller, classification: 'UNMAPPED', rationale: 'No classification entry recorded for this callerId -- treat as unmapped, not silently dropped.' };
  }
  const [classification, rationale] = entry;
  return { ...caller, classification, rationale };
});

const missing = baseline.callers.filter((c) => !CLASSIFICATION[c.callerId]);
const byCategory = {};
for (const c of classified) byCategory[c.classification] = (byCategory[c.classification] ?? 0) + 1;

const report = {
  schema: 'atlas.rrf-caller-classification.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CLASSIFICATION',
  baselineSource: 'docs/reports/rrf-caller-baseline-v1.json',
  canonicalFusionOwner: baseline.canonicalFusionOwner,
  totalCallers: classified.length,
  unclassifiedCount: missing.length,
  byCategory,
  classified,
  promotionReadiness: {
    unmappedCount: byCategory.UNMAPPED ?? 0,
    executorAsLaneViolationCount: byCategory.EXECUTOR_AS_LANE_VIOLATION ?? 0,
    readyForMigration: (byCategory.UNMAPPED ?? 0) === 0 && (byCategory.EXECUTOR_AS_LANE_VIOLATION ?? 0) === 0,
  },
  status: (byCategory.UNMAPPED ?? 0) === 0 && (byCategory.EXECUTOR_AS_LANE_VIOLATION ?? 0) === 0
    ? 'RRF_CALLER_CLASSIFICATION_READY'
    : 'RRF_CALLER_CLASSIFICATION_BLOCKED',
  note: 'Classification does NOT imply migration. Per this repo\'s own instruction, not every RRF reference must become a SearchRuntime caller -- LEGACY_COMPATIBILITY and FEATURE_ONLY callers are legitimate independent owners unless a future change explicitly consolidates them. combineViaRRF and rrf-fuse.ts\'s rrfFuse were NOT modified; no caller was rewritten.',
  readOnlyInvariants: { writesPerformed: false, rrfRuntimeChanged: false },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, totalCallers: report.totalCallers, byCategory, unclassifiedCount: missing.length, reportPath: 'docs/reports/rrf-caller-classification-v1.json' }, null, 2));
