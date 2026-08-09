export type TraversalMode =
  | 'apoc-bounded'
  | 'bfs'
  | 'dijkstra'
  | 'personalized-pagerank'
  | 'taxonomy'
  | 'semantic-best-first';

export const EDGE_COSTS_V1: Readonly<Record<string, number>> = {
  TEST_COVERS_FILE: 0.05,
  IMPLEMENTS: 0.08,
  CALLS: 0.10,
  REFERENCES: 0.15,
  IMPORTS: 0.25,
  BELONGS_TO_FEATURE: 0.10,
  SEMANTIC_LINK: 0.50,
};

export const TAXONOMY_POLICY_V1 = {
  sameCommunityBoost: 0.15,
  adjacentCommunityPenalty: 0.10,
  unrelatedCommunityPenalty: 0.35,
  maxDepth: 3,
  maxCandidates: 200,
} as const;
