import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRerankWithCrossEncoder, mockGetRedis } = vi.hoisted(() => ({
  mockRerankWithCrossEncoder: vi.fn(),
  mockGetRedis: vi.fn(),
}));

vi.mock('./cross-encoder-reranker.js', () => ({
  rerankWithCrossEncoder: mockRerankWithCrossEncoder,
}));

vi.mock('$lib/server/retrieval/cross-encoder-reranker.js', () => ({
  rerankWithCrossEncoder: mockRerankWithCrossEncoder,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: mockGetRedis,
}));

import {
  DEFAULT_CANONICAL_RERANK_WEIGHTS,
  canonicalEnvelopeToRerankCandidate,
  rerankCanonicalFeatureEnvelopes,
  type CanonicalRerankEnvelope,
} from './canonical-rerank-executor.js';

function envelope(): CanonicalRerankEnvelope {
  return {
    chunk_id: 'chunk-domain-1',
    packet_key: 'packet-domain-1',
    source_ref: 'src/lib/server/retrieval/search-runtime.ts',
    content: 'retrieval search candidate',
    retrieved_rank: 1,
    domain_class: 'retrieval',
    metadata: {
      name: 'metadata',
      score: 0.99,
      matched_tags: ['retrieval'],
      confidence: 0.99,
    },
    dense: {
      name: 'dense',
      score: 0.8,
      qdrant_point_id: 'q-domain-1',
      metric: 'cosine',
      confidence: 0.8,
    },
  };
}

describe('canonical rerank domain boundary', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockRerankWithCrossEncoder.mockReset();
    mockGetRedis.mockReset();
    mockGetRedis.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    });
  });

  it('carries the categorical label without converting metadata.score into domain affinity', () => {
    const candidate = canonicalEnvelopeToRerankCandidate(envelope());

    expect(candidate.domainClass).toBe('retrieval');
    expect(candidate.domainScore).toBeUndefined();
    expect(candidate.rewardPrior).toBeUndefined();
    expect(candidate.domainClassMatch).toBeUndefined();
    expect(candidate.graphScore).toBe(0.99);
    expect(DEFAULT_CANONICAL_RERANK_WEIGHTS.domain).toBe(0);
  });

  it('keeps XGBoost reward_prior and domain_class_match neutral and independent when producers are absent', async () => {
    mockRerankWithCrossEncoder.mockRejectedValue(new Error('crossencoder unavailable'));

    let scoreBody: any = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (url.endsWith('/score')) {
        scoreBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ scores: [0.72], model: 'xgboost-sidecar' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    const result = await rerankCanonicalFeatureEnvelopes('find retrieval runtime', [envelope()], {
      cachePolicy: 'disabled',
      topK: 1,
    });

    expect(result.provenance.fallbackUsed).toBe(true);
    expect(scoreBody?.rows).toHaveLength(1);
    expect(scoreBody.rows[0].reward_prior).toBe(0.5);
    expect(scoreBody.rows[0].domain_class_match).toBe(0.5);
    expect(scoreBody.rows[0].community_conf).toBe(0.99);
    expect(scoreBody.rows[0].reward_prior).not.toBe(scoreBody.rows[0].community_conf);
    expect(scoreBody.rows[0].domain_class_match).not.toBe(scoreBody.rows[0].community_conf);
  });
});
