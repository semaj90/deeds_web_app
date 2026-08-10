export type MetricDomain = 'SEMANTIC' | 'LEXICAL' | 'STRUCTURAL' | 'GRAPH' | 'CLUSTERING' | 'EXECUTION' | 'RESOURCE';

export interface MetricDefinition {
  id: string;
  domain: MetricDomain;
  expectedRange?: readonly [number, number];
  unit?: string;
  missingPolicy: 'ZERO' | 'NULL' | 'REJECT';
  revision: string;
}

export const TENSOR_METRICS: readonly MetricDefinition[] = [
  { id: 'dense_cosine', domain: 'SEMANTIC', expectedRange: [-1, 1], missingPolicy: 'REJECT', revision: 'v1' },
  { id: 'pagerank', domain: 'GRAPH', expectedRange: [0, Number.POSITIVE_INFINITY], missingPolicy: 'NULL', revision: 'v1' },
  { id: 'betweenness', domain: 'GRAPH', expectedRange: [0, Number.POSITIVE_INFINITY], missingPolicy: 'NULL', revision: 'v1' },
  { id: 'kmeans_distance', domain: 'CLUSTERING', expectedRange: [0, Number.POSITIVE_INFINITY], missingPolicy: 'NULL', revision: 'v1' },
  { id: 'execution_success', domain: 'EXECUTION', expectedRange: [0, 1], missingPolicy: 'ZERO', revision: 'v1' },
  { id: 'vram_pressure', domain: 'RESOURCE', expectedRange: [0, 1], missingPolicy: 'NULL', revision: 'v1' }
];
