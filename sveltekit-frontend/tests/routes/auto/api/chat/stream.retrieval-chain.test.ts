// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  mockAceCacheMisses,
  chatStreamMocks,
  resetChatStreamMocks,
} from './stream.test-harness.js';

const {
  mockRedisGetAcePacket,
  mockFetch,
} = chatStreamMocks;

describe('api/chat/stream retrieval-chain contracts', () => {
  beforeEach(() => {
    resetChatStreamMocks();
  });

  it('emits retrieval.start and ace.packet on cache miss before upstream streaming', async () => {
    mockAceCacheMisses();
    mockRedisGetAcePacket.mockResolvedValue(null);

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
    expect(text).toContain('"type":"cache.miss"');
    expect(text).toContain('"type":"retrieval.start"');
    expect(text).toContain('"type":"ace.packet"');
    expect(text).toContain('cached-packet-answer');
    expect(text).toContain('"type":"trace.saved"');
    expect(text).toContain('"type":"done"');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('emits error payload when upstream streaming fails after packet build', async () => {
    mockAceCacheMisses();
    mockRedisGetAcePacket.mockResolvedValue(null);

    mockFetch.mockRejectedValueOnce(new Error('upstream timeout'));

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
    expect(text).toContain('"type":"cache.miss"');
    expect(text).toContain('"type":"retrieval.start"');
    expect(text).toContain('"type":"error"');
    expect(text).toContain('"message":"upstream timeout"');
    expect(text).toContain('"type":"done"');
  });
});
