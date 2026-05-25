// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chatStreamMocks,
  resetChatStreamMocks,
} from './stream.test-harness.js';

const {
  mockRedisGetAcePacket,
  mockFetch,
} = chatStreamMocks;

describe('api/chat/stream cache-hit short path', () => {
  beforeEach(() => {
    resetChatStreamMocks();
  });

  it('streams from ACE packet cache and skips retrieval lane', async () => {
    mockRedisGetAcePacket.mockResolvedValue({
      query: 'cached query',
      cacheSources: ['redis'],
      sourceRefs: ['src/lib/a.ts:L1'],
      rankedCards: [],
      failureHints: [],
      nextActions: ['synthesis'],
      promptCacheKey: 'ace:prompt:cached',
      degraded: false,
      varianceRecovery: {
        exactMatchFailed: false,
        fuzzySearchCandidates: [],
        didYouMean: [],
        semanticSearchHits: [],
        qdrantTags: [],
        clusterTagRecall: [],
        langextractEntities: [],
        semanticCacheHits: [],
        acePacket: 'ace:prompt:cached',
        nextSteps: ['synthesis'],
      },
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
    expect(text).toContain('"type":"cache.hit"');
    expect(text).not.toContain('"type":"cache.miss"');
    expect(text).toContain('cached-packet-answer');
    expect(text).toContain('"type":"trace.saved"');
    expect(text).toContain('"type":"done"');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [upstreamUrl, upstreamInit] = mockFetch.mock.calls[0] ?? [];
    expect(String(upstreamUrl)).toContain('/v1/chat/completions');
    const upstreamBody = JSON.parse(String((upstreamInit as RequestInit | undefined)?.body ?? '{}'));
    expect(upstreamBody.messages[0]?.role).toBe('system');
    expect(upstreamBody.messages[1]?.role).toBe('user');
    expect(upstreamBody.messages[1]?.content).toContain('"query":"test-query"');
  });

  it('emits enriched error payload on streamed bifrost error events', async () => {
    mockRedisGetAcePacket.mockResolvedValue(null);
    mockFetch.mockRejectedValueOnce(new Error('qdrant upstream timeout'));

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
    expect(text).toContain('"message":"qdrant upstream timeout"');
  });

});
