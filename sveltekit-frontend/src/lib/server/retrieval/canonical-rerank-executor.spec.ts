import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRerankWithCrossEncoder } = vi.hoisted(() => ({
  mockRerankWithCrossEncoder: vi.fn(),
}));

const { mockGetRedis } = vi.hoisted(() => ({
  mockGetRedis: vi.fn(),
}));

vi.mock('$lib/server/retrieval/cross-encoder-reranker.js', () => ({
  rerankWithCrossEncoder: mockRerankWithCrossEncoder,
}));

vi.mock('./cross-encoder-reranker.js', () => ({
  rerankWithCrossEncoder: mockRerankWithCrossEncoder,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: mockGetRedis,
}));

import {
  buildCanonicalRerankCacheKey,
  canonicalEnvelopeToRerankCandidate,
  rerankCanonicalFeatureEnvelopes,
  type CanonicalRerankEnvelope,
} from './canonical-rerank-executor.js';

describe('canonical rerank executor', () => {
  const envelopes: CanonicalRerankEnvelope[] = [
    {
      chunk_id: 'chunk-1',
      packet_key: 'packet-1',
      feature_id: 'feature-1',
      source_ref: 'src/lib/example.ts',
      relative_path: 'src/lib/example.ts',
      content: 'example content',
      retrieved_rank: 4,
      dense: {
        name: 'dense',
        score: 0.92,
        qdrant_point_id: 'q-1',
        metric: 'cosine',
        confidence: 0.9,
      },
      lexical: {
        name: 'lexical',
        score: 0.83,
        matched_terms: ['example'],
        query_coverage: 0.5,
        confidence: 0.8,
      },
      authority: {
        name: 'authority',
        score: 0.72,
        page_rank: 0.41,
        confidence: 0.7,
      },
    },
    {
      chunk_id: 'chunk-2',
      packet_key: 'packet-2',
      feature_id: 'feature-2',
      source_ref: 'src/lib/other.ts',
      relative_path: 'src/lib/other.ts',
      content: 'other content',
      retrieved_rank: 5,
      dense: {
        name: 'dense',
        score: 0.72,
        qdrant_point_id: 'q-2',
        metric: 'cosine',
        confidence: 0.7,
      },
    },
  ];

  beforeEach(() => {
    mockRerankWithCrossEncoder.mockReset();
    mockGetRedis.mockReset();
    vi.unstubAllGlobals();
  });

  it('hydrates the canonical envelope spine and writes a cache entry on miss', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const setex = vi.fn().mockResolvedValue('OK');
    const del = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ get, setex, del });

    mockRerankWithCrossEncoder.mockResolvedValue({
      results: [
        {
          doc: { documentId: 'packet-1' },
          rerankScore: 0.94,
          cached: false,
        },
        {
          doc: { documentId: 'packet-2' },
          rerankScore: 0.81,
          cached: false,
        },
      ],
      stats: {
        l0Hit: false,
        l1Hits: 0,
        l1Misses: 2,
        freshScored: 2,
      },
    });

    const candidate = canonicalEnvelopeToRerankCandidate(envelopes[0]);
    expect(candidate.packetKey).toBe('packet-1');
    expect(candidate.sourceRef).toBe('src/lib/example.ts');
    expect(candidate.content).toBe('example content');
    expect(candidate.retrievedRank).toBe(4);

    const ranked = await rerankCanonicalFeatureEnvelopes('find canonical rerank', [...envelopes], {
      authScope: 'scope-a',
      rendererVersion: 'renderer-v1',
      maxLength: 256,
      topK: 20,
    });

    expect(mockRerankWithCrossEncoder).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(setex).toHaveBeenCalledTimes(1);
    expect(ranked.provenance.cacheStatus).toBe('miss');
    expect(ranked.provenance.crossEncoderAttempted).toBe(true);
    expect(ranked.provenance.crossEncoderUsed).toBe(true);
    expect(ranked.provenance.fallbackUsed).toBe(false);
    expect(ranked.results).toHaveLength(2);
    expect(ranked.results[0]?.packet_key).toBe('packet-1');
    expect(ranked.results[0]?.cross_encoder_score).toBeCloseTo(0.94, 2);
    expect(ranked.results[0]?.rank_after).toBe(1);
    expect(ranked.results[0]?.model_version).toBe('mixedbread-ai/mxbai-rerank-base-v2');
    expect(ranked.results[1]?.packet_key).toBe('packet-2');
    expect(ranked.results[1]?.rank_after).toBe(2);
  });

  it('routes the fast tier through MiniLM without changing the canonical executor owner', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const setex = vi.fn().mockResolvedValue('OK');
    const del = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ get, setex, del });

    mockRerankWithCrossEncoder.mockResolvedValue({
      results: [
        {
          doc: { documentId: 'packet-1' },
          rerankScore: 0.77,
          cached: false,
        },
        {
          doc: { documentId: 'packet-2' },
          rerankScore: 0.66,
          cached: false,
        },
      ],
      stats: {
        l0Hit: false,
        l1Hits: 0,
        l1Misses: 2,
        freshScored: 2,
      },
    });

    const ranked = await rerankCanonicalFeatureEnvelopes('find canonical rerank', [...envelopes], {
      authScope: 'scope-a',
      rendererVersion: 'renderer-v1',
      maxLength: 256,
      topK: 20,
      rerankTier: 'fast',
    });

    expect(mockRerankWithCrossEncoder).toHaveBeenCalledTimes(1);
    expect(mockRerankWithCrossEncoder).toHaveBeenCalledWith(
      'find canonical rerank',
      expect.any(Array),
      expect.objectContaining({
        noFallback: true,
        rerankTier: 'fast',
        modelVersion: 'cross-encoder/ms-marco-MiniLM-L6-v2',
      }),
    );
    expect(ranked.provenance.modelVersion).toBe('cross-encoder/ms-marco-MiniLM-L6-v2');
    expect(ranked.results[0]?.packet_key).toBe('packet-1');
    expect(ranked.results[0]?.model_version).toBe('cross-encoder/ms-marco-MiniLM-L6-v2');
  });

  it('returns a cached canonical rerank response without recomputing', async () => {
    const cachedPayload = {
      schemaVersion: 1,
      modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
      rendererVersion: 'renderer-v1',
      authScope: 'scope-a',
      maxLength: 256,
      topK: 20,
      queryHash: 'query-hash',
      candidateHash: 'candidate-hash',
      createdAt: new Date().toISOString(),
      results: [
        {
          packetKey: 'packet-1',
          score: 0.94,
          outputRank: 1,
        },
        {
          packetKey: 'packet-2',
          score: 0.81,
          outputRank: 2,
        },
      ],
    };
    const get = vi.fn().mockResolvedValue(JSON.stringify(cachedPayload));
    const setex = vi.fn().mockResolvedValue('OK');
    const del = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ get, setex, del });

    const ranked = await rerankCanonicalFeatureEnvelopes('find canonical rerank', [...envelopes], {
      authScope: 'scope-a',
      rendererVersion: 'renderer-v1',
      maxLength: 256,
      topK: 20,
    });

    expect(mockRerankWithCrossEncoder).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
    expect(setex).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(ranked.provenance.cacheStatus).toBe('hit');
    expect(ranked.provenance.crossEncoderAttempted).toBe(false);
    expect(ranked.provenance.fallbackUsed).toBe(false);
    expect(ranked.results[0]?.packet_key).toBe('packet-1');
    expect(ranked.results[0]?.cross_encoder_score).toBe(0.94);
    expect(ranked.results[0]?.rank_after).toBe(1);
  });

  it('deletes an invalid cache payload and recomputes', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify({
      schemaVersion: 1,
      modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
      rendererVersion: 'renderer-v1',
      authScope: 'scope-a',
      maxLength: 256,
      topK: 20,
      queryHash: 'query-hash',
      candidateHash: 'candidate-hash',
      createdAt: new Date().toISOString(),
      results: [
        {
          packetKey: 'packet-1',
          score: 0.94,
          outputRank: 1,
        },
        {
          packetKey: 'packet-9',
          score: 0.51,
          outputRank: 2,
        },
      ],
    }));
    const setex = vi.fn().mockResolvedValue('OK');
    const del = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ get, setex, del });

    mockRerankWithCrossEncoder.mockResolvedValue({
      results: [
        {
          doc: { documentId: 'packet-1' },
          rerankScore: 0.94,
          cached: false,
        },
        {
          doc: { documentId: 'packet-2' },
          rerankScore: 0.81,
          cached: false,
        },
      ],
      stats: {
        l0Hit: false,
        l1Hits: 0,
        l1Misses: 2,
        freshScored: 2,
      },
    });

    const ranked = await rerankCanonicalFeatureEnvelopes('find canonical rerank', [...envelopes], {
      authScope: 'scope-a',
      rendererVersion: 'renderer-v1',
      maxLength: 256,
      topK: 20,
    });

    expect(del).toHaveBeenCalledTimes(1);
    expect(mockRerankWithCrossEncoder).toHaveBeenCalledTimes(1);
    expect(ranked.provenance.cacheStatus).toBe('miss');
    expect(ranked.results[0]?.packet_key).toBe('packet-1');
  });

  it('treats candidate mismatch as cache rejection and rewrites the entry', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify({
      schemaVersion: 1,
      modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
      rendererVersion: 'renderer-v1',
      authScope: 'scope-a',
      maxLength: 256,
      topK: 20,
      queryHash: 'query-hash',
      candidateHash: 'candidate-hash',
      createdAt: new Date().toISOString(),
      results: [
        {
          packetKey: 'packet-9',
          score: 0.94,
          outputRank: 1,
        },
      ],
    }));
    const setex = vi.fn().mockResolvedValue('OK');
    const del = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ get, setex, del });

    mockRerankWithCrossEncoder.mockResolvedValue({
      results: [
        {
          doc: { documentId: 'packet-1' },
          rerankScore: 0.94,
          cached: false,
        },
        {
          doc: { documentId: 'packet-2' },
          rerankScore: 0.81,
          cached: false,
        },
      ],
      stats: {
        l0Hit: false,
        l1Hits: 0,
        l1Misses: 2,
        freshScored: 2,
      },
    });

    const ranked = await rerankCanonicalFeatureEnvelopes('find canonical rerank', [...envelopes], {
      authScope: 'scope-a',
      rendererVersion: 'renderer-v1',
      maxLength: 256,
      topK: 20,
    });

    expect(del).toHaveBeenCalledTimes(1);
    expect(mockRerankWithCrossEncoder).toHaveBeenCalledTimes(1);
    expect(setex).toHaveBeenCalledTimes(1);
    expect(ranked.provenance.cacheStatus).toBe('miss');
  });

  it('invalidates cache keys when model, order, or auth scope changes', () => {
    const base = {
      query: 'find canonical rerank',
      candidates: [
        { packetKey: 'packet-1', contentHash: 'content-a' },
        { packetKey: 'packet-2', contentHash: 'content-b' },
      ],
      modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
      rendererVersion: 'renderer-v1',
      authScope: 'scope-a',
      maxLength: 256,
      topK: 20,
    };

    const same = buildCanonicalRerankCacheKey(base);
    const differentModel = buildCanonicalRerankCacheKey({ ...base, modelVersion: 'mixedbread-ai/mxbai-rerank-large-v2' });
    const differentOrder = buildCanonicalRerankCacheKey({
      ...base,
      candidates: [...base.candidates].reverse(),
    });
    const differentScope = buildCanonicalRerankCacheKey({ ...base, authScope: 'scope-b' });

    expect(same).not.toEqual(differentModel);
    expect(same).not.toEqual(differentOrder);
    expect(same).not.toEqual(differentScope);
  });

  it('falls back to the XGBoost lane when the cross-encoder fails', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const setex = vi.fn().mockResolvedValue('OK');
    const del = vi.fn().mockResolvedValue(1);
    mockGetRedis.mockReturnValue({ get, setex, del });

    mockRerankWithCrossEncoder.mockRejectedValue(new Error('crossencoder unavailable'));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
      }
      if (url.endsWith('/score')) {
        return new Response(JSON.stringify({ scores: [0.88, 0.64], model: 'xgboost-sidecar' }), {
          status: 200,
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const ranked = await rerankCanonicalFeatureEnvelopes('find canonical rerank', [...envelopes], {
      authScope: 'scope-a',
      rendererVersion: 'renderer-v1',
      maxLength: 256,
      topK: 20,
    });

    expect(mockRerankWithCrossEncoder).toHaveBeenCalledTimes(1);
    expect(ranked.provenance.crossEncoderAttempted).toBe(true);
    expect(ranked.provenance.crossEncoderUsed).toBe(false);
    expect(ranked.provenance.fallbackUsed).toBe(true);
    expect(ranked.provenance.fallbackReason).toBe('crossencoder_unavailable');
    // Sidecar's real model identity is retained so reports can distinguish
    // true XGBoost scores from the local weighted fallback.
    expect(ranked.results[0]?.model_version).toBe('xgboost-sidecar');
    expect(setex).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('rerank fail-open contract (Session 188)', () => {
  const makeEnvelopes = (count: number): CanonicalRerankEnvelope[] =>
    Array.from({ length: count }, (_, index) => ({
      chunk_id: `chunk-${index + 1}`,
      packet_key: `packet-${index + 1}`,
      feature_id: `feature-${index + 1}`,
      source_ref: `src/lib/mod-${index + 1}.ts`,
      relative_path: `src/lib/mod-${index + 1}.ts`,
      content: `content for module ${index + 1}`,
      retrieved_rank: index + 1,
      dense: {
        name: 'dense' as const,
        score: 0.9 - index * 0.01,
        qdrant_point_id: `q-${index + 1}`,
        metric: 'cosine' as const,
        confidence: 0.8,
      },
    }));

  beforeEach(() => {
    mockRerankWithCrossEncoder.mockReset();
    mockGetRedis.mockReset();
    vi.unstubAllGlobals();
    mockGetRedis.mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    });
    // XGBoost sidecar unavailable in every test here
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
  });

  it('never converts non-empty retrieval into an empty result (both rerankers unavailable)', async () => {
    const input = makeEnvelopes(33);
    mockRerankWithCrossEncoder.mockRejectedValue(new Error('unavailable'));

    const output = await rerankCanonicalFeatureEnvelopes('test', input, {
      cachePolicy: 'disabled',
    });

    expect(output.results).toHaveLength(33);
    expect(output.results.every((row) => typeof row.rank_after === 'number')).toBe(true);
    expect(output.provenance.crossEncoderUsed).toBe(false);
    expect(output.provenance.fallbackUsed).toBe(true);
  });

  it('cross-encoder returning zero scored documents still yields the full ranked set', async () => {
    const input = makeEnvelopes(33);
    mockRerankWithCrossEncoder.mockResolvedValue({ results: [], stats: {} });

    const output = await rerankCanonicalFeatureEnvelopes('test', input, {
      cachePolicy: 'disabled',
    });

    expect(output.results).toHaveLength(33);
    expect(output.results.every((row) => typeof row.rank_after === 'number')).toBe(true);
  });

  it('preserves all candidate identities during reranking (topK does not truncate)', async () => {
    const input = makeEnvelopes(33);
    mockRerankWithCrossEncoder.mockResolvedValue({
      results: input.map((env, index) => ({
        doc: { documentId: env.packet_key },
        rerankScore: 0.9 - index * 0.01,
        cached: false,
      })),
      stats: {},
    });

    const output = await rerankCanonicalFeatureEnvelopes('test', input, {
      cachePolicy: 'disabled',
      topK: 3,
    });

    expect(new Set(output.results.map((row) => row.packet_key))).toEqual(
      new Set(input.map((row) => row.packet_key)),
    );
  });

  it('rejects duplicate reranker identities and survives via fallback', async () => {
    // Two envelopes with the same packet_key create duplicate identities in
    // the cross-encoder output → CROSS_ENCODER_INVALID_IDENTITY → fallback.
    const input = makeEnvelopes(2).map((env) => ({ ...env, packet_key: 'dup', feature_id: undefined }));
    mockRerankWithCrossEncoder.mockResolvedValue({
      results: [{ doc: { documentId: 'dup' }, rerankScore: 0.9, cached: false }],
      stats: {},
    });

    const output = await rerankCanonicalFeatureEnvelopes('test', input, {
      cachePolicy: 'disabled',
    });

    expect(output.results).toHaveLength(2);
    expect(output.provenance.crossEncoderUsed).toBe(false);
    expect(output.provenance.fallbackUsed).toBe(true);
  });

  it('fallback scores are finite and identities unchanged', async () => {
    const input = makeEnvelopes(10);
    mockRerankWithCrossEncoder.mockRejectedValue(new Error('unavailable'));

    const output = await rerankCanonicalFeatureEnvelopes('test', input, {
      cachePolicy: 'disabled',
    });

    expect(output.results).toHaveLength(10);
    for (const row of output.results) {
      expect(Number.isFinite(row.blended_score)).toBe(true);
      expect(Number.isFinite(row.rank_after)).toBe(true);
    }
    expect(new Set(output.results.map((row) => row.packet_key))).toEqual(
      new Set(input.map((row) => row.packet_key)),
    );
  });

  it('missing content does not throw (n_concepts derives from sourceRef/packetKey)', async () => {
    const input = makeEnvelopes(5).map((env) => ({ ...env, content: undefined }));
    mockRerankWithCrossEncoder.mockRejectedValue(new Error('unavailable'));
    // Sidecar reachable this time so the feature mapper actually runs
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (rawInput: any) => {
      const url = String(rawInput);
      if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'healthy' }), { status: 200 });
      if (url.endsWith('/score')) {
        return new Response(JSON.stringify({ scores: [0.9, 0.8, 0.7, 0.6, 0.5], model: 'xgboost-sidecar' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    const output = await rerankCanonicalFeatureEnvelopes('test', input, {
      cachePolicy: 'disabled',
    });

    expect(output.results).toHaveLength(5);
    expect(output.provenance.fallbackUsed).toBe(true);
    expect(output.provenance.modelVersion).toBe('xgboost-sidecar');
  });
});
