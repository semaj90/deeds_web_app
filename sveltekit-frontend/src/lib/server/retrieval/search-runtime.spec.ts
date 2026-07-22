import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRetrieveAllCandidates } = vi.hoisted(() => ({
  mockRetrieveAllCandidates: vi.fn(),
}));

const { mockRerankCanonicalFeatureEnvelopes } = vi.hoisted(() => ({
  mockRerankCanonicalFeatureEnvelopes: vi.fn(),
}));

const { mockHydrateCandidates } = vi.hoisted(() => ({
  mockHydrateCandidates: vi.fn(),
}));

const { mockRecordPromotionIntent } = vi.hoisted(() => ({
  mockRecordPromotionIntent: vi.fn(),
}));

vi.mock('./retrieve-candidates.js', () => ({
  retrieveAllCandidates: mockRetrieveAllCandidates,
}));

vi.mock('./canonical-rerank-executor.js', () => ({
  rerankCanonicalFeatureEnvelopes: mockRerankCanonicalFeatureEnvelopes,
}));

vi.mock('./hydrate-candidates.js', () => ({
  hydrateCandidates: mockHydrateCandidates,
}));

vi.mock('./promote-results-outbox.js', () => ({
  recordPromotionIntent: mockRecordPromotionIntent,
}));

import { createSearchRuntime } from './search-runtime.js';

describe('search runtime bridge', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    );
    mockRetrieveAllCandidates.mockReset();
    mockRerankCanonicalFeatureEnvelopes.mockReset();
    mockHydrateCandidates.mockReset();
    mockRecordPromotionIntent.mockReset();
  });

  it('retrieves from multiple lanes, reranks canonically, and returns feature envelopes', async () => {
    mockRetrieveAllCandidates.mockResolvedValue([
      {
        id: 'chunk-bm25',
        packetKey: 'packet-1',
        sourceRef: 'src/lib/example.ts',
        summary: 'bm25 summary',
        content: 'bm25 content',
        score: 0.9,
        scoreSource: 'postgres_trigram',
      },
      {
        id: 'chunk-qdrant-2',
        packetKey: 'packet-2',
        sourceRef: 'src/lib/other.ts',
        summary: 'qdrant summary 2',
        content: 'qdrant content 2',
        score: 0.81,
        scoreSource: 'qdrant',
      },
    ]);
    mockHydrateCandidates.mockResolvedValue([
      {
        packet_key: 'packet-1',
        source_ref: 'src/lib/example.ts',
        relative_path: 'src/lib/example.ts',
        summary: 'qdrant summary',
        content: 'qdrant content',
        retrieved_rank: 1,
        cross_encoder_score: 0.92,
        blended_score: 0.91,
        rank_after: 1,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
      {
        packet_key: 'packet-2',
        source_ref: 'src/lib/other.ts',
        relative_path: 'src/lib/other.ts',
        summary: 'qdrant summary 2',
        content: 'qdrant content 2',
        retrieved_rank: 2,
        cross_encoder_score: 0.81,
        blended_score: 0.79,
        rank_after: 2,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
    ] as any);
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-qdrant',
          packet_key: 'packet-1',
          source_ref: 'src/lib/example.ts',
          relative_path: 'src/lib/example.ts',
          summary: 'qdrant summary',
          content: 'qdrant content',
          retrieved_rank: 1,
          cross_encoder_score: 0.92,
          blended_score: 0.91,
          rank_after: 1,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
        {
          chunk_id: 'chunk-qdrant-2',
          packet_key: 'packet-2',
          source_ref: 'src/lib/other.ts',
          relative_path: 'src/lib/other.ts',
          summary: 'qdrant summary 2',
          content: 'qdrant content 2',
          retrieved_rank: 2,
          cross_encoder_score: 0.81,
          blended_score: 0.79,
          rank_after: 2,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'rerank:v1:test',
        modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
        rendererVersion: 'search-runtime-v1',
        authScope: 'public',
        topK: 2,
        maxLength: 4096,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 3,
      },
    });
    mockRecordPromotionIntent.mockResolvedValue(1);

    const runtime = createSearchRuntime({ userId: 'user-1' });
    const result = await runtime.search({
      text: 'canonical rerank spine',
      topK: 2,
    });

    expect(mockRetrieveAllCandidates).toHaveBeenCalledWith(
      'canonical rerank spine',
      { includeGenerated: false, includeLegacy: false },
      undefined,
      { includeVectorLanes: true }
    );
    expect(mockRerankCanonicalFeatureEnvelopes).toHaveBeenCalledTimes(1);
    expect(mockHydrateCandidates).toHaveBeenCalledTimes(1);
    expect(mockRecordPromotionIntent).toHaveBeenCalledTimes(1);
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]?.packet_key).toBe('packet-1');
    expect(result.provenance.rerankModel).toBe('mixedbread-ai/mxbai-rerank-base-v2');
    expect(result.provenance.rerankerUsed).toBe(true);
  });

  it('accepts hostile query strings as data and preserves the search contract', async () => {
    mockRetrieveAllCandidates.mockResolvedValue([
      {
        id: 'chunk-hostile',
        packetKey: 'packet-hostile',
        sourceRef: 'src/lib/example.ts',
        summary: 'hostile summary',
        content: 'hostile content',
        score: 0.7,
        scoreSource: 'postgres_trigram',
      },
    ]);
    mockHydrateCandidates.mockResolvedValue([
      {
        packet_key: 'packet-hostile',
        source_ref: 'src/lib/example.ts',
        relative_path: 'src/lib/example.ts',
        summary: 'hostile summary',
        content: 'hostile content',
        retrieved_rank: 1,
        cross_encoder_score: 0.71,
        blended_score: 0.7,
        rank_after: 1,
        model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
      },
    ] as any);
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-hostile',
          packet_key: 'packet-hostile',
          source_ref: 'src/lib/example.ts',
          relative_path: 'src/lib/example.ts',
          summary: 'hostile summary',
          content: 'hostile content',
          retrieved_rank: 1,
          cross_encoder_score: 0.71,
          blended_score: 0.7,
          rank_after: 1,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'rerank:v1:hostile',
        modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
        rendererVersion: 'search-runtime-v1',
        authScope: 'public',
        topK: 1,
        maxLength: 4096,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 2,
      },
    });
    mockRecordPromotionIntent.mockResolvedValue(1);

    const hostileQueries = [
      `'; DROP TABLE atlas_packets; --`,
      `') OR TRUE --`,
      `foo | !bar`,
      `pageRankScore:*`,
      `x <-> y`,
      `%_\\`,
    ];

    const runtime = createSearchRuntime({ userId: 'user-hostile' });

    for (const query of hostileQueries) {
      const result = await runtime.search({
        text: query,
        topK: 1,
      });

      expect(result.packets).toHaveLength(1);
      expect(mockRetrieveAllCandidates).toHaveBeenCalledWith(
        query,
        { includeGenerated: false, includeLegacy: false },
        undefined,
        { includeVectorLanes: true }
      );
    }
  });
});
