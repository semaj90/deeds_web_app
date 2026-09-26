import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let streamBifrostChatCompletions: typeof import('./client.js').streamBifrostChatCompletions;

beforeAll(async () => {
  process.env.BIFROST_OPENAI_BASE_URL = 'http://127.0.0.1:3040/v1';
  ({ streamBifrostChatCompletions } = await import('./client.js'));
});

function streamingResponse(...lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('\n')));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('Bifrost :8090 compatibility envelope', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replays a bounded synthesis response through the OpenAI-compatible stream', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.model).toBe('ornith-1.5-9b');
      expect(request.stream).toBe(true);
      expect(request.max_tokens).toBe(32);
      return streamingResponse(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'bounded' } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: ' synthesis' } }] })}`,
        'data: [DONE]',
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    for await (const event of streamBifrostChatCompletions({
      model: 'ornith-1.5-9b',
      messages: [{ role: 'user', content: 'Summarize the admitted context.' }],
      maxTokens: 32,
    })) events.push(event);

    expect(events).toEqual([
      { type: 'token', content: 'bounded' },
      { type: 'token', content: ' synthesis' },
      { type: 'done' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves tool-role messages without switching the chat lane to Ollama', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.model).toBe('ornith-1.5-9b');
      expect(request.messages.at(-1)).toEqual({ role: 'tool', content: '{"ok":true}' });
      return streamingResponse('data: [DONE]');
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = [];
    for await (const event of streamBifrostChatCompletions({
      model: 'ornith-1.5-9b',
      messages: [
        { role: 'assistant', content: '' },
        { role: 'tool', content: '{"ok":true}' },
      ],
    })) events.push(event);

    expect(events).toEqual([{ type: 'done' }]);
  });
});
