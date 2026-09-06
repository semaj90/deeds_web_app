// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisGetMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn(),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: redisGetMock,
    set: vi.fn(),
    setex: vi.fn(),
  }),
  redis: {
    get: redisGetMock,
    set: vi.fn(),
    setex: vi.fn(),
    hget: vi.fn(),
    hgetall: vi.fn(),
  },
}));

vi.mock('$lib/server/db/client', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_CHAT_MODEL: 'gemma4-rotorquant:latest',
    NEO4J_URI: 'bolt://127.0.0.1:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'legal_ai_pass',
    ROTORQUANT_MODEL_PATH: process.env.ROTORQUANT_MODEL_PATH ?? process.env.TURBO_MODEL_PATH,
  },
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateSingleEmbedding: vi.fn(),
}));

vi.mock('../../src/mcp/index.js', () => ({
  mcpTools: {},
}));

describe('agents_md quick hit resolution', () => {
  beforeEach(() => {
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValue(null);
  });

  it('prefers the nearest Redis mirror when present', async () => {
    redisGetMock.mockImplementation(async (key: string) =>
      key === 'agents:dir:src/mcp' ? '# Redis mirror winner' : null
    );

    const { resolveAgentsMdQuickHit } = await import('../../src/lib/server/graph/community-graph.ts');
    const hit = await resolveAgentsMdQuickHit('src/mcp/server.ts');

    expect(hit).toEqual(
      expect.objectContaining({
        markdown: '# Redis mirror winner',
        source: 'redis',
        resolvedPath: 'sveltekit-frontend/src/mcp/AGENTS.md',
        resolvedKey: 'agents:dir:src/mcp',
      })
    );
  });

  it('falls back to the nearest on-disk parent AGENTS.md when Redis misses', async () => {
    const { resolveAgentsMdQuickHit } = await import('../../src/lib/server/graph/community-graph.ts');
    const hit = await resolveAgentsMdQuickHit('src/lib/server/graph/nonexistent-child/foo.ts');

    expect(hit?.source).toBe('disk');
    expect(hit?.resolvedPath).toBe('sveltekit-frontend/src/lib/server/graph/AGENTS.md');
    expect(hit?.markdown).toContain('Directory audit: src/lib/server/graph');
  });

  it('falls back to the frontend root AGENTS.md when no nearer directory file exists', async () => {
    // Uses a synthetic, guaranteed-nonexistent directory chain rather than a
    // real repo path: buildLookupDirs/readAgentsMarkdown do pure string/path
    // walks with no directory-existence check, so a fabricated path exercises
    // the "no nearer file anywhere in the chain" case deterministically. A
    // previously-used real path (scripts/tests/nes-arch/...) stopped testing
    // this once sveltekit-frontend/scripts/AGENTS.md was added to the repo —
    // that intermediate file made the walk stop early, which is correct
    // resolver behavior but no longer exercised the root-fallback case this
    // test is named for.
    const { resolveAgentsMdQuickHit } = await import('../../src/lib/server/graph/community-graph.ts');
    const hit = await resolveAgentsMdQuickHit('zzz-synthetic-no-agents-md-anywhere/deeply/nested/foo.ts');

    expect(hit?.source).toBe('disk');
    expect(hit?.resolvedPath).toBe('sveltekit-frontend/AGENTS.md');
    // Root AGENTS.md was rewritten 2026-09-05 to replace a stale 1.16MB
    // generated index (moved to docs/reports/sveltekit-frontend-full-
    // repository-index-v1.md per this repo's archive-not-delete convention)
    // with a short hand-written file — the old '## Directory tree map'
    // heading no longer exists. Assert on the file's own stable title line
    // rather than content that's expected to keep evolving.
    expect(hit?.markdown).toContain('# AGENTS.md — sveltekit-frontend');
  });
});

describe('MCP agents_md tool', () => {
  beforeEach(() => {
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValue(null);
    vi.resetModules();
  });

  it('registers the tool and returns the resolved markdown payload', async () => {
    const { server, setupToolHandlers } = await import('../../src/mcp/server.ts');

    setupToolHandlers();

    const listHandler = (server as any)._requestHandlers.get('tools/list');
    const callHandler = (server as any)._requestHandlers.get('tools/call');

    const listResult = await listHandler({ method: 'tools/list', params: {} }, {});
    expect(listResult.tools.some((tool: { name: string }) => tool.name === 'agents_md')).toBe(true);

    const toolResult = await callHandler(
      {
        method: 'tools/call',
        params: {
          name: 'agents_md',
          arguments: { path: 'src/mcp/server.ts' },
        },
      },
      {}
    );

    const payload = JSON.parse(toolResult.content[0].text);
    expect(payload).toEqual(
      expect.objectContaining({
        path: 'src/mcp/server.ts',
        resolvedBy: 'disk',
        resolvedPath: 'sveltekit-frontend/src/mcp/AGENTS.md',
      })
    );
    expect(payload.markdown).toContain('Directory audit: src/mcp');
  });
});