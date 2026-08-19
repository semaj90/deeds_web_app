import { describe, expect, it } from 'vitest';
import {
  RepairEvidenceBatchV1Schema,
  RepairEvidenceCandidateV1Schema,
  buildAgenticRepairEvidenceGate,
  type RepairEvidenceBatchV1,
  type RepairEvidenceReadOnlyExecutor,
} from './agentic-repair-evidence-gate.js';

function candidate() {
  return RepairEvidenceCandidateV1Schema.parse({
    candidateId: 'packet:p-unversioned',
    packetKey: 'p-unversioned',
    sourceRef: 'src/lib/unversioned.ts',
    sourceRevision: null,
    ordinal: 0,
    tokenCount: 64,
    semanticScore: 0.9,
    lexicalScore: 0.6,
    graphAuthority: 0.7,
    centroidAffinity: 0.5,
    cacheHotness: 0.1,
    demandUtility: 0.5,
    executionUtility: 0.5,
    recency: 0.5,
    normalizedCost: 0.2,
    hopDistance: 0,
    pathCost: 0,
    communityId: 'c1',
    communityOverlap: 0.4,
    pprAffinity: 0.4,
    exactEvidence: true,
    contentRef: 'source:src/lib/unversioned.ts',
    lanes: ['canonical'],
    executors: ['test:unversioned'],
    evidenceRefs: ['test:unversioned'],
  });
}

function batch(library: RepairEvidenceBatchV1['library']): RepairEvidenceBatchV1 {
  const row = candidate();
  return RepairEvidenceBatchV1Schema.parse({
    schema: 'atlas.repair-evidence-batch.v1',
    library,
    executor: `test:${library.toLowerCase()}`,
    backend: `test:${library.toLowerCase()}`,
    reachable: true,
    degraded: false,
    latencyMs: 1,
    observedRevision: null,
    candidates: [row],
    sourceRefs: [row.sourceRef],
    evidenceRefs: row.evidenceRefs,
    cacheHitCount: 0,
    cacheProbeCount: 0,
    reasonCodes: ['UNVERSIONED_FIXTURE'],
  });
}

function executor(): RepairEvidenceReadOnlyExecutor {
  return {
    packetLookup: async () => batch('PACKET_FABRIC'),
    semanticSearch: async () => batch('QDRANT'),
    graphExpand: async () => batch('GRAPH_EXPANDER'),
    aceValidate: async () => batch('ACE'),
    centroidLookup: async () => batch('CENTROID_CACHE'),
  };
}

const input = {
  schema: 'atlas.agentic-repair-evidence-gate-input.v1' as const,
  requestId: 'repair-revision-provenance-1',
  queryText: 'prove request revision is not evidence provenance',
  targetFiles: ['src/lib/unversioned.ts'],
  workspaceRevision: 'ws-r1',
  sourceRevision: 'request-source-r1',
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
    minRequiredLibraryMeanPercent: 95,
    minOverallMeanPercent: 95,
    minDegradedOverallMeanPercent: 25,
    minSourceRefsPerRequiredLibrary: 1,
  },
};

describe('repair revision provenance', () => {
  it('never copies request sourceRevision onto an unversioned candidate', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());
    const row = result.candidates.find((item) => item.packetKey === 'p-unversioned');

    expect(row).toBeDefined();
    expect(row?.sourceRevision).toBeNull();
    expect(row?.sourceRevision).not.toBe(input.sourceRevision);
  });

  it('keeps context lineage explicitly unresolved instead of substituting request revision', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());
    const member = result.contextPlan.windows.flatMap((window) => window.members)
      .find((item) => item.packetKey === 'p-unversioned');

    expect(member).toBeDefined();
    expect(member?.sourceRevision).toBe('unresolved:candidate-source-revision');
    expect(member?.sourceRevision).not.toBe(input.sourceRevision);
  });

  it('does not emit a dry-run recommendation when revision readiness is degraded', async () => {
    const result = await buildAgenticRepairEvidenceGate(input, executor());

    expect(result.readiness.gate).not.toBe('READY');
    expect(result.manifest.evidenceStatus).not.toBe('READY_FOR_DRY_RUN');
    expect(result.manifest.recommendationAllowed).toBe(false);
    expect(result.manifest.evidenceAuthorizesMutation).toBe(false);
    expect(result.manifest.canonicalWritesAllowed).toBe(false);
  });
});
