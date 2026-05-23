import { describe, expect, it, vi } from 'vitest';
import { logIntentEvalEvent, rankIntent } from '../intent-ranker.js';

const emptyEngramAdapter = {
  getRoutingHints: async (query: string) => ({
    queryHash: `hash:${query}`,
    didYouMean: undefined,
    priorQueries: [],
    bmuHints: [],
    clusterHints: [],
    workflowMemories: [],
    source: 'local-engram' as const,
    trust: 'low_hint' as const,
  }),
  recordTransition: async () => {},
  recordWorkflowMemory: async () => {},
};

describe('ACE Engram intent ranker', () => {
  it('returns exact_cache_answer when exact cache feature is injected', async () => {
    const decision = await rankIntent(
      {
        query: 'repeat query',
        model: 'gemma4-legal-vlm:latest',
        completionKey: 'cache-key-12345678',
        exactCacheEntry: {
          content: 'cached answer',
          model: 'gemma4-legal-vlm:latest',
          backend: 'test',
          cachedAt: new Date().toISOString(),
          promptTokens: 12,
          completionTokens: 4,
          cachedPromptTokens: 9,
        },
      },
      {
        engramAdapter: emptyEngramAdapter,
        intentClassifier: async () => ({ intent: 'chat_direct', confidence: 0.4, reasoning: 'test', suggestedTools: [] }),
      }
    );

    expect(decision.decision).toBe('exact_cache_answer');
    expect(decision.rankedCandidates[0].decision).toBe('exact_cache_answer');
    expect(decision.rankingLoss.bestDecision).toBe('exact_cache_answer');
    expect(decision.rankingLoss.margin).toBeGreaterThan(0);
    expect(decision.selectedFeatureInputs.exactCacheHit).toBe(true);
  });

  it('returns show_did_you_mean for strong Engram or BMU signal', async () => {
    const decision = await rankIntent(
      {
        query: 'where is the ace cache retrival',
        model: 'gemma4-legal-vlm:latest',
      },
      {
        engramAdapter: {
          ...emptyEngramAdapter,
          getRoutingHints: async () => ({
            queryHash: 'hash',
            didYouMean: 'where is the ACE cache retrieval',
            priorQueries: ['where is the ACE cache retrieval'],
            bmuHints: ['4:7'],
            clusterHints: [],
            workflowMemories: [],
            source: 'local-engram' as const,
            trust: 'low_hint' as const,
          }),
        },
        intentClassifier: async () => ({ intent: 'code_search', confidence: 0.35, reasoning: 'test', suggestedTools: ['search__dev_context'] }),
      }
    );

    expect(decision.decision).toBe('show_did_you_mean');
    expect(decision.rankedCandidates[0].decision).toBe('show_did_you_mean');
    expect(decision.didYouMean?.[0]?.query).toContain('ACE cache');
    expect(decision.rankingLoss.negativeLogLikelihood).toBeGreaterThanOrEqual(0);
  });

  it('returns prior query reformulation suggestions when only priorQueries exist', async () => {
    const decision = await rankIntent(
      {
        query: 'find evidence chain',
        model: 'gemma4-legal-vlm:latest',
      },
      {
        engramAdapter: {
          ...emptyEngramAdapter,
          getRoutingHints: async () => ({
            queryHash: 'hash',
            didYouMean: undefined,
            priorQueries: ['find evidence chain history', 'find evidence chain examples'],
            bmuHints: [],
            clusterHints: [],
            workflowMemories: [],
            source: 'local-engram' as const,
            trust: 'low_hint' as const,
          }),
        },
        intentClassifier: async () => ({ intent: 'code_search', confidence: 0.35, reasoning: 'test', suggestedTools: [] }),
      }
    );

    expect(decision.decision).toBe('show_did_you_mean');
    expect(decision.didYouMean?.[0]?.query).toBe('find evidence chain history');
    expect(decision.didYouMean?.[0]?.source).toBe('accepted_reformulation');
  });

  it('returns run_retrieval when confidence is low and no shortcut signal exists', async () => {
    const decision = await rankIntent(
      {
        query: 'ambiguous thing',
        model: 'gemma4-legal-vlm:latest',
      },
      {
        engramAdapter: emptyEngramAdapter,
        intentClassifier: async () => ({ intent: 'chat_direct', confidence: 0.2, reasoning: 'test', suggestedTools: [] }),
      }
    );

    expect(decision.decision).toBe('run_retrieval');
    expect(decision.rankedCandidates[0].decision).toBe('run_retrieval');
    expect(decision.rankingLoss.bestDecision).toBe('run_retrieval');
  });

  it('does not use the model-backed classifier by default', async () => {
    const decision = await rankIntent(
      {
        query: 'find code files for Redis cache',
        model: 'gemma4-legal-vlm:latest',
      },
      {
        engramAdapter: emptyEngramAdapter,
      }
    );

    expect(decision.intentLabel).toBe('code_search');
    expect(decision.intentConfidence).toBeGreaterThan(0);
  });

  it('does not refetch exact cache when caller already checked it', async () => {
    let fetchCount = 0;
    const decision = await rankIntent(
      {
        query: 'already checked cache',
        model: 'gemma4-legal-vlm:latest',
        completionKey: 'cache-key',
        exactCacheEntry: null,
        exactCacheChecked: true,
      },
      {
        exactMatchCacheFetcher: async () => {
          fetchCount += 1;
          return null;
        },
        engramAdapter: emptyEngramAdapter,
        intentClassifier: async () => ({ intent: 'code_search', confidence: 0.4, reasoning: 'test', suggestedTools: [] }),
      }
    );

    expect(fetchCount).toBe(0);
    expect(decision.cacheKeys).toContain('cache-key');
  });

  it('never throws when dependencies fail', async () => {
    await expect(rankIntent(
      {
        query: 'redis is down',
        model: 'gemma4-legal-vlm:latest',
        completionKey: 'cache-key',
        embedding: [0.1, 0.2, 0.3],
      },
      {
        exactMatchCacheFetcher: async () => { throw new Error('redis unavailable'); },
        engramAdapter: {
          ...emptyEngramAdapter,
          getRoutingHints: async () => { throw new Error('engram unavailable'); },
        },
        intentClassifier: async () => { throw new Error('intent unavailable'); },
        semanticSearcher: async () => { throw new Error('semantic unavailable'); },
        redisClient: {} as any,
      }
    )).resolves.toMatchObject({
      decision: 'run_retrieval',
    });
  });


  it('calculates target loss for best-fit evaluation labels', async () => {
    const decision = await rankIntent(
      {
        query: 'evaluate this target',
        model: 'gemma4-legal-vlm:latest',
        targetDecision: 'run_retrieval',
      },
      {
        engramAdapter: emptyEngramAdapter,
        intentClassifier: async () => ({ intent: 'code_search', confidence: 0.7, reasoning: 'test', suggestedTools: [] }),
      }
    );

    expect(decision.rankingLoss.targetDecision).toBe('run_retrieval');
    expect(decision.rankingLoss.targetLoss).toBeGreaterThanOrEqual(0);
    expect(decision.rankedCandidates.map((candidate) => candidate.decision)).toContain('run_retrieval');
  });

  it('normalizes candidate scores to a 0-1 distribution', async () => {
    const decision = await rankIntent(
      {
        query: 'check normalization',
        model: 'gemma4-legal-vlm:latest',
      },
      {
        engramAdapter: emptyEngramAdapter,
        intentClassifier: async () => ({ intent: 'architectural', confidence: 0.3, reasoning: 'test', suggestedTools: [] }),
      }
    );

    const scores = decision.rankedCandidates.map((candidate) => candidate.score);
    expect(scores.every((score) => score >= 0 && score <= 1)).toBe(true);
    expect(scores.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0.999);
    expect(scores.reduce((sum, value) => sum + value, 0)).toBeLessThan(1.001);
    expect(decision.rankedCandidates[0].probability).toBe(decision.rankedCandidates[0].score);
  });

  it('logs eval events without changing response behavior', async () => {
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logIntentEvalEvent({
      userId: 'user-1',
      sessionId: 'session-1',
      model: 'gemma4-legal-vlm:latest',
      queryHash: 'hash',
      decision: 'run_retrieval',
      confidence: 0.4,
      rankedCandidates: [
        { decision: 'run_retrieval', score: 0.7, rawScore: 1.2, probability: 0.7, reasons: ['test'] },
      ],
      rankingLoss: {
        bestDecision: 'run_retrieval',
        margin: 0.5,
        entropy: 0.3,
        negativeLogLikelihood: 0.35,
      },
      intentLabel: 'code_search',
      intentConfidence: 0.35,
      cacheKeys: [],
      featureInputs: {},
      durationMs: 1,
      queryPreview: 'log this',
    })).resolves.toBeUndefined();
    logSpy.mockRestore();
  });
});
