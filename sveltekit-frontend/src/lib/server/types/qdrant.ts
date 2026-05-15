/**
 * Qdrant payload type definitions.
 * Typed payload shapes for each Qdrant collection used in the platform,
 * plus a generic QdrantPoint wrapper for upsert operations.
 */

export interface CodebaseChunkPayload {
  file_path: string;
  chunk_index: number;
  content: string;
  language: string;
  tags: string[];
  summary?: string;
  entities?: string[];
  graph_neighbors?: string[];
  schema_version?: number;
  som_cluster?: number | null;
  som_bmu_row?: number | null;
  som_bmu_col?: number | null;
  gpu_cluster?: number | null;
  topo_class?: string | null;
  topo_byte?: number | null;
  cluster_key?: string | null;   // composite: "${topo_class}:${som_cluster}"
  centroid_id?: number | null;
  quality_score?: number | null;
  authority_score?: number | null;
  agents_scope?: string | null;  // nearest LLMS.md path
  relation_types?: string[];     // from code_relations (READS_REDIS_KEY, QUERIES_TABLE, …)
  semantic_tags?: string[];      // NES glyph-derived tags
  symbol_names?: string[];       // exported symbols from AST chunker
}

export interface EvidenceChunkPayload {
  evidence_id: string;
  case_id?: string;
  chunk_index: number;
  content: string;
  entity_type?: string;
  entities?: string[];
  tags?: string[];
  page_number?: number;
  som_cluster?: number | null;
}

export interface LegalDocChunkPayload {
  document_id: string;
  case_id?: string;
  chunk_index: number;
  content: string;
  section?: string;
  citations?: string[];
  statute_refs?: string[];
  authority_score?: number;
}

/** Generic Qdrant point wrapper for upsert operations. */
export interface QdrantPoint<T = Record<string, unknown>> {
  id: string | number;
  vector: number[] | { content?: number[]; signature?: number[] };
  payload: T;
}
