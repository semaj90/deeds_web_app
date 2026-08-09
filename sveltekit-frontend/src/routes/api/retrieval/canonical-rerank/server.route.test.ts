// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  rerankCanonicalFeatureEnvelopes: vi.fn(),
}));

vi.mock('$lib/server/retrieval/canonical-rerank-executor.js', () => ({
  rerankCanonicalFeatureEnvelopes: (...args: unknown[]) => mocks.rerankCanonicalFeatureEnvelopes(...args),
}));

vi.mock('$lib/server/retrieval/feature-envelope.js', () => ({
  FeatureEnvelopeSchema: z.object({}).passthrough(),
}));

describe('/api/retrieval/canonical-rerank', () => {
  beforeEach(() => {
    mocks.rerankCanonicalFeatureEnvelopes.mockReset();
    mocks.rerankCanonicalFeatureEnvelopes.mockResolvedValue({
      results: [
        {
          packet_key: 'packet-1',
          feature_id: 'feature-1',
          source_ref: 'src/lib/example.ts',
          retrieved_rank: 1,
          rank_after: 1,
          cross_encoder_score: 0.91,
          blended_score: 0.91,
          model_version: 'cross-encoder/ms-marco-MiniLM-L6-v2',
        },
      ],
      provenance: {
        cacheStatus: 'miss',
        cacheKey: 'cache-key',
        modelVersion: 'cross-encoder/ms-marco-MiniLM-L6-v2',
        rendererVersion: 'canonical-envelope-v1',
        authScope: 'public',
        topK: 1,
        maxLength: 4096,
        crossEncoderAttempted: true,
        crossEncoderUsed: true,
        fallbackUsed: false,
        latencyMs: 1,
      },
    });
  });

  it('passes the requested rerank tier through to the canonical executor', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/retrieval/canonical-rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'find canonical rerank',
        rerankTier: 'fast',
        envelopes: [
          {
            packet_key: 'packet-1',
            feature_id: 'feature-1',
            source_ref: 'src/lib/example.ts',
            content: 'example content',
          },
        ],
      }),
    });

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
    expect(mocks.rerankCanonicalFeatureEnvelopes).toHaveBeenCalledTimes(1);
    expect(mocks.rerankCanonicalFeatureEnvelopes).toHaveBeenCalledWith(
      'find canonical rerank',
      expect.any(Array),
      expect.objectContaining({
        rerankTier: 'fast',
      }),
    );

    const body = await response.json();
    expect(body.provenance.modelVersion).toBe('cross-encoder/ms-marco-MiniLM-L6-v2');
    expect(body.top[0].model_version).toBe('cross-encoder/ms-marco-MiniLM-L6-v2');
  });
});
