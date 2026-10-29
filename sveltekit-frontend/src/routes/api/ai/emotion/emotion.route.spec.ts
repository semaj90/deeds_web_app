// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './+server.js';

vi.mock('$lib/server/auth-utils.js', () => ({
  requireUser: vi.fn((event: { locals: { user?: unknown } }) => {
    if (!event.locals.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
    return event.locals.user;
  }),
}));

vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
  LLAMA_SERVER_BASE_URL: 'http://127.0.0.1:8090/v1',
  getActiveLocalVlmModel: vi.fn(async () => 'llama-server-loaded-test-model'),
}));

function makeEvent(body: unknown) {
  const req = new Request('http://localhost/api/ai/emotion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request: req, locals: { user: { id: 1 } } } as any;
}

function mockLlama(opts: { vision: boolean; content?: string; chatStatus?: number }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/props')) {
      return new Response(JSON.stringify({ modalities: { vision: opts.vision } }), { status: 200 });
    }
    if (u.endsWith('/chat/completions')) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: opts.content ?? 'neutral' } }] }),
        { status: opts.chatStatus ?? 200 },
      );
    }
    return new Response('not found', { status: 404 });
  });
}

describe('POST /api/ai/emotion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated callers before parsing or contacting llama-server', async () => {
    const request = new Request('http://localhost/api/ai/emotion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    await expect(POST({ request, locals: {} } as any)).rejects.toMatchObject({ status: 401 });
  });

  it('400 on invalid JSON', async () => {
    const res = await POST(makeEvent('{not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('400 when imageBase64 is missing or empty', async () => {
    for (const body of [{}, { imageBase64: '' }, { imageBase64: 5 }]) {
      const res = await POST(makeEvent(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('missing_imageBase64');
    }
  });

  it('503 vision_unavailable when :8090 is text-only, and never asks the model', async () => {
    const fetchMock = mockLlama({ vision: false });
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(makeEvent({ imageBase64: 'AAAA' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ emotion: null, error: 'vision_unavailable' });
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/chat/completions'))).toBe(false);
  });

  it('sends the image as an OpenAI image_url part and returns a closed-set emotion', async () => {
    const fetchMock = mockLlama({ vision: true, content: ' Happy.\n' });
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(makeEvent({ imageBase64: 'data:image/jpeg;base64,QUJD' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emotion: 'happy' });

    const chat = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/chat/completions'))!;
    const sent = JSON.parse((chat[1] as RequestInit).body as string);
    expect(sent.model).toBe('llama-server-loaded-test-model');
    const parts = sent.messages[0].content;
    expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
    expect(sent.messages[0].images).toBeUndefined();
  });

  it('returns null for an answer outside the closed emotion set', async () => {
    vi.stubGlobal('fetch', mockLlama({ vision: true, content: 'confused' }));
    const res = await POST(makeEvent({ imageBase64: 'AAAA' }));
    expect(await res.json()).toEqual({ emotion: null });
  });

  it('502 when llama-server errors', async () => {
    vi.stubGlobal('fetch', mockLlama({ vision: true, chatStatus: 500 }));
    const res = await POST(makeEvent({ imageBase64: 'AAAA' }));
    expect(res.status).toBe(502);
  });
});
