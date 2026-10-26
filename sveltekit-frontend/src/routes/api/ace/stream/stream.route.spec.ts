// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRevisionedPacket: vi.fn(),
  setRevisionedPacket: vi.fn(),
  buildPreamble: vi.fn(),
  runAceScript: vi.fn(),
}));

vi.mock('$lib/server/cache/ace-packet-cache.js', () => ({
  hashQuery: (query: string) => `ace:packet:${query}`,
  redisGetRevisionedAcePacketV1: (...args: unknown[]) => mocks.getRevisionedPacket(...args),
  redisSetRevisionedAcePacketV1: (...args: unknown[]) => mocks.setRevisionedPacket(...args),
}));

vi.mock('$lib/server/mcp/atlas-tools-client.js', () => ({
  buildStreamPreamble: (...args: unknown[]) => mocks.buildPreamble(...args),
}));

vi.mock('$lib/server/ace/ace-script-runner-v1.js', () => ({
  runAceScriptV1: (...args: unknown[]) => mocks.runAceScript(...args),
}));

vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
  LLAMA_SERVER_BASE_URL: 'http://llama.test',
  LOCAL_VLM_MODEL: 'fixture-model',
}));

import { POST } from './+server';

describe('POST /api/ace/stream admission gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildPreamble.mockResolvedValue(null);
    mocks.getRevisionedPacket.mockResolvedValue(null);
  });

  it('stops before packet construction, model dispatch, and cache writes without manifest identity', async () => {
    const modelFetch = vi.fn();
    vi.stubGlobal('fetch', modelFetch);

    const response = await POST({
      request: new Request('http://app.test/api/ace/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'explain the fixture' }),
      }),
      locals: { user: { id: 'fixture-user' } },
    } as never);

    const events = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(events).toContain('"type":"cache.blocked"');
    expect(events).toContain('"type":"synthesis.blocked"');
    expect(events).toContain('"reason":"ACE_CONTEXT_MANIFEST_ADMISSION_REQUIRED"');
    expect(events).toContain('"type":"done"');
    expect(mocks.runAceScript).not.toHaveBeenCalled();
    expect(mocks.buildPreamble).not.toHaveBeenCalled();
    expect(mocks.getRevisionedPacket).not.toHaveBeenCalled();
    expect(mocks.setRevisionedPacket).not.toHaveBeenCalled();
    expect(modelFetch).not.toHaveBeenCalled();

  });
});
