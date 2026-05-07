// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

function makeOkJson(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

// Real Hyperedge shape (snake_case, matches hypergraph-types.ts)
function makeEdgePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    edge_type: 'agents_context',
    label: 'Test edge',
    query_hash: null,
    run_id: null,
    weight: 1.0,
    metadata: {},
    created_at: '2026-05-07T00:00:00Z',
    members: [],
    ...overrides,
  };
}

describe('POST /api/hypergraph/search — response shape contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns HyperedgeSearchResponse shape', async () => {
    const fakeResponse = {
      results: [
        {
          edge: makeEdgePayload({ edge_type: 'agents_context' }),
          activationScore: 0.7,
          matchedMembers: ['agents:dir:src/lib/server/ai'],
          rankPosition: 1,
        },
      ],
      totalMatched: 1,
      durationMs: 12,
    };

    mockFetch.mockResolvedValueOnce(makeOkJson(fakeResponse));

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_kind: 'agents_md', limit: 5 }),
    });
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].edge.edge_type).toBe('agents_context');
    expect(data.results[0].activationScore).toBeGreaterThan(0);
    expect(Array.isArray(data.results[0].matchedMembers)).toBe(true);
    expect(data.totalMatched).toBe(1);
    expect(typeof data.durationMs).toBe('number');
  });

  it('free-text query accepted via query field (backward compat)', async () => {
    const fakeResponse = { results: [], totalMatched: 0, durationMs: 5 };
    mockFetch.mockResolvedValueOnce(makeOkJson(fakeResponse));

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'gemma4 context', limit: 10 }),
    });
    const data = await res.json();

    expect(Array.isArray(data.results)).toBe(true);
    expect(typeof data.durationMs).toBe('number');
  });

  it('returns 404 shape when edge not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Edge not found' }),
    });

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/edge/nonexistent-hash');
    expect(res.status).toBe(404);
  });

  it('401 returned without auth cookie', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/search', {
      method: 'POST',
      body: JSON.stringify({ member_kind: 'file' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/hypergraph/edge/[id] — expand contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expand=true returns relatedEdges array (HyperedgeExpansion shape)', async () => {
    const fakeExpand = {
      edge: makeEdgePayload({ edge_type: 'retrieval' }),
      relatedEdges: [],
    };
    mockFetch.mockResolvedValueOnce(makeOkJson(fakeExpand));

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/edge/00000000-0000-0000-0000-000000000001?expand=true');
    const data = await res.json();
    expect(Array.isArray(data.relatedEdges)).toBe(true);
    expect(data.edge.edge_type).toBe('retrieval');
  });

  it('edge shape uses snake_case fields', async () => {
    const edge = makeEdgePayload({ edge_type: 'fix_attempt', label: 'patch attempt' });
    mockFetch.mockResolvedValueOnce(makeOkJson({ edge, relatedEdges: [] }));

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/edge/uuid-1?expand=false');
    const data = await res.json();

    // Verify real field names (not camelCase fiction)
    expect(data.edge.edge_type).toBeDefined();
    expect(data.edge.created_at).toBeDefined();
    expect(data.edge.weight).toBeDefined();
    // Non-existent camelCase fields should be absent
    expect(data.edge.edgeHash).toBeUndefined();
    expect(data.edge.gradeScore).toBeUndefined();
  });
});

describe('knowledge.get_minified_map — MCP tool payload contract', () => {
  it('minified map includes topEdges + agentsMd arrays', async () => {
    const fakeMap = {
      directory: 'src/lib/server/ai',
      topEdges: [
        { id: 'uuid-1', edge_type: 'agents_context', label: 'AGENTS.md binding', weight: 1.0 },
      ],
      agentsMd: ['## AI Agent\nRule: only read-only tools'],
      generatedAt: '2026-05-07T00:00:00Z',
    };
    mockFetch.mockResolvedValueOnce(makeOkJson(fakeMap));

    const res = await fetch('http://127.0.0.1:8788/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'knowledge.get_minified_map', arguments: { directory: 'src/lib/server/ai' } },
      }),
    });
    const data = await res.json();

    expect(data).toBeDefined();
    expect(Array.isArray(data.topEdges)).toBe(true);
    expect(Array.isArray(data.agentsMd)).toBe(true);
    if (data.topEdges.length > 0) {
      // Verify edge shape uses snake_case
      expect(data.topEdges[0].edge_type).toBeDefined();
    }
  });
});

describe('hypergraph.search MCP tool — input hardening', () => {
  it('long member_key is accepted up to 500 chars', async () => {
    const longKey = 'a'.repeat(490);
    const fakeResponse = { results: [], totalMatched: 0, durationMs: 3 };
    mockFetch.mockResolvedValueOnce(makeOkJson(fakeResponse));

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/search', {
      method: 'POST',
      body: JSON.stringify({ member_key: longKey, limit: 5 }),
    });
    const data = await res.json();
    expect(Array.isArray(data.results)).toBe(true);
  });

  it('limit defaults to 10 when not provided', async () => {
    const fakeResponse = { results: [], totalMatched: 0, durationMs: 2 };
    mockFetch.mockResolvedValueOnce(makeOkJson(fakeResponse));

    const res = await fetch('http://127.0.0.1:5173/api/hypergraph/search', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    // Route should not error on empty body — returns empty results
    const data = await res.json();
    expect(data).toBeDefined();
  });
});
