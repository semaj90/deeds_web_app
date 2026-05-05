// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the heavy deps so this is a unit test on the facade orchestration,
// not a full integration test (the route handler test covers wiring).
const mocks = vi.hoisted(() => ({
  assembleACEContext: vi.fn(),
  buildACEPromptCached: vi.fn(),
  bifrostChat:        vi.fn(),
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  assembleACEContext:    mocks.assembleACEContext,
  buildACEPromptCached:  mocks.buildACEPromptCached,
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: mocks.bifrostChat,
}));

describe('openai-facade — runChatCompletion', () => {
  beforeEach(() => {
    mocks.assembleACEContext.mockReset();
    mocks.buildACEPromptCached.mockReset();
    mocks.bifrostChat.mockReset();
  });

  it('extracts last user message as query, earlier messages as history', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [{}, {}],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt:   'You are YorHA.',
      contextWindow:  '...chunks...',
    });
    mocks.bifrostChat.mockResolvedValue('Test response');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'yorha-legal',
      messages: [
        { role: 'system',    content: 'Be concise.' },
        { role: 'user',      content: 'first turn' },
        { role: 'assistant', content: 'replied' },
        { role: 'user',      content: 'what is hearsay?' },
      ],
      temperature: 0.3,
      raw:    false,
      stream: false,
    });

    expect(res.object).toBe('chat.completion');
    expect(res.choices).toHaveLength(1);
    expect(res.choices[0].message.content).toBe('Test response');
    expect(res.choices[0].finish_reason).toBe('stop');
    expect(res.model).toBe('gemma4-legal-vlm:latest'); // mapped from yorha-legal

    // ACE called with the LAST user message as query
    expect(mocks.assembleACEContext).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'what is hearsay?' }),
    );

    // bifrostChat received system + history + last user
    const messages = mocks.bifrostChat.mock.calls[0][0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Be concise.'); // system preamble preserved
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'what is hearsay?' });
  });

  it('routes raw:true requests directly to bifrostChat (skips ACE)', async () => {
    mocks.bifrostChat.mockResolvedValue('Raw response');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'yorha-legal',
      messages: [{ role: 'user', content: 'hi' }],
      raw:      true,
      stream:   false,
      temperature: 0.3,
    });

    expect(res.choices[0].message.content).toBe('Raw response');
    expect(mocks.assembleACEContext).not.toHaveBeenCalled();
    expect(res.yorha?.aceUsed).toBe(false);
  });

  it('reports yorha.cacheHit=prior-answer when codeLlmHit is present', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [], kbChunks: [], caseChunks: [], chatHistory: [],
      agentsMd: null,
      codeLlmHit: { llmOutput: 'cached', path: 'src/foo.ts', source: 'rag', priorHits: 2, generatedAt: new Date().toISOString() },
    });
    mocks.buildACEPromptCached.mockResolvedValue({ systemPrompt: 'sys', contextWindow: '' });
    mocks.bifrostChat.mockResolvedValue('Refined answer');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'gemma4-legal',
      messages: [{ role: 'user', content: 'q' }],
      file_path: 'src/foo.ts',
      raw:      false,
      stream:   false,
      temperature: 0.3,
    });

    expect(res.yorha?.codeLlmHit).toBe(true);
    expect(res.yorha?.cacheHit).toBe('prior-answer');
  });

  it('throws when last message is not a user message', async () => {
    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    await expect(
      runChatCompletion({
        model:    'yorha-legal',
        messages: [{ role: 'system', content: 'system only' }],
        raw:      false,
        stream:   false,
        temperature: 0.3,
      }),
    ).rejects.toThrow(/No user query/);
  });
});

describe('openai-facade — POST /api/v1/chat/completions handler', () => {
  beforeEach(() => {
    mocks.assembleACEContext.mockReset();
    mocks.buildACEPromptCached.mockReset();
    mocks.bifrostChat.mockReset();
  });

  it('returns 401 without locals.user', async () => {
    const { POST } = await import('../src/routes/api/v1/chat/completions/+server.js');
    const res = await POST({
      request: new Request('http://x', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }] }) }),
      locals:  {},
    } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 400 on stream:true', async () => {
    const { POST } = await import('../src/routes/api/v1/chat/completions/+server.js');
    const res = await POST({
      request: new Request('http://x', {
        method: 'POST',
        body:   JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }], stream: true }),
      }),
      locals: { user: { id: 'u1' } },
    } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('streaming_not_supported');
  });

  it('returns 400 on missing messages', async () => {
    const { POST } = await import('../src/routes/api/v1/chat/completions/+server.js');
    const res = await POST({
      request: new Request('http://x', { method: 'POST', body: JSON.stringify({ model: 'm' }) }),
      locals:  { user: { id: 'u1' } },
    } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_params');
  });
});
