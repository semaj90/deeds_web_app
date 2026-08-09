/**
 * traversal-policy.ts — GR2/GR3 contract boundary only.
 *
 * Defines the shape of a bounded graph traversal request. Does NOT implement traversal,
 * scoring, taxonomy distance, or semantic heuristics — those are explicitly out of scope
 * until GR10 (semantic best-first), per openspec/changes/parent-atlas-graph-runtime-enhancement.
 *
 * Callers: apoc-bounded-neighborhood.cypher (mode 'apoc-bounded'), gds-bfs.cypher (mode 'bfs'),
 * neo4j-gds.ts's runDijkstraContext (mode 'dijkstra' — that function is the canonical owner,
 * this type just documents its bound-parameter shape for future callers).
 */

export type TraversalMode = 'apoc-bounded' | 'bfs' | 'dijkstra';

export interface TraversalPolicy {
  maxDepth: number;
  limit: number;
  relationshipTypes: readonly string[];
}
