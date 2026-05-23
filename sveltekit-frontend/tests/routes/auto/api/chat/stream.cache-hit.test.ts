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
  mockRetrieveSummaryCards,
  mockGetPrefixToken,
  mockStreamBifrost,
  mockRecallEngramsForIntent,
  mockRunWorkflowLoop,
} = chatStreamMocks;

describe('api/chat/stream cache-hit short path', () => {
  beforeEach(() => {
    resetChatStreamMocks();
  });

  it('streams from ACE packet cache and skips retrieval lane', async () => {
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.startsWith('ace:completion:')) return null;
      if (key.startsWith('ace:packet:')) {
        return JSON.stringify({
          q: 'cached query',
          f: [{ p: 'src/lib/a.ts', l: ['x'], s: 'summary' }],
          m: [],
        });
      }
      return null;
    });

    const mod = await import('../../../../../src/routes/api/chat/stream/+server.js');
    const url = new URL('http://localhost/api/chat/stream?q=test-query&mode=ollama');

    const response = await mod.GET({
      request: new Request(url, { method: 'GET' }),
      url,
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const text = await response.text();
    expect(text).toContain('"type":"cache_hit"');
    expect(text).toContain('"tier":"ACE_packet"');
    expect(text).toContain('"type":"context_packet"');
    expect(text).toContain('"type":"token"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain('cached-packet-answer');

    expect(mockRetrieveSummaryCards).not.toHaveBeenCalled();
    expect(mockStreamBifrost).toHaveBeenCalledTimes(1);

    const bifrostCall = mockStreamBifrost.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
      headers?: Record<string, string>;
    };
    expect(bifrostCall.headers?.['x-bf-prefix-token']).toBe('ptok');
    expect(bifrostCall.messages[0]?.role).toBe('system');
    expect(bifrostCall.messages[0]?.content).toContain('prefix-id:');
  });

  it('falls back to full stable prefix when prefix token is unavailable', async () => {
    mockGetPrefixToken.mockResolvedValue(null);
    mockRedisGet.mockImplementation(async (key: string) => {
      if (key.startsWith('ace:completion:')) return null;
      if (key.startsWith('ace:packet:')) {
        return JSON.stringify({
          q: 'cached query',
          f: [{ p: 'src/lib/a.ts', l: ['x'], s: 'summary' }],
          m: [],
        });
      }
      return null;
    });

    const mod = await import('../../../../../src/routes/api/chat/stream/+server.js');
    const url = new URL('http://localhost/api/chat/stream?q=test-query&mode=ollama');

    const response = await mod.GET({
      request: new Request(url, { method: 'GET' }),
      url,
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"cache_hit"');
    expect(text).toContain('"tier":"ACE_packet"');

    expect(mockStreamBifrost).toHaveBeenCalledTimes(1);
    const bifrostCall = mockStreamBifrost.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
      headers?: Record<string, string>;
    };

    expect(bifrostCall.headers?.['x-bf-prefix-token']).toBeUndefined();
    expect(bifrostCall.messages[0]?.role).toBe('system');
    expect(bifrostCall.messages[0]?.content).toBe(
      'You are Deeds Legal AI. Use supplied context packets and keep legal reasoning explicit.'
    );
    expect(bifrostCall.messages[0]?.content).not.toContain('prefix-id:');
    const headerValues = Object.values(bifrostCall.headers ?? {}).join(' ');
    expect(headerValues).not.toContain('prefix-id:');
    expect(mockRetrieveSummaryCards).not.toHaveBeenCalled();
  });

  it('emits enriched error payload on streamed bifrost error events', async () => {
    mockGetPrefixToken.mockResolvedValue('ptok');
    mockRecallEngramsForIntent.mockResolvedValue([
      { id: 'engram-1', summary: 'Previous qdrant timeout mitigation' },
    ]);
    mockRunWorkflowLoop.mockResolvedValue({
      status: 'needs_review',
      classification: { lane: 'infra', riskScore: 0.72 },
      repair: { suggestedFixes: ['Restart qdrant and re-run retrieval smoke'] },
      smoke: { ok: false, checks: ['qdrant'] },
    });
    mockRetrieveSummaryCards.mockResolvedValue(
      makeSummaryCardsResponse({
        cacheKey: 'summary:cache:key',
        cards: [
          makeSummaryCard({
            cardKey: 'card-1',
            path: 'src/lib/server/retrieval/summary-card-retrieval.ts',
            summary: 'retrieval summary',
            qdrantScore: 0.84,
            score: 0.84,
          }),
        ],
      })
    );
    mockStreamBifrost.mockImplementation(async function* () {
      yield { type: 'error', error: 'qdrant upstream timeout' };
    });
    mockAceCacheMisses();

    const mod = await import('../../../../../src/routes/api/chat/stream/+server.js');
    const url = new URL('http://localhost/api/chat/stream?q=test-query&mode=ollama');
    const response = await mod.GET({
      request: new Request(url, { method: 'GET' }),
      url,
      params: {},
      locals: { user: { id: 'user-1' } },
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain('"hmm_error_class":"vector_infra_missing"');
    expect(text).toContain('"recommendations":["Restart qdrant and re-run retrieval smoke"]');
    expect(text).toContain('"engram_cards":[{"id":"engram-1"');
  });

});
