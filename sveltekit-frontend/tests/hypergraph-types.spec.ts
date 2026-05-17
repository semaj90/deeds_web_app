// @vitest-environment node
/**
 * hypergraph-types.spec.ts
 *
 * Unit tests for HyperGraphRAG type contracts and invariants.
 * No I/O — all tests are pure logic, verified against actual type definitions.
 */

import { describe, it, expect } from 'vitest';
import type {
  Hyperedge,
  HyperedgeMember,
  HyperedgeSearchResult,
  HyperedgeSearchParams,
  HyperedgeSearchResponse,
  HyperedgeActivation,
  HyperedgeScoreBreakdown,
  TraversalStep,
  TraversalResult,
} from '$lib/server/hypergraph/hypergraph-types.js';
import {
  EDGE_TYPES,
  MEMBER_KINDS,
  MEMBER_ROLES,
  SEARCH_MODES,
} from '$lib/server/hypergraph/hypergraph-types.js';

// ── Sample factories ──────────────────────────────────────────────────────────

function makeMember(member_key: string, member_kind: HyperedgeMember['member_kind'] = 'file', role?: HyperedgeMember['role']): HyperedgeMember {
  return { member_kind, member_key, role, score: 1.0, payload: {} };
}

function makeEdge(overrides: Partial<Hyperedge> = {}): Hyperedge {
  return {
    id:         overrides.id         ?? 'uuid-test-edge',
    edge_type:  overrides.edge_type  ?? 'retrieval',
    label:      overrides.label      ?? null,
    query_hash: overrides.query_hash ?? null,
    run_id:     overrides.run_id     ?? null,
    weight:     overrides.weight     ?? 1.0,
    metadata:   overrides.metadata   ?? {},
    created_at: overrides.created_at ?? new Date().toISOString(),
    members:    overrides.members    ?? [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EDGE_TYPES constant', () => {
  it('includes all required edge types', () => {
    expect(EDGE_TYPES).toContain('retrieval');
    expect(EDGE_TYPES).toContain('fix_attempt');
    expect(EDGE_TYPES).toContain('test_coverage');
    expect(EDGE_TYPES).toContain('cluster_context');
    expect(EDGE_TYPES).toContain('agents_context');
  });

  it('includes 4-lane hypergraph edge types (shared_resource, vault_link, topo_context)', () => {
    expect(EDGE_TYPES).toContain('shared_resource');
    expect(EDGE_TYPES).toContain('vault_link');
    expect(EDGE_TYPES).toContain('topo_context');
    expect(EDGE_TYPES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('MEMBER_KINDS constant', () => {
  it('includes file, agents_md, query, chunk', () => {
    expect(MEMBER_KINDS).toContain('file');
    expect(MEMBER_KINDS).toContain('agents_md');
    expect(MEMBER_KINDS).toContain('query');
    expect(MEMBER_KINDS).toContain('chunk');
    expect(MEMBER_KINDS).toContain('test');
    expect(MEMBER_KINDS).toContain('cluster');
    expect(MEMBER_KINDS).toContain('prior_answer');
    expect(MEMBER_KINDS).toContain('neo4j_node');
  });
});

describe('MEMBER_ROLES constant', () => {
  it('includes source, context, result, constraint, evidence', () => {
    expect(MEMBER_ROLES).toContain('source');
    expect(MEMBER_ROLES).toContain('context');
    expect(MEMBER_ROLES).toContain('result');
    expect(MEMBER_ROLES).toContain('constraint');
    expect(MEMBER_ROLES).toContain('evidence');
  });
});

describe('Hyperedge type shape', () => {
  it('makeEdge produces a valid Hyperedge with all required fields', () => {
    const edge = makeEdge();
    expect(typeof edge.id).toBe('string');
    expect(typeof edge.edge_type).toBe('string');
    expect(typeof edge.weight).toBe('number');
    expect(typeof edge.created_at).toBe('string');
    expect(Array.isArray(edge.members)).toBe(true);
  });

  it('weight defaults to 1.0', () => {
    const edge = makeEdge();
    expect(edge.weight).toBe(1.0);
  });

  it('optional fields can be null', () => {
    const edge = makeEdge({ label: null, query_hash: null, run_id: null });
    expect(edge.label).toBeNull();
    expect(edge.query_hash).toBeNull();
    expect(edge.run_id).toBeNull();
  });

  it('supports retrieval edge type', () => {
    const edge = makeEdge({ edge_type: 'retrieval' });
    expect(edge.edge_type).toBe('retrieval');
  });

  it('supports fix_attempt edge type', () => {
    const edge = makeEdge({ edge_type: 'fix_attempt' });
    expect(edge.edge_type).toBe('fix_attempt');
  });

  it('supports agents_context edge type', () => {
    const edge = makeEdge({ edge_type: 'agents_context' });
    expect(edge.edge_type).toBe('agents_context');
  });

  it('supports 3+ members', () => {
    const members = [
      makeMember('src/mcp/trace-mcp-server.ts', 'file', 'source'),
      makeMember('src/lib/server/ace/context-assembler.ts', 'file', 'context'),
      makeMember('src/lib/server/ai/AGENTS.md', 'agents_md', 'context'),
    ];
    const edge = makeEdge({ members });
    expect(edge.members).toHaveLength(3);
  });

  it('metadata accepts arbitrary JSONB', () => {
    const meta = { pipeline: 'ace', rounds: 3, cacheHit: false };
    const edge = makeEdge({ metadata: meta });
    expect(edge.metadata).toEqual(meta);
  });
});

describe('HyperedgeMember type shape', () => {
  it('makeMember has correct required fields', () => {
    const m = makeMember('src/lib/server/ai/gemma4-agent.ts', 'file', 'source');
    expect(m.member_key).toBe('src/lib/server/ai/gemma4-agent.ts');
    expect(m.member_kind).toBe('file');
    expect(m.role).toBe('source');
  });

  it('agents_md member kind accepted', () => {
    const m = makeMember('agents:dir:src/lib/server/ai', 'agents_md');
    expect(m.member_kind).toBe('agents_md');
  });

  it('prior_answer member kind accepted', () => {
    const m = makeMember('ace:prior:abc123', 'prior_answer');
    expect(m.member_kind).toBe('prior_answer');
  });

  it('optional fields can be omitted', () => {
    const m: HyperedgeMember = { member_kind: 'query', member_key: 'sha256:aabbcc' };
    expect(m.role).toBeUndefined();
    expect(m.score).toBeUndefined();
    expect(m.payload).toBeUndefined();
  });
});

describe('activation score logic (inline — mirrors hypergraph-search.ts)', () => {
  // Base formula (no embeddings): coverage×0.50 + weight×0.20
  // Empty members: weight×0.20 only
  function activationScore(edge: Hyperedge, matchedKeys: Set<string>): number {
    const memberCount = edge.members.length;
    if (!memberCount) return edge.weight * 0.20;
    const coverage = matchedKeys.size / memberCount;
    return coverage * 0.50 + edge.weight * 0.20;
  }

  it('empty member list falls back to weight × 0.20', () => {
    const edge = makeEdge({ weight: 0.8, members: [] });
    expect(activationScore(edge, new Set())).toBeCloseTo(0.8 * 0.20);
  });

  it('full member coverage with weight=1 scores 0.70', () => {
    const members = [
      makeMember('file:a'),
      makeMember('file:b'),
      makeMember('file:c'),
    ];
    const edge = makeEdge({ members, weight: 1.0 });
    const score = activationScore(edge, new Set(members.map(m => m.member_key)));
    expect(score).toBeCloseTo(0.50 + 0.20);
  });

  it('partial coverage scores between 0 and full', () => {
    const members = [makeMember('a'), makeMember('b'), makeMember('c'), makeMember('d')];
    const edge = makeEdge({ members, weight: 0.8 });
    const scorePartial = activationScore(edge, new Set(['a', 'b']));
    const scoreFull    = activationScore(edge, new Set(['a', 'b', 'c', 'd']));
    expect(scorePartial).toBeLessThan(scoreFull);
  });

  it('coverage boost exceeds weight-only score', () => {
    const members = [makeMember('a'), makeMember('b')];
    const edge = makeEdge({ members, weight: 0.5 });
    const withCoverage = activationScore(edge, new Set(['a', 'b']));
    const weightOnly = edge.weight * 0.20;
    expect(withCoverage).toBeGreaterThan(weightOnly);
  });
});

describe('HyperedgeSearchResult type', () => {
  it('has edge, activationScore, scoreBreakdown, whySelected, matchedMembers, rankPosition', () => {
    const result: HyperedgeSearchResult = {
      edge:            makeEdge(),
      activationScore: 0.78,
      scoreBreakdown:  { final: 0.78 },
      whySelected:     ['member_key matched: src/lib/server/ai/gemma4-agent.ts'],
      matchedMembers:  ['src/lib/server/ai/gemma4-agent.ts'],
      rankPosition:    1,
    };
    expect(result.rankPosition).toBe(1);
    expect(result.matchedMembers).toHaveLength(1);
    expect(result.activationScore).toBeCloseTo(0.78);
    expect(result.scoreBreakdown.final).toBeCloseTo(0.78);
    expect(Array.isArray(result.whySelected)).toBe(true);
  });
});

describe('HyperedgeSearchResponse type', () => {
  it('contains results array, totalMatched, durationMs', () => {
    const resp: HyperedgeSearchResponse = {
      results:      [],
      totalMatched: 0,
      durationMs:   12,
    };
    expect(Array.isArray(resp.results)).toBe(true);
    expect(resp.totalMatched).toBe(0);
    expect(resp.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('HyperedgeSearchParams', () => {
  it('all fields are optional', () => {
    const params: HyperedgeSearchParams = {};
    expect(params.member_key).toBeUndefined();
    expect(params.member_kind).toBeUndefined();
    expect(params.edge_type).toBeUndefined();
    expect(params.limit).toBeUndefined();
    expect(params.offset).toBeUndefined();
  });

  it('member_key and member_kind can be combined', () => {
    const params: HyperedgeSearchParams = {
      member_key: 'src/lib/server/ai/gemma4-agent.ts',
      member_kind: 'file',
      limit: 5,
    };
    expect(params.member_key).toBe('src/lib/server/ai/gemma4-agent.ts');
    expect(params.limit).toBe(5);
  });

  it('edge_type filter works for all edge types', () => {
    for (const et of EDGE_TYPES) {
      const params: HyperedgeSearchParams = { edge_type: et };
      expect(params.edge_type).toBe(et);
    }
  });

  it('run_id and query_hash are optional string filters', () => {
    const params: HyperedgeSearchParams = {
      query_hash: 'sha256:abcdef1234567890',
      run_id: '00000000-0000-0000-0000-000000000001',
    };
    expect(params.query_hash).toMatch(/^sha256:/);
    expect(params.run_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('HyperedgeActivation type', () => {
  it('has all required activation fields', () => {
    const activation: HyperedgeActivation = {
      edge: makeEdge(),
      activatedByTerms: ['agent', 'context'],
      membersCovered: 2,
      coverageRatio: 0.66,
    };
    expect(activation.membersCovered).toBe(2);
    expect(activation.coverageRatio).toBeCloseTo(0.66);
    expect(activation.activatedByTerms).toHaveLength(2);
  });

  it('edge can be null when not found', () => {
    const activation: HyperedgeActivation = {
      edge: null,
      activatedByTerms: [],
      membersCovered: 0,
      coverageRatio: 0,
    };
    expect(activation.edge).toBeNull();
    expect(activation.coverageRatio).toBe(0);
  });
});

describe('SEARCH_MODES constant', () => {
  it('includes all three GraphSearch modes', () => {
    expect(SEARCH_MODES).toContain('hop1');
    expect(SEARCH_MODES).toContain('multihop');
    expect(SEARCH_MODES).toContain('global');
  });

  it('has exactly 3 search modes', () => {
    expect(SEARCH_MODES).toHaveLength(3);
  });
});

describe('HyperedgeScoreBreakdown fields', () => {
  it('final is the only required field', () => {
    const bd: HyperedgeScoreBreakdown = { final: 0.55 };
    expect(bd.final).toBeCloseTo(0.55);
    expect(bd.memberCoverage).toBeUndefined();
    expect(bd.anchor_similarity).toBeUndefined();
    expect(bd.query_similarity).toBeUndefined();
  });

  it('supports anchor_similarity for GraphSearch-R', () => {
    const bd: HyperedgeScoreBreakdown = {
      final: 0.72,
      memberCoverage: 0.50,
      anchor_similarity: 0.80,
    };
    expect(bd.anchor_similarity).toBeCloseTo(0.80);
  });

  it('supports query_similarity for GraphSearch-F', () => {
    const bd: HyperedgeScoreBreakdown = {
      final: 0.68,
      memberCoverage: 0.40,
      query_similarity: 0.75,
    };
    expect(bd.query_similarity).toBeCloseTo(0.75);
  });
});

describe('HyperedgeSearchParams GraphSearch extensions', () => {
  it('accepts search_mode for all three modes', () => {
    for (const mode of SEARCH_MODES) {
      const params: HyperedgeSearchParams = { search_mode: mode };
      expect(params.search_mode).toBe(mode);
    }
  });

  it('accepts anchor_key and max_hops for hop traversal', () => {
    const params: HyperedgeSearchParams = {
      search_mode: 'multihop',
      anchor_key: 'src/lib/server/ai/gemma4-agent.ts',
      max_hops: 3,
      limit: 30,
    };
    expect(params.anchor_key).toBe('src/lib/server/ai/gemma4-agent.ts');
    expect(params.max_hops).toBe(3);
    expect(params.search_mode).toBe('multihop');
  });
});

describe('TraversalStep type', () => {
  it('holds hop number, anchor_key, candidates, and scores', () => {
    const step: TraversalStep = {
      hop: 1,
      anchor_key: 'src/lib/server/ai/gemma4-agent.ts',
      candidates: ['src/mcp/trace-mcp-server.ts', 'src/lib/server/ace/context-assembler.ts'],
      scores: {
        'src/mcp/trace-mcp-server.ts': 0.82,
        'src/lib/server/ace/context-assembler.ts': 0.61,
      },
    };
    expect(step.hop).toBe(1);
    expect(step.candidates).toHaveLength(2);
    expect(step.scores['src/mcp/trace-mcp-server.ts']).toBeCloseTo(0.82);
  });

  it('hop 0 represents flat (global) mode', () => {
    const step: TraversalStep = {
      hop: 0,
      anchor_key: '',
      candidates: ['src/lib/server/ai/gemma4-agent.ts'],
      scores: { 'src/lib/server/ai/gemma4-agent.ts': 0.90 },
    };
    expect(step.hop).toBe(0);
    expect(step.anchor_key).toBe('');
  });
});

describe('TraversalResult type', () => {
  it('holds mode, anchor, steps, edges, totalHops, durationMs', () => {
    const result: TraversalResult = {
      mode: 'hop1',
      anchor_key: 'src/lib/server/ai/gemma4-agent.ts',
      steps: [],
      edges: [],
      totalHops: 1,
      durationMs: 42,
    };
    expect(result.mode).toBe('hop1');
    expect(result.totalHops).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('multihop result can have multiple steps', () => {
    const step1: TraversalStep = { hop: 1, anchor_key: 'a', candidates: ['b'], scores: { b: 0.9 } };
    const step2: TraversalStep = { hop: 2, anchor_key: 'a', candidates: ['c'], scores: { c: 0.45 } };
    const result: TraversalResult = {
      mode: 'multihop',
      anchor_key: 'a',
      steps: [step1, step2],
      edges: [],
      totalHops: 2,
      durationMs: 88,
    };
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].scores['c']).toBeCloseTo(0.45);
  });
});
