// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockContextForFile, mockBuildPromptCards, mockLoadAtlasSummary } = vi.hoisted(() => ({
  mockContextForFile: vi.fn(),
  mockBuildPromptCards: vi.fn(),
  mockLoadAtlasSummary: vi.fn(),
}));

vi.mock('$lib/server/atlas/context-for-file.js', () => ({
  contextForFile: mockContextForFile,
}));

vi.mock('$lib/server/atlas/prompt-mapper.js', () => ({
  buildPromptCards: mockBuildPromptCards,
}));

vi.mock('$lib/server/atlas/atlas-loader.js', () => ({
  loadAtlasSummary: mockLoadAtlasSummary,
}));

describe('GET /api/ace/recommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the context-for-file packet for a filePath query', async () => {
    mockContextForFile.mockResolvedValue({
      filePath: 'src/mcp/trace-mcp-server.ts',
      normalizedPath: 'mcp/trace-mcp-server.ts',
      retrieval: {
        exactPath: 'src/mcp/trace-mcp-server.ts',
        directoryPath: 'src/mcp',
        peerScope: 'agentsDir',
      },
      directory: {
        path: 'src/mcp',
        rank: 7,
        agentsDir: 'src/mcp',
        topo: ['tooling'],
        clusters: ['trace'],
        tags: ['mcp'],
        tools: ['codebase.context_for_file'],
        constraints: [],
      },
      file: {
        rank: 0.91,
        reasons: ['authority=0.80'],
      },
      promptCards: [{ filePath: 'src/mcp/trace-mcp-server.ts', title: 'trace mcp' }],
      recommendedActions: ['inspect trace mcp owner'],
      provenance: {
        atlas: 'redis',
        generatedAt: '2026-08-02T00:00:00.000Z',
        sources: ['atlas(redis)'],
      },
    });

    const { GET } = await import('../../../../../src/routes/api/ace/recommendations/+server.js');
    const response = await GET({
      request: new Request('http://localhost/api/ace/recommendations?filePath=src/mcp/trace-mcp-server.ts'),
      locals: { user: { id: 'user-1' } },
      url: new URL('http://localhost/api/ace/recommendations?filePath=src/mcp/trace-mcp-server.ts'),
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(mockContextForFile).toHaveBeenCalledWith('src/mcp/trace-mcp-server.ts', { peerLimit: 8 });
    expect(await response.json()).toMatchObject({
      filePath: 'src/mcp/trace-mcp-server.ts',
      normalizedPath: 'mcp/trace-mcp-server.ts',
      retrieval: { peerScope: 'agentsDir' },
      provenance: { atlas: 'redis' },
    });
  });

  it('returns a stable empty envelope when unauthorized', async () => {
    const { GET } = await import('../../../../../src/routes/api/ace/recommendations/+server.js');
    const response = await GET({
      request: new Request('http://localhost/api/ace/recommendations?filePath=src/mcp/trace-mcp-server.ts'),
      locals: {},
      url: new URL('http://localhost/api/ace/recommendations?filePath=src/mcp/trace-mcp-server.ts'),
      params: {},
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      filePath: '',
      normalizedPath: '',
      retrieval: {
        exactPath: '',
        directoryPath: '',
        peerScope: 'none',
      },
      error: 'Unauthorized',
    });
  });
});
