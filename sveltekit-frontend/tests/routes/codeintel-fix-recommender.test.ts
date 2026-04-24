// @vitest-environment node
/**
 * codeintel-fix-recommender.test.ts
 *
 * Covers:
 *   1. POST /api/codeintel/fix — stable JSON shape, auth, validation
 *   2. getFixRecommendations() — TS error, import error, Svelte 4→5 error
 *   3. Heuristic fallback when Gemma4 is unavailable
 *   4. No raw internal error leakage in public response
 *   5. Diagnostics shape always present and typed
 *   6. codeintel.fix_recommend MCP tool resolves and returns typed shape
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDbExecute, mockSearchCodebase, mockFetch, mockRunGemma4Agent, mockRerankChunks } = vi.hoisted(() => {
  const mockDbExecute = vi.fn();
  const mockSearchCodebase = vi.fn();
  const mockFetch = vi.fn();
  const mockRunGemma4Agent = vi.fn();
  const mockRerankChunks = vi.fn();
  return { mockDbExecute, mockSearchCodebase, mockFetch, mockRunGemma4Agent, mockRerankChunks };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/db/client', () => ({
  db: { execute: mockDbExecute },
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    CODEINTEL_GRPC_ENABLED: false,
    CODEINTEL_GRPC_URL: '127.0.0.1:50058',
  },
}));

vi.mock('$lib/server/indexer/dual-embedder.js', () => ({
  searchCodebase: mockSearchCodebase,
}));

vi.mock('$lib/server/ai/gemma4-agent.js', () => ({
  runGemma4Agent: mockRunGemma4Agent,
}));

vi.mock('$lib/server/retrieval/codebase-context.js', () => ({
  rerankChunks: mockRerankChunks,
  loadCodebaseContext: vi.fn().mockResolvedValue({ chunks: [], metadata: {} }),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const STABLE_KEYS: (keyof import('../../src/lib/server/codeintel/fix-recommender.js').FixRecommendResult)[] = [
  'ok', 'recommendations', 'diagnostics',
];

const STABLE_DIAGNOSTICS_KEYS = [
  'chunksSearched', 'chunksUsed', 'clusterHit', 'modelUsed',
  'latencyMs', 'searchQuery', 'degraded',
];

function makeOllamaOk(text: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ response: text }),
  } as unknown as Response);
}

function makeOllamaError(status = 503) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error('Ollama down')),
  } as unknown as Response);
}

const GEMMA_RECS_JSON = JSON.stringify({
  recommendations: [
    {
      title: 'Add missing property',
      explanation: 'The property X does not exist on type Y.',
      fix: 'type Y = { X: string }',
      confidence: 0.9,
      referenceFiles: ['src/types.ts'],
    },
  ],
});

const CHUNK_ROWS = {
  rows: [
    {
      relative_path: 'src/types.ts',
      domain: 'types',
      kind: 'type',
      semantic_tags: ['typescript', 'types'],
      gpu_cluster: 3,
      summary: 'Type definitions',
    },
  ],
};

const CLUSTER_ROWS = {
  rows: [
    {
      gpu_cluster: 3,
      purpose: 'TypeScript types layer',
      summary: 'Shared type definitions across the app.',
      patterns: ['types-first', 'shared-models'],
      warnings: [],
      tags: ['typescript', 'types'],
    },
  ],
};

function makeSearchHit(path = 'src/types.ts', cluster: number | null = 3) {
  return {
    chunk: {
      path,
      relativePath: path,
      content: 'export type Y = {}',
      kind: 'type',
      neo4j_gpuCluster: cluster,
    },
    score: 0.85,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getFixRecommendations() unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getFixRecommendations()', () => {
  let getFixRecommendations: typeof import('../../src/lib/server/codeintel/fix-recommender.js').getFixRecommendations;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockSearchCodebase.mockResolvedValue([makeSearchHit()]);
    mockRerankChunks.mockResolvedValue({
      results: [{
        relativePath: 'src/types.ts',
        content: 'export type Y = {}',
        score: 0.85,
        kind: 'type',
        gpuCluster: 3,
        tags: ['typescript', 'types'],
      }],
      clusterSummary: null,
      topologyContext: null,
    });
    mockDbExecute
      .mockResolvedValueOnce(CHUNK_ROWS)   // step 3: Postgres enrichment
      .mockResolvedValueOnce(CLUSTER_ROWS); // step 4: cluster summary
    const mod = await import('../../src/lib/server/codeintel/fix-recommender.js');
    getFixRecommendations = mod.getFixRecommendations;
  });

  it('returns stable shape on Gemma4 success', async () => {
    mockRunGemma4Agent.mockResolvedValue({ answer: GEMMA_RECS_JSON, toolsUsed: [], rounds: 1, sources: [], durationMs: 100 });
    const result = await getFixRecommendations({ error: "Property 'X' does not exist on type 'Y'. ts(2339)" });

    for (const key of STABLE_KEYS) expect(result).toHaveProperty(key);
    for (const k of STABLE_DIAGNOSTICS_KEYS) expect(result.diagnostics).toHaveProperty(k);
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.diagnostics.degraded).toBe(false);
    expect(result.diagnostics.clusterHit).toBe(3);
    expect(result.diagnostics.modelUsed).toBe('gemma4-legal-fast:latest');
  });

  it('falls back to heuristics when Gemma4 is unavailable (503)', async () => {
    mockFetch.mockReturnValue(makeOllamaError(503));
    const result = await getFixRecommendations({ error: "Cannot find module './utils'. ts(2307)" });

    for (const key of STABLE_KEYS) expect(result).toHaveProperty(key);
    expect(result.ok).toBe(false);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.diagnostics.degraded).toBe(true);
    expect(result.diagnostics.modelUsed).toBeNull();
    // Error message must not contain raw Ollama internals
    if (result.error) {
      expect(result.error).not.toMatch(/ECONNREFUSED|stack trace|internal/i);
    }
  });

  it('handles TS type error pattern with heuristic fallback', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('ECONNREFUSED')));
    const result = await getFixRecommendations({
      error: "Type 'string' is not assignable to type 'number'. ts(2322)",
      framework: 'sveltekit',
    });

    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    const first = result.recommendations[0];
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('explanation');
    expect(first).toHaveProperty('fix');
    expect(first).toHaveProperty('confidence');
    expect(Array.isArray(first.referenceFiles)).toBe(true);
    expect(result.diagnostics.degraded).toBe(true);
  });

  it('handles Svelte 4→5 migration pattern', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('timeout')));
    const result = await getFixRecommendations({
      error: 'Unexpected token',
      codeSnippet: 'export let value = 0;\n$: doubled = value * 2;',
      framework: 'svelte5',
    });

    expect(Array.isArray(result.recommendations)).toBe(true);
    const svelte5Rec = result.recommendations.find(
      r => r.fix.includes('$props') || r.fix.includes('$derived') || r.explanation.toLowerCase().includes('svelte')
    );
    expect(svelte5Rec).toBeDefined();
  });

  it('always returns recommendations array even when Qdrant is down', async () => {
    mockSearchCodebase.mockRejectedValue(new Error('Qdrant ECONNREFUSED'));
    mockFetch.mockImplementation(() => Promise.reject(new Error('Ollama down')));
    const result = await getFixRecommendations({ error: "Property 'foo' does not exist. ts(2339)" });

    expect(Array.isArray(result.recommendations)).toBe(true);
    for (const key of STABLE_KEYS) expect(result).toHaveProperty(key);
    for (const k of STABLE_DIAGNOSTICS_KEYS) expect(result.diagnostics).toHaveProperty(k);
    // Even with nothing, we must get numeric counts not NaN
    expect(typeof result.diagnostics.chunksSearched).toBe('number');
    expect(typeof result.diagnostics.latencyMs).toBe('number');
    expect(result.diagnostics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('respects topK limit', async () => {
    const manyRecs = Array.from({ length: 10 }, (_, i) => ({
      title: `Fix ${i}`, explanation: 'e', fix: 'f', confidence: 0.5, referenceFiles: [],
    }));
    mockFetch.mockReturnValue(makeOllamaOk(JSON.stringify({ recommendations: manyRecs })));
    const result = await getFixRecommendations({ error: 'some error', topK: 2 });

    expect(result.recommendations.length).toBeLessThanOrEqual(2);
  });

  it('does not leak raw DB/Ollama error messages in public response', async () => {
    mockDbExecute.mockRejectedValue(new Error('FATAL: password authentication failed for user "legal_admin" at port 5432'));
    mockFetch.mockImplementation(() => Promise.reject(new Error('connection refused 127.0.0.1:11434')));
    const result = await getFixRecommendations({ error: 'import error' });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/password authentication/i);
    expect(serialized).not.toMatch(/127\.0\.0\.1:11434/);
    // The stable keys must still be present
    for (const key of STABLE_KEYS) expect(result).toHaveProperty(key);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /api/codeintel/fix route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codeintel/fix', () => {
  let POST: typeof import('../../src/routes/api/codeintel/fix/+server.js').POST;

  function makeEvent(
    body: unknown,
    userId: string | null = 'user-1'
  ) {
    return {
      locals: { user: userId ? { id: userId } : null },
      request: new Request('http://localhost/api/codeintel/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    } as Parameters<typeof POST>[0];
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockSearchCodebase.mockResolvedValue([makeSearchHit()]);
    mockRerankChunks.mockResolvedValue({
      results: [{
        relativePath: 'src/types.ts', content: 'export type Y = {}',
        score: 0.85, kind: 'type', gpuCluster: 3, tags: ['typescript', 'types'],
      }],
      clusterSummary: null, topologyContext: null,
    });
    mockDbExecute
      .mockResolvedValueOnce(CHUNK_ROWS)
      .mockResolvedValueOnce(CLUSTER_ROWS);
    const mod = await import('../../src/routes/api/codeintel/fix/+server.js');
    POST = mod.POST;
  });

  it('returns 401 with stable shape when unauthenticated', async () => {
    const resp = await POST(makeEvent({ error: 'some error' }, null));
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toHaveProperty('ok', false);
    expect(Array.isArray(body.recommendations)).toBe(true);
  });

  it('returns 400 when error field is missing', async () => {
    const resp = await POST(makeEvent({ filePath: 'foo.ts' }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body).toHaveProperty('ok', false);
    expect(Array.isArray(body.recommendations)).toBe(true);
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = {
      locals: { user: { id: 'user-1' } },
      request: new Request('http://localhost/api/codeintel/fix', {
        method: 'POST',
        body: 'not json',
      }),
    } as Parameters<typeof POST>[0];
    const resp = await POST(event);
    expect(resp.status).toBe(400);
  });

  it('returns stable shape on successful recommendation', async () => {
    mockRunGemma4Agent.mockResolvedValue({ answer: GEMMA_RECS_JSON, toolsUsed: [], rounds: 1, sources: [], durationMs: 50 });
    const resp = await POST(makeEvent({
      error: "Property 'X' does not exist on type 'Y'. ts(2339)",
      filePath: 'src/routes/(app)/cases/+page.svelte',
      line: 42,
      codeSnippet: "let { data } = $props();\nconst x = data.X;",
      framework: 'svelte5',
      topK: 3,
    }));

    expect([200, 207]).toContain(resp.status);
    const body = await resp.json();
    expect(body).toHaveProperty('ok');
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(body).toHaveProperty('diagnostics');
    expect(typeof body.diagnostics.latencyMs).toBe('number');
  });

  it('returns degraded shape (207) when LLM fails, still has recommendations', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('Ollama down')));
    const resp = await POST(makeEvent({ error: 'import not found ts(2307)' }));

    expect([200, 207]).toContain(resp.status);
    const body = await resp.json();
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(typeof body.diagnostics.degraded).toBe('boolean');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. codeintel.fix_recommend MCP tool handler
// ─────────────────────────────────────────────────────────────────────────────

describe('codeintel.fix_recommend MCP tool handler', () => {
  /**
   * We test the handler logic directly rather than importing the full MCP
   * server (which has 2800+ lines of other tools). This mirrors the pattern
   * used in phase76-acp-tools.property.test.ts.
   */
  async function callFixRecommend(args: Record<string, unknown>) {
    const {
      error: errMsg,
      filePath,
      line,
      codeSnippet,
      framework,
      topK,
      includeClusterSummary,
    } = args as {
      error: string; filePath?: string; line?: number;
      codeSnippet?: string; framework?: string; topK?: number;
      includeClusterSummary?: boolean;
    };

    if (!errMsg || typeof errMsg !== 'string') {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'error field is required', recommendations: [] }) }] };
    }

    const { getFixRecommendations } = await import('../../src/lib/server/codeintel/fix-recommender.js');
    const result = await getFixRecommendations({
      error: errMsg, filePath, line, codeSnippet, framework,
      topK: topK ?? 3,
      includeClusterSummary: includeClusterSummary !== false,
    });

    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockSearchCodebase.mockResolvedValue([makeSearchHit()]);
    mockRerankChunks.mockResolvedValue({
      results: [{
        relativePath: 'src/types.ts', content: 'export type Y = {}',
        score: 0.85, kind: 'type', gpuCluster: 3, tags: ['typescript', 'types'],
      }],
      clusterSummary: null, topologyContext: null,
    });
    mockDbExecute
      .mockResolvedValueOnce(CHUNK_ROWS)
      .mockResolvedValueOnce(CLUSTER_ROWS);
  });

  it('rejects call when error field is missing', async () => {
    const result = await callFixRecommend({ filePath: 'foo.ts' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
  });

  it('returns typed recommendations on success', async () => {
    mockRunGemma4Agent.mockResolvedValue({ answer: GEMMA_RECS_JSON, toolsUsed: [], rounds: 1, sources: [], durationMs: 50 });
    const result = await callFixRecommend({
      error: "Property 'X' does not exist on type 'Y'. ts(2339)",
      filePath: 'src/routes/(app)/cases/+page.svelte',
      line: 42,
      codeSnippet: "let { data } = $props();\nconst x = data.X;",
      framework: 'svelte5',
      topK: 3,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('ok');
    expect(parsed).toHaveProperty('recommendations');
    expect(parsed).toHaveProperty('diagnostics');
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    expect(typeof parsed.diagnostics.latencyMs).toBe('number');
    expect(typeof parsed.diagnostics.chunksSearched).toBe('number');
    expect(typeof parsed.diagnostics.degraded).toBe('boolean');
  });

  it('handles degraded search safely — returns stable shape', async () => {
    mockSearchCodebase.mockRejectedValue(new Error('Qdrant unreachable'));
    mockFetch.mockImplementation(() => Promise.reject(new Error('Ollama unreachable')));

    const result = await callFixRecommend({
      error: "Cannot find module '$lib/utils'. ts(2307)",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    for (const k of STABLE_DIAGNOSTICS_KEYS) {
      expect(parsed.diagnostics).toHaveProperty(k);
    }
  });

  it('includes diagnostics.clusterHit as number or null', async () => {
    mockRunGemma4Agent.mockResolvedValue({ answer: GEMMA_RECS_JSON, toolsUsed: [], rounds: 1, sources: [], durationMs: 50 });
    const result = await callFixRecommend({ error: 'some error ts(1234)' });
    const parsed = JSON.parse(result.content[0].text);

    const hit = parsed.diagnostics.clusterHit;
    expect(hit === null || typeof hit === 'number').toBe(true);
  });
});
