/**
 * P14, P15 & P19 Integrated Proof Script
 *
 * - P14 (Exact Context Cache & Residency):
 *   Proves `writeRevisionedBitfrost` / `readRevisionedBitfrost` cold/warm evidence parity,
 *   stale-revision invalidation, and `buildResidencyPlan` budget enforcement using an ephemeral
 *   in-memory cache client (`writesPerformed: false` to external Valkey/Redis).
 * - P15 (Semantic Retrieval & Single Fusion Owner):
 *   Executes the frozen candidate cohort through `fuseSearchRuntimeCandidates` (`search-runtime.ts`),
 *   proving 1 vote per logical lane (`contributionCount === 1`) even when multiple executors or
 *   duplicate chunks fire in the same lane, and exact candidate identity preservation through Top-K.
 * - P19 (Deterministic Policy Baseline):
 *   Executes `buildPolicyStateVector` (`policy-state.ts`), `routePolicy` (`policy-router.ts`), and
 *   `selectVerifiedRetrievalMode` (`auto-mode-classifier-gate.ts`), proving legal-action-mask
 *   enforcement across all 6 HMM states, VRAM-pressure demotion, and deterministic replay checksums.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  readRevisionedBitfrost,
  writeRevisionedBitfrost,
  negativeEligibilityKey,
  type BitfrostCacheClient,
} from '../../sveltekit-frontend/src/lib/server/atlas/rlm/bitfrost-policy.js';
import {
  buildResidencyPlan,
  type GpuResidencyManifestInput,
} from '../../sveltekit-frontend/src/lib/server/atlas/policy/ace-residency.js';
import {
  fuseSearchRuntimeCandidates,
  getFusionIdentityKey,
  selectDenseSearchSeedPacketKeys,
  type Candidate,
} from '../../sveltekit-frontend/src/lib/server/retrieval/search-runtime.js';
import {
  buildPolicyStateVector,
} from '../../sveltekit-frontend/src/lib/server/atlas/policy/policy-state.js';
import {
  routePolicy,
  POLICY_ACTION_MASKS,
} from '../../sveltekit-frontend/src/lib/server/atlas/policy/policy-router.js';
import {
  HMM_STATES,
  type HmmState,
  type PolicyStateInput,
} from '../../sveltekit-frontend/src/lib/server/atlas/policy/policy-types.js';
import {
  selectVerifiedRetrievalMode,
} from '../../sveltekit-frontend/src/lib/server/retrieval/auto-mode-classifier-gate.js';

const ROOT = process.cwd().endsWith('sveltekit-frontend')
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

async function main() {
  const execReceiptPath = path.join(
    ROOT,
    'docs/reports/retrieval-context-execution-receipt-v1.json'
  );
  const execReceipt = JSON.parse(fs.readFileSync(execReceiptPath, 'utf8'));

  // ── 1. P14: BitFrost Revisioned Cache Parity, Stale Invalidation & Residency Plan ──
  const memStore = new Map<string, { value: string; ttl: number }>();
  const ephemeralCache: BitfrostCacheClient = {
    async get(key: string) {
      return memStore.get(key)?.value ?? null;
    },
    async set(key: string, value: string, _mode: 'EX', ttlSeconds: number) {
      memStore.set(key, { value, ttl: ttlSeconds });
      return 'OK';
    },
  };

  const workspaceRev: string =
    execReceipt.gates.SOURCE_COHORT_01.observations[0].sourceRevision;
  const policyRev = 'parent-atlas.policy-decision.v1';
  const manifestChecksum = `sha256:${execReceipt.gates.MANIFEST_READBACK_06.manifestIdentityChecksum}`;
  const cacheKey = negativeEligibilityKey(workspaceRev, policyRev, manifestChecksum);

  const coldPayload = {
    manifestIdentityChecksum: manifestChecksum,
    admittedPackets: execReceipt.gates.CONTEXT_HYDRATE_05.admittedCount ?? 3,
    ordinalMapChecksum: execReceipt.gates.FEATURE_GEMM_04.ordinalMapChecksum,
  };

  const writeOk = await writeRevisionedBitfrost(
    ephemeralCache,
    cacheKey,
    coldPayload,
    workspaceRev,
    policyRev,
    300,
    false
  );
  const warmReadback = await readRevisionedBitfrost<typeof coldPayload>(
    ephemeralCache,
    cacheKey,
    workspaceRev,
    policyRev
  );
  const staleWorkspaceReadback = await readRevisionedBitfrost<typeof coldPayload>(
    ephemeralCache,
    cacheKey,
    'sha256:' + 'f'.repeat(64),
    policyRev
  );
  const stalePolicyReadback = await readRevisionedBitfrost<typeof coldPayload>(
    ephemeralCache,
    cacheKey,
    workspaceRev,
    'parent-atlas.policy-decision.v0-stale'
  );

  const coldWarmParity =
    writeOk &&
    warmReadback !== null &&
    JSON.stringify(warmReadback.value) === JSON.stringify(coldPayload);
  const staleInvalidationProven =
    staleWorkspaceReadback === null && stalePolicyReadback === null;

  const residencyCandidates: GpuResidencyManifestInput[] = [
    {
      objectId: 'obj:candidate_feature_matrix_50x8',
      representationId: 'rep:feature_matrix_f32',
      representationRevision: workspaceRev,
      fidelity: 'FEATURE_ROW',
      residency: 'HOT',
      bytes: 1600,
      utility: 95,
      transferCostMs: 0.2,
      recomputeCostMs: 12.0,
      preemptible: false,
    },
    {
      objectId: 'obj:semantic_768_top10',
      representationId: 'rep:embeddinggemma_768',
      representationRevision: workspaceRev,
      fidelity: 'SEMANTIC_768',
      residency: 'WARM',
      bytes: 30720,
      utility: 88,
      transferCostMs: 0.8,
      recomputeCostMs: 45.0,
      preemptible: true,
    },
    {
      objectId: 'obj:oversized_cold_tensor',
      representationId: 'rep:full_corpus_fp32',
      representationRevision: workspaceRev,
      fidelity: 'TOKEN_TENSORS',
      residency: 'COLD',
      bytes: 65536,
      utility: 20,
      transferCostMs: 5.0,
      recomputeCostMs: 10.0,
      preemptible: true,
    },
  ];
  const residencyPlan = buildResidencyPlan(residencyCandidates, { maxBytes: 40960 });

  // ── 2. P15: SearchRuntime Single Fusion Owner & 1-Vote-Per-Lane Proof ──
  const cohortCandidates: Candidate[] = [
    {
      id: 'qdrant-hit-1',
      packetKey: 'pkt:AccessibilityPanel',
      symbolVersionId: 'symv:AccessibilityPanel:v1',
      sourceRef: 'sveltekit-frontend/src/lib/components/ui/AccessibilityPanel.svelte',
      score: 0.96,
      scoreSource: 'qdrant_768',
      embeddingLane: 'dense_768',
      identityStatus: 'canonical',
      summary: 'AccessibilityPanel component',
      content: 'export default AccessibilityPanel',
    },
    // Duplicate dense hit from a second chunk/projection of the same canonical identity
    {
      id: 'qdrant-hit-1-dup-chunk',
      packetKey: 'pkt:AccessibilityPanel',
      symbolVersionId: 'symv:AccessibilityPanel:v1',
      sourceRef: 'sveltekit-frontend/src/lib/components/ui/AccessibilityPanel.svelte',
      score: 0.72,
      scoreSource: 'qdrant_768',
      embeddingLane: 'dense_768',
      identityStatus: 'canonical',
      summary: 'AccessibilityPanel duplicate chunk',
      content: 'export default AccessibilityPanel',
    },
    // Lexical hit for the same canonical identity (casts 1 lexical vote)
    {
      id: 'pg-trgm-hit-1',
      packetKey: 'pkt:AccessibilityPanel',
      symbolVersionId: 'symv:AccessibilityPanel:v1',
      sourceRef: 'sveltekit-frontend/src/lib/components/ui/AccessibilityPanel.svelte',
      score: 0.88,
      scoreSource: 'postgres_trigram',
      identityStatus: 'canonical',
      summary: 'AccessibilityPanel lexical hit',
      content: 'export default AccessibilityPanel',
    },
    // Second distinct candidate
    {
      id: 'qdrant-hit-2',
      packetKey: 'pkt:Button',
      symbolVersionId: 'symv:Button:v1',
      sourceRef: 'sveltekit-frontend/src/lib/components/ui/Button.svelte',
      score: 0.91,
      scoreSource: 'qdrant_768',
      embeddingLane: 'dense_768',
      identityStatus: 'canonical',
      summary: 'Button component',
      content: 'export default Button',
    },
  ];

  const denseSeeds = selectDenseSearchSeedPacketKeys(cohortCandidates, 5);
  const fused = fuseSearchRuntimeCandidates(cohortCandidates);
  const topCandidate = fused[0]!;
  const denseLaneEvidence = topCandidate.laneEvidence?.find((l) => l.lane === 'dense');
  const lexicalLaneEvidence = topCandidate.laneEvidence?.find((l) => l.lane === 'lexical');

  const expectedTwoLaneBestRankScore = 1 / (60 + 1) + 1 / (60 + 1);
  const rrfExactScoreMatch =
    Math.abs((topCandidate.fusionScore ?? 0) - expectedTwoLaneBestRankScore) < 1e-10;
  const oneVotePerLogicalLaneProven =
    denseLaneEvidence?.contributionCount === 1 &&
    denseLaneEvidence?.supportingHitCount === 2 &&
    lexicalLaneEvidence?.contributionCount === 1 &&
    lexicalLaneEvidence?.supportingHitCount === 1 &&
    rrfExactScoreMatch &&
    getFusionIdentityKey(topCandidate) === 'symv:AccessibilityPanel:v1';

  // ── 3. P19: Deterministic Policy Baseline Replay & Legal Action Set Enforcement ──
  function makeBasePolicyInput(stateHint: HmmState, vramPressure = 0.2): PolicyStateInput {
    return {
      okf: {
        naiveBayesScore: 0.82,
        logisticRegressionScore: 0.85,
        fitMargin: 0.35,
        decision: 'ACCEPT',
      },
      hmm: {
        stateHint,
        posterior: { [stateHint]: 0.9 },
      },
      retrieval: {
        bestCosine: 0.89,
        cosineMargin: 0.24,
        lexicalHitCount: 8,
        rrfConfidence: 0.91,
      },
      structural: {
        astEvidence: 1,
        symbolMatch: 1,
        exactPathMatch: 1,
      },
      graph: {
        seedCount: 10,
        shortestPathAvailable: true,
        communityAgreement: 0.8,
        authority: 15,
        hopBudgetRemaining: 2,
      },
      execution: {
        compileFailed: false,
        testFailed: false,
        retryCount: 0,
        historicalSuccess: 0.95,
      },
      resource: {
        vramPressure,
        contextPressure: 0.3,
        latencyPressure: 0.25,
        cacheHitRatio: 0.75,
      },
    };
  }

  const stateDecisions = HMM_STATES.map((stateHint) => {
    const vec1 = buildPolicyStateVector(makeBasePolicyInput(stateHint, 0.2));
    const vec2 = buildPolicyStateVector(makeBasePolicyInput(stateHint, 0.2));
    const dec1 = routePolicy(vec1);
    const dec2 = routePolicy(vec2);
    const allowedSet = new Set(POLICY_ACTION_MASKS[stateHint]);
    const allRankedLegal = dec1.rankedActions.every((r) => allowedSet.has(r.action));
    const deterministicReplay = JSON.stringify(dec1) === JSON.stringify(dec2);
    return {
      stateHint,
      selectedAction: dec1.action,
      selectedModel: dec1.model,
      selectedBudget: dec1.budget,
      allRankedLegal,
      deterministicReplay,
    };
  });

  // High VRAM pressure test (vramPressure = 0.92 -> budget must be SMALL and DEEP_RERANK/GRAPH_EXPAND penalized)
  const highPressureVec = buildPolicyStateVector(makeBasePolicyInput('TRACE', 0.92));
  const highPressureDec = routePolicy(highPressureVec);
  const highPressureDemotionProven =
    highPressureDec.budget === 'SMALL' && highPressureDec.action !== 'GRAPH_EXPAND';

  // Auto-Mode Classifier Gate fail-closed check
  const sampleFile = 'sveltekit-frontend/src/lib/components/ActionPopup.svelte';
  const gatePass = selectVerifiedRetrievalMode({
    query: 'ActionPopup rune $props and onclick event handler dispatch',
    candidateDagHits: [
      {
        nodeId: 'tn_v1_5d3a34a4c9474c82cc10b3bdbb52f393',
        filePath: sampleFile,
        sourceRevision: workspaceRev,
        similarity: 0.94,
        dependents: ['a.svelte', 'b.svelte'],
        dependencies: ['c.ts'],
      },
    ],
    liveSourceRevisions: { [sampleFile]: workspaceRev },
    hyperedgeMatchCount: 3,
    topK: 5,
  });
  const gateFailClosed = selectVerifiedRetrievalMode({
    query: 'ActionPopup rune $props and onclick event handler dispatch',
    candidateDagHits: [
      {
        nodeId: 'tn_v1_5d3a34a4c9474c82cc10b3bdbb52f393',
        filePath: sampleFile,
        sourceRevision: 'git:0084288f26',
        similarity: 0.94,
        dependents: ['a.svelte'],
        dependencies: [],
      },
    ],
    liveSourceRevisions: { [sampleFile]: workspaceRev },
    hyperedgeMatchCount: 3,
    topK: 5,
  });

  const policyCanonicalJson = JSON.stringify(stateDecisions);
  const policyReplayChecksum = `sha256:${crypto.createHash('sha256').update(policyCanonicalJson).digest('hex')}`;

  const allP19Passed =
    stateDecisions.every((d) => d.allRankedLegal && d.deterministicReplay) &&
    highPressureDemotionProven &&
    gatePass.mode === 'HYPERGRAPH_NARY' &&
    gateFailClosed.mode === 'SEMANTIC_DENSE_768' &&
    gateFailClosed.rejectionReason === 'STALE_OR_MISSING_SOURCE_REVISION';

  const receipt = {
    schema: 'atlas.p14-p15-p19-cache-fusion-policy-receipt.v1',
    generatedAt: new Date().toISOString(),
    testCommand:
      'cd sveltekit-frontend && ./node_modules/.bin/tsx ../scripts/atlas/prove-p14-p15-p19-cache-fusion-policy-v1.mts',
    writesPerformed: false,
    p14CacheAndResidency: {
      cacheKey,
      workspaceRevision: workspaceRev,
      policyRevision: policyRev,
      coldWarmParity,
      staleInvalidationProven,
      residencyPlan: {
        budgetMaxBytes: residencyPlan.budget.maxBytes,
        usedBytes: residencyPlan.usedBytes,
        selectedObjectIds: residencyPlan.selected.map((s) => s.objectId),
        deferredObjectIds: residencyPlan.deferred.map((d) => d.objectId),
      },
      status:
        coldWarmParity &&
        staleInvalidationProven &&
        residencyPlan.usedBytes <= 40960 &&
        residencyPlan.deferred.length === 1
          ? 'PASS'
          : 'FAIL',
    },
    p15SingleFusionOwner: {
      denseSeedPacketKeys: denseSeeds,
      fusedCandidateCount: fused.length,
      topFusionIdentityKey: getFusionIdentityKey(topCandidate),
      topFusionScore: topCandidate.fusionScore,
      expectedTwoLaneBestRankScore,
      rrfExactScoreMatch,
      denseLaneContributionCount: denseLaneEvidence?.contributionCount,
      denseLaneSupportingHitCount: denseLaneEvidence?.supportingHitCount,
      lexicalLaneContributionCount: lexicalLaneEvidence?.contributionCount,
      oneVotePerLogicalLaneProven,
      status: oneVotePerLogicalLaneProven ? 'PASS' : 'FAIL',
    },
    p19PolicyBaseline: {
      policyReplayChecksum,
      stateDecisions,
      highPressureDemotionProven,
      classifierGateAdmittedOnValidSha256: gatePass.mode,
      classifierGateFallbackOnLegacyGitRev: gateFailClosed.mode,
      status: allP19Passed ? 'PASS' : 'FAIL',
    },
    status:
      coldWarmParity &&
      staleInvalidationProven &&
      oneVotePerLogicalLaneProven &&
      allP19Passed
        ? 'PASS'
        : 'FAIL',
  };

  fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'docs/reports/p14-p15-p19-cache-fusion-policy-receipt-v1.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        status: receipt.status,
        p14Status: receipt.p14CacheAndResidency.status,
        p15Status: receipt.p15SingleFusionOwner.status,
        p19Status: receipt.p19PolicyBaseline.status,
        policyReplayChecksum,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
