import { describe, expect, it } from 'vitest';
import {
  AgenticRepairLibraryLookupObservationV1Schema,
  rankAgenticRepairReadiness,
  type AgenticRepairLibrary,
  type AgenticRepairReadinessInputV1,
} from './agentic-repair-readiness-ranker.js';

const LIBRARIES: AgenticRepairLibrary[] = [
  'TREE_SITTER',
  'AST_GREP',
  'TS_MORPH',
  'LSP',
  'ARROW_IPC',
  'PACKET_FABRIC',
  'GRAPH_EXPANDER',
  'ACE',
  'BITFROST',
  'REDIS_VALKEY',
  'CENTROID_CACHE',
  'QDRANT',
];

function input(): AgenticRepairReadinessInputV1 {
  return {
    schema: 'atlas.agentic-repair-readiness-input.v1',
    requestId: 'req-1',
    queryText: 'fix TypeScript references and expand import callers using centroid cache',
    targetFiles: ['src/lib/server/atlas/ranking/example.ts'],
    workspaceRevision: 'ws-10',
    sourceRevision: 'src-10',
    fetchPlans: LIBRARIES.map((library) => ({
      schema: 'atlas.agentic-repair-library-fetch-parameters.v1',
      library,
      topK: 50,
      latencyBudgetMs: 100,
      graphHopBudget: 2,
      graphFanoutBudget: 64,
      maxWarmBuckets: 8,
      centroidCandidateLimit: 50,
      cacheTtlSeconds: 1800,
      exactPromotionRequired: true,
    })),
    gatePolicy: {
      schema: 'atlas.agentic-repair-gate-policy.v1',
      requiredLibraries: [
        'TREE_SITTER',
        'TS_MORPH',
        'PACKET_FABRIC',
        'GRAPH_EXPANDER',
        'ACE',
        'BITFROST',
        'REDIS_VALKEY',
        'CENTROID_CACHE',
      ],
      minRequiredLibraryMeanPercent: 80,
      minOverallMeanPercent: 85,
      minDegradedOverallMeanPercent: 65,
      minSourceRefsPerRequiredLibrary: 1,
    },
    producerRevision: 'test',
  };
}

function observation(library: AgenticRepairLibrary, overrides: Partial<ReturnType<typeof baseObservation>> = {}) {
  return AgenticRepairLibraryLookupObservationV1Schema.parse({
    ...baseObservation(library),
    ...overrides,
  });
}

function baseObservation(library: AgenticRepairLibrary) {
  return {
    schema: 'atlas.agentic-repair-library-lookup-observation.v1' as const,
    library,
    reachable: true,
    latencyMs: 20,
    coverage: { numerator: 9, denominator: 10 },
    exactEvidence: { numerator: 9, denominator: 10 },
    revisionAlignment: { numerator: 10, denominator: 10 },
    canonicalIdentity: { numerator: 10, denominator: 10 },
    cacheHits: { numerator: 8, denominator: 10 },
    sourceRefs: [`source:${library.toLowerCase()}`],
    observedRevision: `${library.toLowerCase()}-rev-1`,
    producerRevision: 'fixture',
  };
}

describe('agentic repair readiness ranker', () => {
  it('ranks validated library observations into percentages and opens the agentic evidence gate', async () => {
    const result = await rankAgenticRepairReadiness(input(), async (request) => observation(request.parameters.library));

    expect(result.gate).toBe('READY');
    expect(result.nextGate).toBe('AGENTIC_ERROR_FIXING_EVIDENCE');
    expect(result.overallMeanPercent).toBeGreaterThanOrEqual(85);
    expect(result.rankedLibraries).toHaveLength(LIBRARIES.length);
    expect(result.rankedLibraries[0]?.meanPercent).toBeGreaterThanOrEqual(result.rankedLibraries.at(-1)?.meanPercent ?? 0);
    expect(result.percentagesAreArithmeticMeans).toBe(true);
    expect(result.rankingDeterministic).toBe(true);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.actions.every((action) => action.sideEffectsAuthorized === false)).toBe(true);
  });

  it('fails closed if a lookup answers for a different library than requested', async () => {
    await expect(rankAgenticRepairReadiness(input(), async () => observation('QDRANT')))
      .rejects.toThrow(/LIBRARY_LOOKUP_MISMATCH/);
  });

  it('blocks when a required library is unreachable and below threshold', async () => {
    const result = await rankAgenticRepairReadiness(input(), async (request) => {
      if (request.parameters.library === 'TREE_SITTER') {
        return observation('TREE_SITTER', {
          reachable: false,
          latencyMs: 500,
          coverage: { numerator: 0, denominator: 10 },
          exactEvidence: { numerator: 0, denominator: 10 },
          revisionAlignment: { numerator: 0, denominator: 10 },
          canonicalIdentity: { numerator: 0, denominator: 10 },
          sourceRefs: [],
        });
      }
      return observation(request.parameters.library);
    });

    expect(result.gate).not.toBe('READY');
    expect(result.blockers.some((blocker) => blocker.includes('TREE_SITTER'))).toBe(true);
  });

  it('proposes bounded graph expansion, ACE context, and canonical BitFrost warming from the query', async () => {
    const result = await rankAgenticRepairReadiness(input(), async (request) => observation(request.parameters.library));

    const graph = result.actions.find((action) => action.kind === 'GRAPH_EXPANSION');
    const ace = result.actions.find((action) => action.kind === 'ACE_CONTEXT_PREFETCH');
    const warm = result.actions.find((action) => action.kind === 'BITFROST_BUCKET_WARM');

    expect(graph?.trigger).toBe(true);
    expect(graph?.parameters.hopBudget).toBe(2);
    expect(graph?.parameters.fanoutBudget).toBe(64);
    expect(ace?.trigger).toBe(true);
    expect(warm?.trigger).toBe(true);
    expect(Array.isArray(warm?.parameters.canonicalKeys)).toBe(true);
    expect((warm?.parameters.canonicalKeys as string[]).every((key) => key.startsWith('bifrost:'))).toBe(true);
  });

  it('proposes centroid synthesis when the centroid cache is only partially warm and Qdrant is reachable', async () => {
    const result = await rankAgenticRepairReadiness(input(), async (request) => {
      if (request.parameters.library === 'CENTROID_CACHE') {
        return observation('CENTROID_CACHE', {
          cacheHits: { numerator: 2, denominator: 10 },
        });
      }
      return observation(request.parameters.library);
    });

    const centroid = result.actions.find((action) => action.kind === 'CENTROID_SYNTHESIS');
    expect(centroid?.trigger).toBe(true);
    expect(centroid?.owner).toContain('centroid-cache.ts');
    expect(centroid?.sideEffectsAuthorized).toBe(false);
  });

  it('uses lookup only when the centroid cache reports a fully warm observation', async () => {
    const result = await rankAgenticRepairReadiness(input(), async (request) => {
      if (request.parameters.library === 'CENTROID_CACHE') {
        return observation('CENTROID_CACHE', {
          cacheHits: { numerator: 10, denominator: 10 },
        });
      }
      return observation(request.parameters.library);
    });

    expect(result.actions.some((action) => action.kind === 'CENTROID_LOOKUP' && action.trigger)).toBe(true);
    expect(result.actions.some((action) => action.kind === 'CENTROID_SYNTHESIS')).toBe(false);
  });
});
