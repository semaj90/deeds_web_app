// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    TRITON_URL: 'http://triton.test',
    RERANKER_SIDECAR_URL: 'http://sidecar.test',
    CROSS_ENCODER_MODEL: undefined,
    TRITON_RERANKER_MODEL: undefined,
  },
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
  fastJsonParse: vi.fn((value: string) => JSON.parse(value)),
}));

import { parseRerankSidecarScores, scoreBatchCrossEncoder } from './triton-reranker.js';

const MODEL_ID = 'mixedbread-ai/mxbai-rerank-base-v2';

describe('mxbai reranker sidecar contract', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores an exact ranked response to request order', () => {
    expect(parseRerankSidecarScores({
      model_id: MODEL_ID,
      ranked: [
        { packet_key: '1', score: 0.2 },
        { packet_key: '0', score: 0.8 },
      ],
    }, MODEL_ID, 2)).toEqual([0.8, 0.2]);
  });

  it.each([
    ['wrong model', { model_id: 'other-model', ranked: [{ packet_key: '0', score: 0.5 }] }, 1],
    ['missing rows', { model_id: MODEL_ID, ranked: [{ packet_key: '0', score: 0.5 }] }, 2],
    ['duplicate rows', { model_id: MODEL_ID, ranked: [{ packet_key: '0', score: 0.5 }, { packet_key: '0', score: 0.4 }] }, 2],
    ['unknown row', { model_id: MODEL_ID, ranked: [{ packet_key: '0', score: 0.5 }, { packet_key: '2', score: 0.4 }] }, 2],
    ['non-finite score', { model_id: MODEL_ID, ranked: [{ packet_key: '0', score: Number.NaN }] }, 1],
    ['out-of-range score', { model_id: MODEL_ID, ranked: [{ packet_key: '0', score: 1.1 }] }, 1],
  ])('rejects %s instead of filling or coercing scores', (_name, response, candidateCount) => {
    expect(parseRerankSidecarScores(response, MODEL_ID, candidateCount)).toBeNull();
  });

  it('binds the requested model identity into the sidecar request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model_id: MODEL_ID,
      ranked: [
        { packet_key: '1', score: 0.25 },
        { packet_key: '0', score: 0.75 },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(scoreBatchCrossEncoder('find sessions', ['first', 'second'], MODEL_ID))
      .resolves.toEqual([0.75, 0.25]);

    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(request.model).toBe(MODEL_ID);
    expect(request.candidates).toEqual([
      { packet_key: '0', text: 'first' },
      { packet_key: '1', text: 'second' },
    ]);
  });
});
