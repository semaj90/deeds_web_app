// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the heavy deps so this is a unit test on the facade orchestration,
// not a full integration test (the route handler test covers wiring).
const mocks = vi.hoisted(() => ({
  assembleACEContext:   vi.fn(),
  buildACEPromptCached: vi.fn(),
  bifrostChat:          vi.fn(),
  turboQuantChat:       vi.fn(),
  runGemma4Agent:       vi.fn(),
  recordRagAnswer:      vi.fn(),
  buildDevContextPlan:  vi.fn(),
  isCodingPrompt:       vi.fn(),
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  assembleACEContext:    mocks.assembleACEContext,
  buildACEPromptCached:  mocks.buildACEPromptCached,
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat:    mocks.bifrostChat,
  turboQuantChat: mocks.turboQuantChat,
  VLM_MODELS:     { legal: 'gemma4-legal-vlm:latest', tool: 'gemma4-legal-vlm:latest' },
}));

vi.mock('$lib/server/ai/gemma4-agent.js', () => ({
  runGemma4Agent: mocks.runGemma4Agent,
}));

vi.mock('$lib/server/ai/dev-context-planner.js', () => ({
  buildDevContextPlan: mocks.buildDevContextPlan,
  isCodingPrompt:      mocks.isCodingPrompt,
}));

vi.mock('$lib/server/cache/code-llm-index.js', () => ({
  recordRagAnswer: mocks.recordRagAnswer,
}));

describe('openai-facade — runChatCompletion', () => {
  beforeEach(() => {
    mocks.assembleACEContext.mockReset();
    mocks.buildACEPromptCached.mockReset();
    mocks.bifrostChat.mockReset();
    mocks.turboQuantChat.mockReset();
    mocks.runGemma4Agent.mockReset();
    mocks.recordRagAnswer.mockResolvedValue(undefined);
    mocks.buildDevContextPlan.mockResolvedValue(undefined);
    // Default: non-coding prompts; tests that want coding override this
    mocks.isCodingPrompt.mockReturnValue(false);
    // Default: TurboQuant throws so bifrostChat is used (existing test expectations)
    mocks.turboQuantChat.mockRejectedValue(new Error('TurboQuant unavailable'));
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

  it('routes coding prompts through the agent path and populates yorha.toolsUsed', async () => {
    mocks.isCodingPrompt.mockReturnValue(true);
    mocks.buildDevContextPlan.mockResolvedValue({
      contextSummary:     'auth module context',
      kvPacketTaskId:     'task:abc123',
      stablePrefixHash:   'hash:abc',
      selectedStableKeys: ['src/lib/server/auth/session.ts:1'],
      selectedFiles:      ['src/lib/server/auth/session.ts'],
      contextHitCount:    1,
      isCodingPrompt:     true,
      toolsUsed:          ['search.dev_context'],
    });
    mocks.runGemma4Agent.mockResolvedValue({
      answer:    'Here is the TypeScript fix...',
      toolsUsed: ['search.dev_context'],
      rounds:    1,
      cacheTier: undefined,
    });

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:     'yorha-legal',
      messages:  [{ role: 'user', content: 'Fix the TypeScript error in the auth module' }],
      file_path: 'src/lib/server/auth/session.ts',
      raw:       false,
      stream:    false,
      temperature: 0.2,
    });

    // Agent path — ACE not called
    expect(mocks.runGemma4Agent).toHaveBeenCalledWith(
      'Fix the TypeScript error in the auth module',
      expect.objectContaining({ pipeline: 'openai-facade' }),
    );
    expect(mocks.assembleACEContext).not.toHaveBeenCalled();
    // toolsUsed populated from agent result
    expect(res.yorha?.toolsUsed).toContain('search.dev_context');
    expect(res.yorha?.aceUsed).toBe(true);
    expect(res.choices[0].message.content).toBe('Here is the TypeScript fix...');
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
    mocks.turboQuantChat.mockReset();
    mocks.runGemma4Agent.mockReset();
    mocks.recordRagAnswer.mockResolvedValue(undefined);
    mocks.buildDevContextPlan.mockResolvedValue(undefined);
    mocks.isCodingPrompt.mockReturnValue(false);
    mocks.turboQuantChat.mockRejectedValue(new Error('TurboQuant unavailable'));
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
