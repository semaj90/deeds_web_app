/**
 * src/lib/server/types/graph-mapping.ts
 *
 * One-to-many enhanced graph mappings for the codebase architecture.
 * Feeds richer graph candidates to the ACE Context Packer and GraphRAG kernel synthesis.
 */

export const NodeFlags = {
  HAS_STATIC_IMPORTS: 1 << 0,
  HAS_DYNAMIC_IMPORTS: 1 << 1,
  SERVER_ONLY: 1 << 2,
  CLIENT_SAFE: 1 << 3,
  USES_REDIS: 1 << 4,
  USES_QDRANT: 1 << 5,
  USES_GRPC: 1 << 6,
  USES_CUDA: 1 << 7,
  HAS_TEST: 1 << 8,
  HAS_ROUTE: 1 << 9,
  HAS_SCHEMA: 1 << 10,
  HAS_SVG_MAPPING: 1 << 11
} as const;

export type EnhancedGraphMapping = {
  id: string;
  kind:
    | 'file'
    | 'symbol'
    | 'route'
    | 'schema'
    | 'svg'
    | 'proto'
    | 'redis_key'
    | 'qdrant_collection'
    | 'grpc_method'
    | 'chunk'
    | 'cluster';

  label: string;
  path?: string;
  summary?: string;

  edges: Array<{
    relation:
      | 'STATIC_IMPORTS'
      | 'DYNAMIC_IMPORTS'
      | 'EXPORTS'
      | 'CALLS'
      | 'USES_SCHEMA'
      | 'USES_REDIS_KEY'
      | 'USES_QDRANT_COLLECTION'
      | 'USES_PROTO'
      | 'USES_GRPC_METHOD'
      | 'VISUALIZES'
      | 'BELONGS_TO_CLUSTER'
      | 'SUPPORTS_DAG_STEP';
    targets: string[];
    confidence: number;
    source: 'ast' | 'rg' | 'svg' | 'proto' | 'llm' | 'runtime' | 'manual';
  }>;

  scores?: {
    pagerank?: number;
    authority?: number;
    karpathyBlend?: number;
    autoencoderScore?: number;
    attentionScore?: number;
    grpoReward?: number;
  };

  vectors?: {
    embedding768?: number[];
    encoded64?: number[];
  };

  metadata?: Record<string, unknown>;
};
