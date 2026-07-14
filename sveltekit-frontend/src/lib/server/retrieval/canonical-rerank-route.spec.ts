import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRerankCanonicalFeatureEnvelopes } = vi.hoisted(() => ({
  mockRerankCanonicalFeatureEnvelopes: vi.fn(),
}));

vi.mock('$lib/server/retrieval/canonical-rerank-executor.js', () => ({
  rerankCanonicalFeatureEnvelopes: mockRerankCanonicalFeatureEnvelopes,
}));

import { POST } from '../../../routes/api/retrieval/canonical-rerank/+server.js';

describe('POST /api/retrieval/canonical-rerank smoke', () => {
  beforeEach(() => {
    mockRerankCanonicalFeatureEnvelopes.mockReset();
  });

  it('returns ranked canonical envelopes with provenance', async () => {
    mockRerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          chunk_id: 'chunk-1',
          packet_key: 'packet-1',
          source_ref: 'src/lib/example.ts',
          retrieved_rank: 1,
          cross_encoder_score: 0.93,
          blended_score: 0.91,
          rank_after: 1,
          model_version: 'mixedbread-ai/mxbai-rerank-base-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'rerank:v1:test',
        modelVersion: 'mixedbread-ai/mxbai-rerank-base-v2',
        rendererVersion: 'renderer-v1',
        authScope: 'scope-a',
        topK: 20,
        maxLength: 256,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 12,
      },
    });

    const request = new Request('http://localhost/api/retrieval/canonical-rerank', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-scope': 'scope-a' },
      body: JSON.stringify({
        query: 'find the canonical rerank spine',
        envelopes: [
          {
            chunk_id: 'chunk-1',
            packet_key: 'packet-1',
            source_ref: 'src/lib/example.ts',
            relative_path: 'src/lib/example.ts',
            summary: 'example summary',
            content: 'example content',
            dense: {
              name: 'dense',
              score: 0.91,
              qdrant_point_id: 'q-1',
              metric: 'cosine',
              confidence: 0.9,
            },
            lexical: {
              name: 'lexical',
              score: 0.81,
              matched_terms: ['example'],
              query_coverage: 0.5,
              confidence: 0.8,
            },
            authority: {
              name: 'authority',
              score: 0.7,
              page_rank: 0.42,
              confidence: 0.7,
            },
          },
        ],
        authScope: 'scope-a',
        rendererVersion: 'renderer-v1',
        maxLength: 256,
        topK: 20,
      }),
    });

    const response = await POST({ request } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockRerankCanonicalFeatureEnvelopes).toHaveBeenCalledTimes(1);
    expect(payload.query).toBe('find the canonical rerank spine');
    expect(payload.input_count).toBe(1);
    expect(payload.output_count).toBe(1);
    expect(payload.results[0].packet_key).toBe('packet-1');
    expect(payload.results[0].rank_after).toBe(1);
    expect(payload.results[0].cross_encoder_score).toBeCloseTo(0.93, 2);
    expect(payload.provenance.cacheStatus).toBe('miss');
    expect(payload.provenance.authScope).toBe('scope-a');
    expect(payload.top[0].model_version).toBe('mixedbread-ai/mxbai-rerank-base-v2');
  });
});
