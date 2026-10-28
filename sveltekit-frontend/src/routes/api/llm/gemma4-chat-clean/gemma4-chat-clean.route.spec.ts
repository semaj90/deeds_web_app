// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './+server.js';

const requireUserOrService = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/auth-utils.js', () => ({ requireUserOrService }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { LLAMA_SERVER_URL: 'http://127.0.0.1:8090' } }));
vi.mock('$lib/server/ai/llama-server-model-resolver.js', () => ({
  resolveLoadedLlamaModel: vi.fn(async () => ({ resolvedModel: 'ornith-1.5-9b' })),
}));

function makeEvent(body: unknown) {
  const req = new Request('http://localhost/api/llm/gemma4-chat-clean', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request: req, locals: {} } as any;
}

const okMessages = [{ role: 'user', content: 'hello' }];

describe('POST /api/llm/gemma4-chat-clean (proxy to llama-server :8090)', () => {
  beforeEach(() => {
    requireUserOrService.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an unauthenticated caller before reading the body', async () => {
    requireUserOrService.mockImplementation(() => {
      throw Object.assign(new Error('Authentication required'), { status: 401 });
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(POST(makeEvent({ messages: okMessages }))).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON and on schema violations, without calling llama-server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(makeEvent('{nope'))).status).toBe(400);
    for (const bad of [
      {},
      { messages: [] },
      { messages: [{ role: 'root', content: 'x' }] },
      { messages: okMessages, max_tokens: 10_000_000 },
      { messages: okMessages, stream: true },
    ]) {
      expect((await POST(makeEvent(bad))).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only allowed fields, pins the resolved model, and sanitizes reasoning leaks', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Clean summary.' } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(
      makeEvent({ model: 'attacker-model', messages: okMessages, max_tokens: 64, extra: 'drop-me' }),
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(sent.model).toBe('ornith-1.5-9b');
    expect(sent.extra).toBeUndefined();
    expect(sent.max_tokens).toBe(64);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/chat/completions');
    expect((await res.json()).choices[0].message.content).toBe('Clean summary.');
  });

  it('propagates a llama-server error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503, statusText: 'Unavailable' })));
    const res = await POST(makeEvent({ messages: okMessages }));
    expect(res.status).toBe(503);
  });
});
