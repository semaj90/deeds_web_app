/**
 * KAG (Knowledge-Augmented Generation) type contracts.
 * Describes Neo4j graph nodes/edges and the expansion + retrieval
 * context structures consumed by the RAG+KAG pipeline.
 */

export interface KAGNode {
  id: string;
  type: 'file' | 'case' | 'evidence' | 'statute' | 'citation' | 'concept';
  label: string;
  filePath?: string;
  tags: string[];
  pageRankScore?: number;
  somCluster?: number;
  communityId?: number;
}

export interface KAGEdge {
  from: string;
  to: string;
  type: 'IMPORTS' | 'REFERENCES' | 'SIMILAR_TOPOLOGY' | 'CITES' | 'RELATED';
  weight?: number;
}

export interface KAGExpansion {
  seedIds: string[];
  neighbors: KAGNode[];
  edges: KAGEdge[];
  hopCount: number;
  expansionDurationMs: number;
}

export interface KAGRetrievalContext {
  query: string;
  expansion: KAGExpansion;
  pageRankTopFiles: Array<{ id: string; filePath: string; score: number }>;
  somNeighborClusters: number[];
  validationPassed: boolean;
  validationMessages: string[];
}
