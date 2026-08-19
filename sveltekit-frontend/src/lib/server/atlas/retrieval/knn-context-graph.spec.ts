import { describe, expect, it } from 'vitest';
import {
  buildKnnContextGraph,
  canonicalJsonArtifact,
  normalizeKnnEdges,
  searchKnnAStar,
  synthesizeKnnMultihop,
} from './knn-context-graph.js';
import type { ProgressiveCandidateV1, KnnGraphEdgeV1 } from './progressive-knn-graph-contracts.js';

const candidate = (id: string): ProgressiveCandidateV1 => ({
  canonicalId: id,
  packetKey: `p:${id}`,
  sourceRef: `src/${id}.ts`,
  workspaceRevision: 'ws-1',
  sourceRevision: 'src-1',
  qdrantPointId: `q:${id}`,
  semantic768Score: 1,
  latent128Score: null,
  latent64Score: null,
  exactDistance: null,
  challengerDistance: null,
  evidenceRefs: [],
});

const edge = (source: string, target: string, distance: number, rank = 1, exact = true): KnnGraphEdgeV1 => ({
  sourceCanonicalId: source,
  targetCanonicalId: target,
  rank,
  distance,
  metric: 'COSINE',
  executor: exact ? 'CUVS_BRUTE_FORCE' : 'CUVS_CAGRA',
  exact,
});

function graph() {
  return buildKnnContextGraph({
    requestId: 'req-1',
    workspaceRevision: 'ws-1',
    representationId: 'semantic_768',
    representationRevision: 'sem-7',
    metric: 'COSINE',
    candidates: ['A', 'B', 'C', 'D'].map(candidate),
    edges: [
      edge('A', 'B', 1),
      edge('A', 'C', 4),
      edge('B', 'C', 1),
      edge('C', 'D', 1),
      edge('B', 'D', 7),
    ],
    producerRevision: 'test',
  });
}

describe('KnnContextGraphV1', () => {
  it('keeps exact semantic-neighbor edges separate from SGraph relation semantics', () => {
    const value = graph();
    expect(value.schema).toBe('atlas.knn-context-graph.v1');
    expect(value.representationId).toBe('semantic_768');
    expect(value.edges.every((row) => row.exact)).toBe(true);
  });

  it('prefers exact duplicate edges over challengers', () => {
    const rows = normalizeKnnEdges([
      edge('A', 'B', 0.8, 1, false),
      edge('A', 'B', 0.9, 2, true),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].exact).toBe(true);
    expect(rows[0].distance).toBe(0.9);
  });

  it('runs zero-heuristic A-star as exact UCS over non-negative KNN edge costs', () => {
    const result = searchKnnAStar({
      graph: graph(),
      sourceCanonicalId: 'A',
      targetCanonicalId: 'D',
      maxHops: 8,
      maxExpansions: 100,
      producerRevision: 'test',
    });
    expect(result.found).toBe(true);
    expect(result.pathCanonicalIds).toEqual(['A', 'B', 'C', 'D']);
    expect(result.pathCost).toBe(3);
    expect(result.optimalityClaim).toBe('LOWEST_NONNEGATIVE_COST');
    expect(result.exactTerminationAuthority).toBe(true);
  });

  it('allows an aggressive score only as a secondary tie breaker', () => {
    const result = searchKnnAStar({
      graph: graph(),
      sourceCanonicalId: 'A',
      targetCanonicalId: 'D',
      maxHops: 8,
      maxExpansions: 100,
      aggressiveTieBreakerByCanonicalId: { B: 0.1, C: 100 },
      producerRevision: 'test',
    });
    expect(result.pathCanonicalIds).toEqual(['A', 'B', 'C', 'D']);
    expect(result.pathCost).toBe(3);
    expect(result.exactTerminationAuthority).toBe(true);
  });

  it('rejects unproven primary heuristics', () => {
    expect(() => searchKnnAStar({
      graph: graph(),
      sourceCanonicalId: 'A',
      targetCanonicalId: 'D',
      maxHops: 8,
      maxExpansions: 100,
      lowerBoundByCanonicalId: { A: 2, B: 1, C: 1, D: 0 },
      lowerBoundProven: false,
      producerRevision: 'test',
    })).toThrow(/Unproven heuristic/);
  });

  it('performs deterministic bounded multihop expansion', () => {
    const result = synthesizeKnnMultihop({
      graph: graph(),
      seedCanonicalIds: ['A'],
      maxHops: 2,
      maxNodes: 3,
      producerRevision: 'test',
    });
    expect(result.visitedCanonicalIds).toEqual(['A', 'B', 'C']);
    expect(result.truncated).toBe(true);
  });

  it('canonicalizes JSON before hashing', () => {
    const a = canonicalJsonArtifact({ z: 1, a: { y: 2, x: 3 } });
    const b = canonicalJsonArtifact({ a: { x: 3, y: 2 }, z: 1 });
    expect(a.json).toBe(b.json);
    expect(a.sha256).toBe(b.sha256);
  });
});
