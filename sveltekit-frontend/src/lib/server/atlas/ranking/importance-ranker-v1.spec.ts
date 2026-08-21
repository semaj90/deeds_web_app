import { describe, expect, it } from 'vitest';
import {
  adaptQasRowToImportanceRankInput,
  deriveRankProfile,
  rankImportance,
  rankImportanceBatch,
} from './importance-ranker-v1.js';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.importance-rank-input.v1' as const,
    requestId: 'req:1',
    canonicalId: 'symbol:alpha',
    ordinal: 0,
    workspaceRevision: 'workspace:1',
    graphRevision: 'graph:1',
    featureRevision: 'feature:1',
    features: {
      semanticRelevance: 0.9,
      lexicalRelevance: 0.7,
      astAffinity: 0.8,
      graphAuthority: 0.5,
      domainAffinity: 0.6,
      executionUtility: 0.7,
      evidenceStrength: 0.8,
    },
    graphSignals: {
      globalPageRank: 0.001,
      pageRankPercentile: 0.8,
      personalizedPageRank: 0.004,
      pprPercentile: 0.9,
      communityAffinity: 0.75,
      pathAffinity: 0.8,
    },
    profile: deriveRankProfile('repair compile failure'),
    ...overrides,
  };
}

describe('ImportanceRankerV1', () => {
  it('keeps globally important but irrelevant candidates below relevant candidates', () => {
    const relevant = rankImportance(baseInput());
    const centralButIrrelevant = rankImportance(baseInput({
      canonicalId: 'symbol:hub',
      ordinal: 1,
      features: {
        semanticRelevance: 0.03,
        lexicalRelevance: 0,
        astAffinity: 0,
        graphAuthority: 1,
        domainAffinity: 0.02,
        executionUtility: 0.2,
        evidenceStrength: 0.2,
      },
      graphSignals: {
        globalPageRank: 1,
        pageRankPercentile: 1,
        personalizedPageRank: 0.01,
        pprPercentile: 0.4,
        communityAffinity: 0.2,
        pathAffinity: 0.1,
      },
    }));

    expect(relevant.priorityScore).toBeGreaterThan(centralButIrrelevant.priorityScore);
    expect(centralButIrrelevant.importanceScore).toBeGreaterThan(centralButIrrelevant.relevanceScore);
  });

  it('prefers query-relative PPR over global PageRank in failure profile', () => {
    const profile = deriveRankProfile('runtime error repair');
    expect(profile.queryAuthorityWeight).toBeGreaterThan(profile.globalAuthorityWeight);
  });

  it('sorts deterministically by priority then relevance then canonical id', () => {
    const rows = rankImportanceBatch([
      baseInput({ canonicalId: 'symbol:b', ordinal: 1 }),
      baseInput({ canonicalId: 'symbol:a', ordinal: 0 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[0].canonicalId).toBe('symbol:a');
  });

  it('adapts the existing QAS six-feature row without becoming another feature owner', () => {
    const adapted = adaptQasRowToImportanceRankInput({
      ordinal: 4,
      row: {
        schema: 'atlas.qas.candidate-feature.v1',
        requestId: 'req:qas',
        canonicalId: 'symbol:q',
        packetKey: 'packet:q',
        symbolVersionId: 'sv:q',
        sourceRef: 'src/q.ts',
        workspaceRevision: 'workspace:1',
        sourceRevision: 'source:1',
        graphRevision: 'graph:1',
        featureRevision: 'feature:1',
        representationRevision: 'semantic_768:r1',
        policyRevision: 'policy:1',
        taskKind: 'symbol caller query',
        domainClass: 'code',
        somRevision: null,
        features: {
          semanticAffinity: 0.8,
          lexicalAffinity: 0.7,
          graphAuthority: 0.6,
          astAffinity: 0.9,
          processAffinity: 0.5,
          domainAffinity: 0.4,
          priorExecutionSuccess: 0.3,
          reuseProbability: 0.2,
          recency: 1,
        },
        logicalLanes: ['semantic', 'ast'],
        fusedRank: 2,
        rerankScore: 0.77,
        evidenceRefs: ['src/q.ts', 'receipt:test'],
      },
      graphSignals: { pageRankPercentile: 0.65, pprPercentile: 0.9 },
    });

    expect(adapted.features.semanticRelevance).toBe(0.8);
    expect(adapted.features.astAffinity).toBe(0.9);
    expect(adapted.profile.kind).toBe('SYMBOL_QUERY');
    expect(adapted.features.evidenceStrength).toBe(0.5);
  });
});
