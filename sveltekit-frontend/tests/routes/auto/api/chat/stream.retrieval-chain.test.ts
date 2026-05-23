// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chatStreamMocks,
  makeSummaryCard,
  makeSummaryCardsResponse,
  mockAceCacheMisses,
  resetChatStreamMocks,
} from './stream.test-harness.js';

const {
  mockRedisGet,
  mockCallTraceMcp,
  mockRetrieveSummaryCards,
  mockStreamBifrost,
} = chatStreamMocks;

describe('api/chat/stream retrieval-chain contracts', () => {
  beforeEach(() => {
    resetChatStreamMocks();
  });

  it('runs sourceRef -> graph -> turbovec -> engram retrieval chain before synthesis', async () => {
    mockAceCacheMisses();

    mockRetrieveSummaryCards.mockResolvedValue(
      makeSummaryCardsResponse({
        cacheKey: 'summary:chain:test',
        cards: [
          makeSummaryCard({
            cardKey: 'card-chain-1',
            path: 'src/routes/api/v1/chat/completions/+server.ts',
            summary: 'chat completion route summary',
            labels: ['contracts', 'chat'],
            graphNeighbors: ['file:src/lib/server/ai/gemma4-agent.ts'],
            qdrantScore: 0.88,
            score: 0.88,
          }),
        ],
      })
    );

    mockCallTraceMcp.mockImplementation(async (tool: string) => {
      if (tool === 'graph.expand_neighborhood') {
        return {
          ok: true,
          ms: 5,
          data: {
            ok: true,
            sourceRefs: [
              'src/routes/api/v1/chat/completions/+server.ts',
              'src/lib/server/ai/gemma4-agent.ts',
            ],
            nodes: [
              { sourceRef: 'src/routes/api/v1/chat/completions/+server.ts' },
              { sourceRef: 'src/lib/server/ai/gemma4-agent.ts' },
            ],
            edges: [
              {
                from: 'file:src/routes/api/v1/chat/completions/+server.ts',
                to: 'file:src/lib/server/ai/gemma4-agent.ts',
              },
            ],
            graphPaths: ['src/routes/api/v1/chat/completions/+server.ts -> src/lib/server/ai/gemma4-agent.ts'],
          },
        };
      }
      if (tool === 'turbovec.rank_chunks') {
        return {
          ok: true,
          ms: 4,
          data: {
            ok: true,
            ranked: [
              {
                sourceRef: 'src/routes/api/v1/chat/completions/+server.ts',
                finalScore: 0.91,
                reason: 'high vector and trust fit',
              },
              {
                sourceRef: 'src/lib/server/ai/gemma4-agent.ts',
                finalScore: 0.79,
                reason: 'graph-neighbor support',
              },
            ],
          },
        };
      }
      if (tool === 'engram.chat_memory_recent') {
        return {
          ok: true,
          ms: 3,
          data: {
            ok: true,
            memories: [{ summary: 'Prior assistant memory hint for chat stream reliability.' }],
          },
        };
      }
      return { ok: false, ms: 0, data: null, error: `unexpected tool: ${tool}` };
    });

    mockStreamBifrost.mockImplementation(async function* () {
      yield { type: 'token', content: 'chain-ok' };
      yield { type: 'done' };
    });

    const mod = await import('../../../../../src/routes/api/chat/stream/+server.js');
    const url = new URL('http://localhost/api/chat/stream?q=chat+completion+route&mode=ollama');
    const response = await mod.GET({
      request: new Request(url, { method: 'GET' }),
      url,
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"retrieval_chain"');
    expect(text).toContain('"stage":"sourceRef_exact_match"');
    expect(text).toContain('"stage":"graph.expand_neighborhood"');
    expect(text).toContain('"stage":"turbovec.rank_chunks"');
    expect(text).toContain('"stage":"engram.chat_memory_recent"');

    const chainTools = mockCallTraceMcp.mock.calls.map((call) => call[0]);
    expect(chainTools).toEqual([
      'graph.expand_neighborhood',
      'turbovec.rank_chunks',
      'engram.chat_memory_recent',
    ]);
  });

  it('falls back to toon rerank when chain ranking returns no ranked refs', async () => {
    mockAceCacheMisses();

    mockRetrieveSummaryCards.mockResolvedValue(
      makeSummaryCardsResponse({
        cacheKey: 'summary:fallback:test',
        cards: [
          makeSummaryCard({
            cardKey: 'card-fallback-1',
            path: 'src/lib/server/ai/gemma4-agent.ts',
            summary: 'gemma4 route helper summary',
            labels: ['chat', 'agent'],
            graphNeighbors: ['file:src/routes/api/chat/stream/+server.ts'],
            qdrantScore: 0.73,
            score: 0.73,
          }),
        ],
      })
    );

    mockCallTraceMcp.mockImplementation(async (tool: string) => {
      if (tool === 'graph.expand_neighborhood') {
        return {
          ok: true,
          ms: 6,
          data: {
            ok: true,
            sourceRefs: ['src/lib/server/ai/gemma4-agent.ts'],
            nodes: [{ sourceRef: 'src/lib/server/ai/gemma4-agent.ts' }],
            edges: [],
            graphPaths: [],
          },
        };
      }
      if (tool === 'turbovec.rank_chunks') {
        return {
          ok: true,
          ms: 5,
          data: {
            ok: true,
            ranked: [],
            sourceRefs: [],
          },
        };
      }
      if (tool === 'engram.chat_memory_recent') {
        return {
          ok: true,
          ms: 3,
          data: { ok: true, memories: [] },
        };
      }
      return { ok: false, ms: 0, data: null, error: `unexpected tool: ${tool}` };
    });

    mockStreamBifrost.mockImplementation(async function* () {
      yield { type: 'token', content: 'fallback-ok' };
      yield { type: 'done' };
    });

    const mod = await import('../../../../../src/routes/api/chat/stream/+server.js');
    const url = new URL('http://localhost/api/chat/stream?q=gemma4+agent+helper&mode=ollama');
    const response = await mod.GET({
      request: new Request(url, { method: 'GET' }),
      url,
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"rerank_breakdown"');
    expect(text).toContain('"source":"toon.rerankFeaturesWithBreakdown"');
    expect(text).toContain('"type":"token"');
    expect(text).toContain('fallback-ok');
    expect(text).toContain('"type":"error"');
    expect(text).toContain('"error":"Stream error"');

    const chainTools = mockCallTraceMcp.mock.calls.map((call) => call[0]);
    expect(chainTools).toEqual([
      'graph.expand_neighborhood',
      'turbovec.rank_chunks',
      'engram.chat_memory_recent',
    ]);
  });
});
