// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchHyperedges = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/server/hypergraph/hypergraph-search.js', () => ({
  searchHyperedges: mockSearchHyperedges,
}));

import type { Hyperedge, HyperedgeMember } from '../src/lib/server/hypergraph/hypergraph-types.js';

function makeEdge(id: string, members: HyperedgeMember[] = []): Hyperedge {
  return {
    id,
    edge_type: 'retrieval',
    label: `Edge ${id}`,
    query_hash: null,
    run_id: null,
    weight: 1.0,
    topology: null,
    metadata: {},
    created_at: '2026-05-07T00:00:00Z',
    members,
  };
}

function makeMember(member_key: string): HyperedgeMember {
  return { member_kind: 'file', member_key, role: 'source', score: 0.9 };
}

function makeSearchResponse(edges: Hyperedge[], matchedKey: string) {
  return {
    results: edges.map((edge, i) => ({
      edge,
      activationScore: 0.8,
      scoreBreakdown: { memberCoverage: 0.5, weight: 0.2, final: 0.7 },
      matchedMembers: [matchedKey],
      rankPosition: i + 1,
      whySelected: [`member_key match: ${matchedKey}`],
      card: {
        edge_id: edge.id,
        summary128: `Summary of ${edge.id}`,
        memberKeys: edge.members.map(m => m.member_key),
        tags: [],
      },
    })),
    totalMatched: edges.length,
    durationMs: 5,
  };
}

describe('traverseHop1', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mode=hop1 and totalHops=1', async () => {
    const anchor = 'src/lib/server/ai/gemma4-agent.ts';
    const neighbor = 'src/lib/server/ace/context-assembler.ts';
    const edge = makeEdge('edge-1', [makeMember(anchor), makeMember(neighbor)]);
    mockSearchHyperedges.mockResolvedValue(makeSearchResponse([edge], anchor));

    const { traverseHop1 } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHop1(anchor, 10);

    expect(result.mode).toBe('hop1');
    expect(result.totalHops).toBe(1);
    expect(result.anchor_key).toBe(anchor);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].hop).toBe(1);
  });

  it('excludes anchor from candidates', async () => {
    const anchor = 'anchor-file.ts';
    const neighbor = 'neighbor-file.ts';
    const edge = makeEdge('e1', [makeMember(anchor), makeMember(neighbor)]);
    mockSearchHyperedges.mockResolvedValue(makeSearchResponse([edge], anchor));

    const { traverseHop1 } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHop1(anchor, 10);

    expect(result.steps[0].candidates).not.toContain(anchor);
    expect(result.steps[0].candidates).toContain(neighbor);
  });

  it('returns empty candidates when no edges found', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHop1 } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHop1('nonexistent-key', 10);

    expect(result.steps[0].candidates).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('includes durationMs in result', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHop1 } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHop1('any', 5);

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('decay at hop1 = activationScore × 1', async () => {
    const anchor = 'a.ts';
    const neighbor = 'b.ts';
    const edge = makeEdge('e1', [makeMember(anchor), makeMember(neighbor)]);
    const response = makeSearchResponse([edge], anchor);
    response.results[0].activationScore = 0.6;
    mockSearchHyperedges.mockResolvedValue(response);

    const { traverseHop1 } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHop1(anchor, 10);

    // decay = 1/1 = 1, score = 0.6 × 1 = 0.6
    expect(result.steps[0].scores[neighbor]).toBeCloseTo(0.6);
  });
});

describe('traverseMultihop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mode=multihop', async () => {
    const anchor = 'root.ts';
    const hop1neighbor = 'hop1.ts';
    const edge1 = makeEdge('e1', [makeMember(anchor), makeMember(hop1neighbor)]);

    mockSearchHyperedges
      .mockResolvedValueOnce(makeSearchResponse([edge1], anchor))
      .mockResolvedValueOnce({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseMultihop } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseMultihop(anchor, 2, 10);

    expect(result.mode).toBe('multihop');
    expect(result.anchor_key).toBe(anchor);
  });

  it('deduplicates nodes across hops', async () => {
    const anchor = 'a.ts';
    const b = 'b.ts';
    const c = 'c.ts';

    const edgeAB = makeEdge('e-ab', [makeMember(anchor), makeMember(b)]);
    const edgeBC = makeEdge('e-bc', [makeMember(b), makeMember(c)]);
    const edgeBAagain = makeEdge('e-ba', [makeMember(b), makeMember(anchor)]);

    mockSearchHyperedges
      .mockResolvedValueOnce(makeSearchResponse([edgeAB], anchor))
      .mockResolvedValueOnce(makeSearchResponse([edgeBC, edgeBAagain], b));

    const { traverseMultihop } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseMultihop(anchor, 2, 10);

    const allCandidates = result.steps.flatMap(s => s.candidates);
    expect(allCandidates).not.toContain(anchor);
    const bCount = allCandidates.filter(k => k === b).length;
    expect(bCount).toBe(1);
  });

  it('stops after first hop when no neighbors found', async () => {
    const anchor = 'anchor.ts';
    // hop returns nothing → first step has empty candidates → frontier becomes [] → loop exits
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseMultihop } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseMultihop(anchor, 4, 10);

    // One step is always pushed (hop 1), but candidates are empty → frontier exhausted after that
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].candidates).toEqual([]);
    expect(result.totalHops).toBe(1);
  });

  it('collects unique edges across hops', async () => {
    const anchor = 'a.ts';
    const b = 'b.ts';
    const c = 'c.ts';
    const edgeAB = makeEdge('e-ab', [makeMember(anchor), makeMember(b)]);
    const edgeBC = makeEdge('e-bc', [makeMember(b), makeMember(c)]);

    mockSearchHyperedges
      .mockResolvedValueOnce(makeSearchResponse([edgeAB], anchor))
      .mockResolvedValueOnce(makeSearchResponse([edgeBC], b));

    const { traverseMultihop } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseMultihop(anchor, 2, 10);

    const edgeIds = result.edges.map(e => e.id);
    expect(edgeIds).toContain('e-ab');
    expect(edgeIds).toContain('e-bc');
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });

  it('score decays by 1/hop at hop 1', async () => {
    const anchor = 'a.ts';
    const b = 'b.ts';
    const edgeAB = makeEdge('e-ab', [makeMember(anchor), makeMember(b)]);
    const resp = makeSearchResponse([edgeAB], anchor);
    resp.results[0].activationScore = 0.9;

    mockSearchHyperedges
      .mockResolvedValueOnce(resp)
      .mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseMultihop } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseMultihop(anchor, 2, 10);

    // hop 1 decay = 1/1 = 1 → score = 0.9
    expect(result.steps[0].scores[b]).toBeCloseTo(0.9);
  });
});

describe('traverseFlat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns mode=global and totalHops=0', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseFlat } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseFlat({});

    expect(result.mode).toBe('global');
    expect(result.totalHops).toBe(0);
    expect(result.anchor_key).toBe('');
  });

  it('collects matchedMembers as candidates with activation scores', async () => {
    const key = 'src/mcp/trace-mcp-server.ts';
    const edge = makeEdge('e1', [makeMember(key)]);
    const response = makeSearchResponse([edge], key);
    response.results[0].activationScore = 0.75;
    mockSearchHyperedges.mockResolvedValue(response);

    const { traverseFlat } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseFlat({ member_kind: 'file' });

    expect(result.steps[0].candidates).toContain(key);
    expect(result.steps[0].scores[key]).toBeCloseTo(0.75);
  });

  it('produces a single step at hop 0 with empty anchor_key', async () => {
    const key = 'any.ts';
    const edge = makeEdge('e1', [makeMember(key)]);
    mockSearchHyperedges.mockResolvedValue(makeSearchResponse([edge], key));

    const { traverseFlat } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseFlat({});

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].hop).toBe(0);
    expect(result.steps[0].anchor_key).toBe('');
  });

  it('maps edges from search results', async () => {
    const e1 = makeEdge('e-flat-1', [makeMember('f.ts')]);
    const e2 = makeEdge('e-flat-2', [makeMember('g.ts')]);
    mockSearchHyperedges.mockResolvedValue({
      results: [
        { edge: e1, activationScore: 0.5, scoreBreakdown: { final: 0.5 }, matchedMembers: ['f.ts'], rankPosition: 1, whySelected: [], card: undefined },
        { edge: e2, activationScore: 0.4, scoreBreakdown: { final: 0.4 }, matchedMembers: ['g.ts'], rankPosition: 2, whySelected: [], card: undefined },
      ],
      totalMatched: 2,
      durationMs: 3,
    });

    const { traverseFlat } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseFlat({});

    expect(result.edges.map(e => e.id)).toEqual(['e-flat-1', 'e-flat-2']);
  });
});

describe('traverseHypergraph dispatcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes search_mode=hop1 to traverseHop1', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHypergraph } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHypergraph({ search_mode: 'hop1', anchor_key: 'a.ts', limit: 5 });

    expect(result.mode).toBe('hop1');
    expect(result.totalHops).toBe(1);
  });

  it('routes search_mode=multihop to traverseMultihop', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHypergraph } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHypergraph({ search_mode: 'multihop', anchor_key: 'b.ts', max_hops: 2, limit: 10 });

    expect(result.mode).toBe('multihop');
  });

  it('routes search_mode=global to traverseFlat', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHypergraph } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHypergraph({ search_mode: 'global' });

    expect(result.mode).toBe('global');
    expect(result.totalHops).toBe(0);
  });

  it('defaults to global when search_mode is omitted', async () => {
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHypergraph } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    const result = await traverseHypergraph({});

    expect(result.mode).toBe('global');
  });

  it('passes anchor_key to searchHyperedges for hop1', async () => {
    const anchor = 'specific-anchor.ts';
    mockSearchHyperedges.mockResolvedValue({ results: [], totalMatched: 0, durationMs: 1 });

    const { traverseHypergraph } = await import('../src/lib/server/hypergraph/hypergraph-traversal.js');
    await traverseHypergraph({ search_mode: 'hop1', anchor_key: anchor, limit: 15 });

    expect(mockSearchHyperedges).toHaveBeenCalledWith(
      expect.objectContaining({ member_key: anchor })
    );
  });
});
