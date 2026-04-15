import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAssembleACEContext = vi.fn();
const mockBuildACEPromptCached = vi.fn();
const mockOllamaFetch = vi.fn();

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  assembleACEContext: mockAssembleACEContext,
  buildACEPromptCached: mockBuildACEPromptCached,
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
  },
}));

vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	getEmbeddingModelKeepAlive: () => '24h',
	getChatModel: () => 'gemma4-legal:latest',
	getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: mockOllamaFetch,
}));

describe('/api/ace/summarize route', () => {
  const caseId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();

    mockAssembleACEContext.mockResolvedValue({
      caseContext: 'Saved concepts:\n- Probable Cause: Reasonable grounds...',
      ragChunks: [{ content: 'Chunk 1', score: 0.88, source: 'doc-1' }],
      kagNeighbors: [{ nodeId: 'kg-1', title: 'Related authority' }],
      entities: {
        statutes: ['Cal. Penal Code 836'],
        cases: ['People v. Superior Court'],
        persons: ['Detective Hale'],
        organizations: [],
        dates: [],
      },
      practiceTemplate: { name: 'Criminal Procedure' },
    });

    mockBuildACEPromptCached.mockResolvedValue({
      systemPrompt: 'ACE SYSTEM PROMPT',
      confidenceFactors: {
        caseContext: 0.95,
        glossary: 0.8,
      },
    });

    mockOllamaFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          summary: 'Evidence supports probable cause under the current case theory.',
          keyInsights: ['Glossary concepts were included', 'Case context was included'],
          confidence: 0.86,
        }),
      }),
    });
  });

  it('returns summary data and route-level ACE metadata from the real handler', async () => {
    const { POST } = await import('../src/routes/api/ace/summarize/+server.js');

    const request = new Request('http://localhost/api/ace/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId,
        title: 'Search Warrant Affidavit',
        content: 'Facts establishing probable cause for the warrant application.',
      }),
    });

    const response = await POST({
      request,
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockAssembleACEContext).toHaveBeenCalledWith({
      query: 'Summarize this evidence: Search Warrant Affidavit',
      userId: 'user-1',
      caseId,
      conversationId: `board-${caseId}`,
      maxTokens: 2000,
    });
    expect(mockBuildACEPromptCached).toHaveBeenCalled();

    expect(mockOllamaFetch).toHaveBeenCalledWith(
      'http://ollama.test/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ACE SYSTEM PROMPT'),
      })
    );

    expect(body).toEqual({
      summary: 'Evidence supports probable cause under the current case theory.',
      keyInsights: ['Glossary concepts were included', 'Case context was included'],
      confidence: 0.86,
      aceContext: {
        caseContext: true,
        ragChunks: 1,
        kagNeighbors: 1,
        entities: 3,
        practiceArea: true,
      },
    });
  });

  it('returns 401 when the caller is unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/ace/summarize/+server.js');

    const request = new Request('http://localhost/api/ace/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId,
        title: 'Search Warrant Affidavit',
        content: 'Facts establishing probable cause for the warrant application.',
      }),
    });

    const response = await POST({
      request,
      locals: {},
    } as never);

    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockAssembleACEContext).not.toHaveBeenCalled();
    expect(mockBuildACEPromptCached).not.toHaveBeenCalled();
    expect(mockOllamaFetch).not.toHaveBeenCalled();
  });

  it('returns 500 when Ollama generation fails', async () => {
    const { POST } = await import('../src/routes/api/ace/summarize/+server.js');

    mockOllamaFetch.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    const request = new Request('http://localhost/api/ace/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId,
        title: 'Search Warrant Affidavit',
        content: 'Facts establishing probable cause for the warrant application.',
      }),
    });

    const response = await POST({
      request,
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Summarization failed' });
    expect(mockAssembleACEContext).toHaveBeenCalledTimes(1);
    expect(mockBuildACEPromptCached).toHaveBeenCalledTimes(1);
    expect(mockOllamaFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when neither content nor evidenceId is provided', async () => {
    const { POST } = await import('../src/routes/api/ace/summarize/+server.js');

    const request = new Request('http://localhost/api/ace/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId,
        title: 'Search Warrant Affidavit',
      }),
    });

    const response = await POST({
      request,
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Must provide either content or evidenceId' });
    expect(mockAssembleACEContext).not.toHaveBeenCalled();
    expect(mockBuildACEPromptCached).not.toHaveBeenCalled();
    expect(mockOllamaFetch).not.toHaveBeenCalled();
  });
});