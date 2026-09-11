import { describe, expect, it } from 'vitest';
import {
  crossencoderRerankOrchestrate,
  turboVecRerankWithCEFallback,
} from './crossencoder-rerank-orchestrator.js';
import type { BaseReranker, RetrievalHit } from './retrieval-contract.js';

const hits: RetrievalHit[] = [
  { id: 'a', score: 0.2, payload: { content: 'A' } },
  { id: 'b', score: 0.9, payload: { content: 'B' } },
];

describe('CrossEncoder package ownership boundary', () => {
  it('preserves input order when no application-owned base reranker is injected and CE is disabled', async () => {
    const result = await crossencoderRerankOrchestrate({
      query: 'test',
      hits,
      enableCrossEncoder: false,
    });

    expect(result.ok).toBe(true);
    expect(result.baseRerankerApplied).toBe(false);
    expect(result.crossencoderApplied).toBe(false);
    expect(result.hits.map((hit) => hit.id)).toEqual(['a', 'b']);
  });

  it('uses the injected application-owned base reranker without creating a package-local TurboVec owner', async () => {
    let calls = 0;
    const baseReranker: BaseReranker = async ({ query, hits: input }) => {
      calls += 1;
      return {
        ok: true,
        hits: [...input].sort((a, b) => b.score - a.score),
        latencyMs: 1,
        trace: {
          query,
          beforeIds: input.map((hit) => String(hit.id)),
          afterIds: [...input].sort((a, b) => b.score - a.score).map((hit) => String(hit.id)),
          scoreDeltas: {},
        },
      };
    };

    const result = await turboVecRerankWithCEFallback({
      query: 'test',
      hits,
      baseReranker,
    });

    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.baseRerankerApplied).toBe(true);
    expect(result.crossencoderApplied).toBe(false);
    expect(result.hits.map((hit) => hit.id)).toEqual(['b', 'a']);
  });

  it('propagates a failing injected base reranker as a non-authoritative failure result', async () => {
    const baseReranker: BaseReranker = async () => ({
      ok: false,
      hits: [],
      latencyMs: 1,
      error: 'BASE_RERANKER_FAILED',
    });

    const result = await crossencoderRerankOrchestrate({
      query: 'test',
      hits,
      baseReranker,
      enableCrossEncoder: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('BASE_RERANKER_FAILED');
    expect(result.baseRerankerApplied).toBe(true);
    expect(result.crossencoderApplied).toBe(false);
  });
});
