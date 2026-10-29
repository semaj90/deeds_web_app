// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveLlamaInferenceTarget: vi.fn(),
  query: vi.fn(),
  ping: vi.fn(),
  exists: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
    OLLAMA_EMBED_MODEL: 'embeddinggemma:latest',
    QDRANT_URL: 'http://qdrant.test',
    LANGGRAPH_URL: 'http://langgraph.test',
  },
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({
  resolveLlamaInferenceTarget: (...args: unknown[]) => mocks.resolveLlamaInferenceTarget(...args),
}));

vi.mock('$lib/server/db/client', () => ({
  pool: { query: (...args: unknown[]) => mocks.query(...args) },
}));

vi.mock('$lib/server/redis.js', () => ({
  redis: {
    ping: (...args: unknown[]) => mocks.ping(...args),
    exists: (...args: unknown[]) => mocks.exists(...args),
  },
}));

import { GET } from './+server';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('GET /api/ace/health model ownership', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlamaInferenceTarget.mockResolvedValue({ model: 'ornith-1.5-9b', modelSource: 'llama-server-loaded' });
    mocks.query.mockResolvedValue({ rows: [{ total: 2, with_embedding: 1, with_summary: 2 }] });
    mocks.ping.mockResolvedValue('PONG');
    mocks.exists.mockResolvedValue(1);
  });

  it('checks chat on llama-server and Ollama only for embeddings', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === 'http://ollama.test/api/tags') return response({ models: [{ name: 'embeddinggemma:latest' }] });
      if (url === 'http://ollama.test/api/embed') return response({ embeddings: [[0.1, 0.2]] });
      if (url === 'http://qdrant.test/collections/codebase_chunks_768') return response({ result: { status: 'green', points_count: 4 } });
      if (url === 'http://qdrant.test/collections/codebase_chunks_768/points/query') return response({ result: { points: [{ id: 'fixture' }] } });
      if (url === 'http://langgraph.test/health') return response({ status: 'healthy', gpu: false });
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }));

    const result = await GET({ locals: { user: { id: 'fixture-user' } } } as never);
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.checks.llamaServer).toMatchObject({ ok: true, model: 'ornith-1.5-9b' });
    expect(body.checks.ollama).toMatchObject({ ok: true, embedModelLoaded: true, embedModel: 'embeddinggemma:latest' });
    expect(body.checks.ollama).not.toHaveProperty('chatModelLoaded');
    expect(mocks.resolveLlamaInferenceTarget).toHaveBeenCalledWith(5_000);
    expect(requestedUrls.some((url) => url.includes('/api/chat') || url.includes('/v1/chat/completions'))).toBe(false);
    expect(requestedUrls).toContain('http://qdrant.test/collections/codebase_chunks_768');
    expect(requestedUrls).toContain('http://langgraph.test/health');
  });

  it('rejects unauthenticated health requests without probing services', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const result = await GET({ locals: {} } as never);

    expect(result.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.resolveLlamaInferenceTarget).not.toHaveBeenCalled();
  });
});
