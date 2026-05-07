// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('pg', () => {
  const Pool = vi.fn(() => ({
    query: mockQuery,
  }));
  return { default: { Pool } };
});

// Actual DB row shape returned by the SELECT in hypergraph-search.ts
function makeEdgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    edge_type: 'retrieval',
    label: 'Test Edge',
    query_hash: null,
    run_id: null,
    weight: 1.0,
    topology: null,
    metadata: {},
    created_at: '2026-05-07T00:00:00Z',
    ...overrides,
  };
}

// Member row returned by hypergraph_edge_members SELECT
function makeMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    edge_id: '00000000-0000-0000-0000-000000000001',
    id: 1,
    member_kind: 'file',
    member_key: 'src/lib/server/ai/gemma4-agent.ts',
    role: 'source',
    score: 0.9,
    payload: null,
    ...overrides,
  };
}

describe('searchHyperedges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty results when no edges match', async () => {
    // First call: edge SELECT, second call: member SELECT (fetchMembers with empty id list skips)
    mockQuery
      .mockResolvedValueOnce({ rows: [] });

    const { searchHyperedges } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await searchHyperedges({ member_key: 'nonexistent' });
    expect(result.results).toEqual([]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.totalMatched).toBe(0);
  });

  it('maps db row to Hyperedge correctly', async () => {
    const row = makeEdgeRow({ edge_type: 'agents_context', label: 'AGENTS.md context' });
    const memberRow = makeMemberRow({ member_kind: 'agents_md', member_key: 'agents:dir:src/lib/server/ai' });

    mockQuery
      .mockResolvedValueOnce({ rows: [row] })       // edge SELECT
      .mockResolvedValueOnce({ rows: [memberRow] }); // member SELECT

    const { searchHyperedges } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await searchHyperedges({ edge_type: 'agents_context' });

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.edge.edge_type).toBe('agents_context');
    expect(r.edge.label).toBe('AGENTS.md context');
    expect(r.edge.members).toHaveLength(1);
    expect(r.edge.members[0].member_kind).toBe('agents_md');
    // scoreBreakdown and whySelected are richer model — check shape only
    expect(typeof r.scoreBreakdown.final).toBe('number');
    expect(Array.isArray(r.whySelected)).toBe(true);
    // whySelected reflects member/key/hash/topology reasons (not edge_type filter)
    expect(r.card).toBeDefined();
    expect(r.card?.edge_id).toBe(row.id);
    expect(r.rankPosition).toBe(1);
  });

  it('respects limit parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { searchHyperedges } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await searchHyperedges({ limit: 3 });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('empty members list produces weight-driven score', async () => {
    const row = makeEdgeRow({ weight: 0.8 });

    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] }); // no members

    const { searchHyperedges } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await searchHyperedges({ edge_type: 'retrieval' });

    if (result.results.length > 0) {
      const r = result.results[0];
      // No member coverage → final = weight × 0.20 = 0.8 × 0.20 = 0.16
      expect(r.activationScore).toBeCloseTo(0.16);
      expect(r.scoreBreakdown.memberCoverage).toBe(0);
      expect(typeof r.scoreBreakdown.final).toBe('number');
    }
  });

  it('scoreBreakdown includes topology bonus when glyph_cluster set', async () => {
    const topology = { topo_class: 'ace', som_cluster: 7, glyph_cluster: 'ace:7', graphAuthorityScore: 0.9 };
    const row = makeEdgeRow({ topology, weight: 1.0 });
    const memberRow = makeMemberRow({ member_kind: 'file' });

    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [memberRow] });

    const { searchHyperedges } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await searchHyperedges({ member_kind: 'file' });

    if (result.results.length > 0) {
      const bd = result.results[0].scoreBreakdown;
      expect(bd.topology).toBeGreaterThan(0);
      expect(bd.graphAuthority).toBeGreaterThan(0);
      // Card should include glyph_cluster in tags
      expect(result.results[0].card?.tags).toContain('ace:7');
    }
  });
});

describe('getHyperedgeById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when edge not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { getHyperedgeById } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await getHyperedgeById('00000000-0000-0000-0000-000000000099');
    expect(result).toBeNull();
  });

  it('returns edge when found', async () => {
    const row = makeEdgeRow({ id: 'uuid-2', edge_type: 'fix_attempt', label: 'ops fix' });
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] }); // fetchMembers returns empty

    const { getHyperedgeById } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await getHyperedgeById('uuid-2');
    expect(result).not.toBeNull();
    expect(result?.edge_type).toBe('fix_attempt');
    expect(result?.label).toBe('ops fix');
    expect(result?.members).toEqual([]);
  });

  it('attaches members to the returned edge', async () => {
    const row = makeEdgeRow();
    const memberRow = makeMemberRow({ member_kind: 'test', member_key: 'tests/foo.spec.ts' });
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [memberRow] });

    const { getHyperedgeById } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await getHyperedgeById('00000000-0000-0000-0000-000000000001');
    expect(result?.members).toHaveLength(1);
    expect(result?.members[0].member_kind).toBe('test');
  });
});

describe('explainEdgeActivation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null edge when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { explainEdgeActivation } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await explainEdgeActivation('missing-id', ['agent']);
    expect(result.edge).toBeNull();
    expect(result.coverageRatio).toBe(0);
    expect(result.membersCovered).toBe(0);
  });

  it('identifies term matches in member_key and label', async () => {
    const edgeId = '00000000-0000-0000-0000-000000000001';
    const row = makeEdgeRow({ id: edgeId, label: 'gemma4 context edge' });
    const memberRows = [
      makeMemberRow({ edge_id: edgeId, member_key: 'src/lib/server/ai/gemma4-agent.ts' }),
      makeMemberRow({ edge_id: edgeId, id: 2, member_key: 'src/mcp/trace-mcp-server.ts' }),
    ];
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: memberRows });

    const { explainEdgeActivation } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await explainEdgeActivation(edgeId, ['gemma4']);

    expect(result.edge).not.toBeNull();
    expect(result.activatedByTerms).toContain('gemma4');
    expect(result.membersCovered).toBeGreaterThanOrEqual(1);
    expect(result.coverageRatio).toBeGreaterThan(0);
  });

  it('coverageRatio is 0 when no terms match any member', async () => {
    const edgeId = '00000000-0000-0000-0000-000000000002';
    const row = makeEdgeRow({ id: edgeId, label: null });
    const memberRows = [makeMemberRow({ edge_id: edgeId, member_key: 'unrelated/file.ts' })];
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: memberRows });

    const { explainEdgeActivation } = await import('../src/lib/server/hypergraph/hypergraph-search.js');
    const result = await explainEdgeActivation(edgeId, ['nonexistent-term-xyz']);

    expect(result.coverageRatio).toBe(0);
    expect(result.membersCovered).toBe(0);
  });
});
