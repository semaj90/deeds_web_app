import type { GraphAlgorithm } from './graph-analysis-types.js';

export const GRAPH_ALGORITHM_REVISION = {
  pagerank: 'neo4j-gds-pagerank-mutate-v1',
  louvain: 'neo4j-gds-louvain-mutate-v1',
  leiden: 'neo4j-gds-leiden-mutate-v1',
  cheirank: 'neo4j-gds-cheirank-reverse-pagerank-mutate-v1',
  personalized_pagerank: 'unsupported-personalized-pagerank-v1',
  kcore: 'neo4j-gds-kcore-mutate-v1',
  betweenness: 'neo4j-gds-betweenness-exact-v1',
} as const satisfies Record<GraphAlgorithm, string>;

export function graphAlgorithmRevision(algorithm: GraphAlgorithm): string {
  return GRAPH_ALGORITHM_REVISION[algorithm];
}
