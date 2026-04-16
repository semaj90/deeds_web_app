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
  centroid_id?: number | null;
  quality_score?: number | null;
  authority_score?: number | null;
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
