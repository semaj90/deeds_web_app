import { describe, expect, it } from 'vitest';
import {
  RepairEvidenceBatchV1Schema,
  RepairEvidenceCandidateV1Schema,
  buildAgenticRepairEvidenceGate,
  type RepairEvidenceBatchV1,
  type RepairEvidenceReadOnlyExecutor,
} from './agentic-repair-evidence-gate.js';

function candidate(overrides: Partial<ReturnType<typeof RepairEvidenceCandidateV1Schema.parse>> = {}) {
  return RepairEvidenceCandidateV1Schema.parse({
    candidateId: 'packet:p1',
    packetKey: 'p1',
    sourceRef: 'src/lib/a.ts',
    sourceRevision: 'src-r1',
    ordinal: 0,
    tokenCount: 120,
    semanticScore: 0.9,
    lexicalScore: 0.7,
    graphAuthority: 0.6,
    centroidAffinity: 0.8,
    cacheHotness: 0.4,
    demandUtility: 0.5,
    executionUtility: 0.3,
    recency: 0.9,
    normalizedCost: 0.2,
    hopDistance: 0,
    pathCost: 0,
    communityId: 'c1',
    communityOverlap: 0.8,
    pprAffinity: 0.7,
    exactEvidence: true,
    contentRef: 'sha256:abc',
    lanes: ['canonical'],
    executors: ['test:packet'],
    evidenceRefs: ['packet:p1', 'sha256:abc'],
    ...overrides,
  });
}

function batch(input: {
  library: RepairEvidenceBatchV1['library'];
  executor: string;
  candidates?: ReturnType<typeof candidate>[];
  reachable?: boolean;
}): RepairEvidenceBatchV1 {
  const candidates = input.candidates ?? [];
  return RepairEvidenceBatchV1Schema.parse({
    schema: 'atlas.repair-evidence-batch.v1',
    library: input.library,
    executor: input.executor,
    backend: `test:${input.library.toLowerCase()}`,
    reachable: input.reachable ?? true,
    degraded: !(input.reachable ?? true),
    latencyMs: 5,
    observedRevision: candidates.every((row) => row.sourceRevision === 'src-r1') ? 'src-r1' : null,
    candidates,
    sourceRefs: [...new Set(candidates.map((row) => row.sourceRef))],
    evidenceRefs: [...new Set(candidates.flatMap((row) => row.evidenceRefs))],
    cacheHitCount: 0,
    cacheProbeCount: 0,
    reasonCodes: ['TEST_FIXTURE'],
  });
}

function executor(): RepairEvidenceReadOnlyExecutor {
  return {
    packetLookup: async () => batch({
      library: 'PACKET_FABRIC',
      executor: 'packet',
      candidates: [candidate()],
    }),
    semanticSearch: async () => batch({
      library: 'QDRANT',
      executor: 'qdrant',
      candidates: [candidate({
        candidateId: 'qdrant:p1',
        semanticScore: 0.97,
        exactEvidence: false,
        lanes: ['semantic'],
        executors: ['test:qdrant'],
        evidenceRefs: ['qdrant:p1'],
      })],
    }),
    graphExpand: async () => batch({
      library: 'GRAPH_EXPANDER',
      executor: 'graph',
      candidates: [
        candidate({
          candidateId: 'graph:p2',
          packetKey: 'p2',
          sourceRef: 'src/lib/b.ts',
          ordinal: 0,
          semanticScore: 0.1,
          lexicalScore: 0,
          graphAuthority: 0.95,
          hopDistance: 1,
          exactEvidence: false,
          contentRef: 'source:src/lib/b.ts',
          lanes: ['graph'],
          executors: ['test:graph'],
          evidenceRefs: ['graph:p2'],
        }),
      ],
    }),
    aceValidate: async () => batch({
      library: 'ACE',
      executor: 'ace',
      candidates: [candidate({
        candidateId: 'ace:p1',
        exactEvidence: false,
        cacheHotness: 1,
        lanes: ['context'],
        executors: ['test:ace'],
        evidenceRefs: ['ace:p1'],
      })],
    }),
    centroidLookup: async () => batch({
      library: 'CENTROID_CACHE',
      executor: 'centroid',
      candidates: [candidate({
        candidateId: 'centroid:p1',
        exactEvidence: false,
        centroidAffinity: 0.99,
        lanes: ['centroid'],
        executors: ['test:centroid'],
        evidenceRefs: ['centroid:p1'],
      })],
    }),
  };
}

const input = {
  schema: 'atlas.agentic-repair-evidence-gate-input.v1' as const,
  requestId: 'repair-1',
  queryText: 'fix TypeScript import callers around src/lib/a.ts with exact evidence',
  targetFiles: ['src/lib/a.ts'],
  workspaceRevision: 'ws-r1',
  sourceRevision: 'src-r1',
  graphRevision: 'graph-r1',
  featureRevision: 'feature-r1',
  producerRevision: 'test-r1',
  searchBudget: {
    maxGraphHops: 2,
    maxGraphFanout: 24,
    maxCandidates: 64,
    topK: 8,
    queryBatchSize: 1,
    latencyBudgetMs: 100,
    contextTokenBudget: 4096,
    exactPromotionTopK: 4,
  },
  contextBudget: {
    totalTokens: 4096,
    reservedPromptTokens: 512,
    reservedToolTokens: 256,
    reservedOutputTokens: 768,
    maxWindows: 8,
    maxWindowTokens: 800,
    overlapTokens: 80,
    minExactEvidenceTokens: 1,
  },
  matrixDiagnostics: null,
  readinessPolicy: {
    minRequiredLibraryMeanPercent: 45,
    minOverallMeanPercent: 45,
    minDegradedOverallMeanPercent: 25,
    minSourceRefsPerRequiredLibrary: 1,
  },
};

describe('buildAgenticRepairEvidenceGate', () => {
  it('deduplicates executor evidence into one packet identity and emits an N×16 matrix', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());

    expect(result.featureMatrix.cols).toBe(16);
    expect(result.manifest.featureMatrix.cols).toBe(16);
    expect(result.manifest.oneVotePerLogicalLane).toBe(true);
    expect(result.manifest.graphNeverAnswersDirectly).toBe(true);
    expect(result.manifest.sideEffectsAuthorized).toBe(false);
    expect(result.manifest.canonicalWritesAllowed).toBe(false);

    const p1 = result.candidates.find((row) => row.packetKey === 'p1');
    expect(p1).toBeDefined();
    expect(p1?.semanticScore).toBe(0.97);
    expect(p1?.lanes).toEqual(expect.arrayContaining(['canonical', 'semantic', 'context', 'centroid']));
    expect(p1?.executors.length).toBeGreaterThan(1);
    expect(result.candidates.filter((row) => row.packetKey === 'p1')).toHaveLength(1);
  });

  it('preserves exact evidence and allows a dry-run context recommendation without authorizing mutation', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());

    expect(result.manifest.exactEvidencePacketKeys).toContain('p1');
    expect(result.contextPlan.exactEvidenceFloorSatisfied).toBe(true);
    expect(result.manifest.evidenceStatus).toBe('READY_FOR_DRY_RUN');
    expect(result.manifest.recommendationAllowed).toBe(true);
    expect(result.manifest.evidenceAuthorizesMutation).toBe(false);
    expect(result.manifest.exactPromotionRequired).toBe(true);
  });

  it('keeps Ewin Tang promotion at MEASURE_FIRST when effective-rank evidence was not measured', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());

    expect(result.tangPromotion.status).toBe('MEASURE_FIRST');
    expect(result.tangPromotion.eligible).toBe(false);
    expect(result.tangPromotion.stochasticSamplingStillRequiredForTangFaithfulExecution).toBe(true);
  });

  it('blocks the readiness gate when a required graph executor is unreachable', async () => {
    const broken = executor();
    broken.graphExpand = async () => batch({
      library: 'GRAPH_EXPANDER',
      executor: 'graph',
      reachable: false,
    });

    const result = await buildAgenticRepairEvidenceGate(input, broken);
    expect(result.readiness.gate).not.toBe('READY');
    expect(result.manifest.evidenceStatus).not.toBe('READY_FOR_DRY_RUN');
    expect(result.manifest.recommendationAllowed).toBe(false);
  });

  it('keeps exact and CAGRA/Qdrant planning inside one semantic logical lane', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());
    const semanticRecommendations = result.searchPlan.recommendations.filter((row) => row.logicalLane === 'semantic');

    expect(semanticRecommendations.length).toBeGreaterThan(0);
    expect(semanticRecommendations.every((row) => row.independentLaneVote === false)).toBe(true);
  });
});
