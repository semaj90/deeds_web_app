/**
 * Legacy Qdrant Multi-Vector Schema — retained for explicit 384-dim replay only.
 * The active `codebase_chunks_768` contract is owned by the canonical Qdrant
 * adapter and uses EmbeddingGemma `semantic_768` under the `content` vector.
 *
 * Named vectors (all 384-dim from EmbeddingGemma):
 *   content_embedding → Semantic search (code/text content)
 *   summary_embedding → Concept-level retrieval (summaries)
 *   title_embedding → Feature/module lookup (titles, names)
 *   signature_embedding → Function/API similarity (signatures)
 *   feature_embedding → Feature recommendation (optional)
 *   latent64 → Clustering/topology only (NOT for retrieval)
 *
 * Payload (same ID hierarchy across all stores):
 *   repository_id, directory_id, file_id, module_id, symbol_id
 *   feature_id, packet_key, chunk_id
 *   source_ref, packet_type
 *   + multi-vector metadata
 */

interface QdrantPoint {
  id: string | number;
  vectors: {
    content_embedding: {
      data: number[];
      size: 384;
    };
    summary_embedding: {
      data: number[];
      size: 384;
    };
    title_embedding: {
      data: number[];
      size: 384;
    };
    signature_embedding: {
      data: number[];
      size: 384;
    };
    feature_embedding?: {
      data: number[];
      size: 384;
    };
    latent64?: {
      data: number[];
      size: 64;
    };
  };
  payload: {
    // ID Hierarchy (stored in all mirrors)
    repository_id: string;
    directory_id: string;
    file_id: string;
    module_id: string;
    symbol_id: string;
    feature_id: string;
    packet_key: string;
    chunk_id: string;

    // Metadata
    source_ref: string;
    packet_type: 'file' | 'module' | 'function' | 'class' | 'route';

    // Multi-vector labels
    vector_types: string[];
  };
}

interface SearchRequest {
  query_embedding: number[]; // 384-dim
  using: 'content_embedding' | 'summary_embedding' | 'title_embedding' | 'signature_embedding' | 'feature_embedding';
  top_k: number;
  filter?: {
    packet_type?: string;
    feature_id?: string;
    file_id?: string;
  };
}

interface HybridSearchRequest {
  query_embedding: number[]; // 384-dim
  // Multiple vectors for different purposes
  searches: Array<{
    using: string;
    weight: number;
  }>;
  top_k: number;
}

/**
 * Create Qdrant collection with multi-vector support
 * Call once during setup
 */
export async function createMultiVectorCollection(
  qdrantUrl: string,
  collectionName: string = 'codebase_chunks_384_hybrid'
): Promise<void> {
  throw new Error('LEGACY_384_MULTIVECTOR_WRITE_DISABLED: historical multi-vector schema cannot create collections');
}

/**
 * Single-vector search (content_embedding is most common)
 */
export async function searchByContentEmbedding(
  qdrantUrl: string,
  collectionName: string,
  queryEmbedding: number[],
  topK: number = 20,
  filter?: Record<string, unknown>
): Promise<QdrantPoint[]> {
  throw new Error('LEGACY_384_MULTIVECTOR_SEARCH_DISABLED: use the admitted semantic_768 retrieval owner');
}

/**
 * Multi-vector hybrid search
 * Example: 60% content_embedding + 40% summary_embedding
 */
export async function hybridSearch(
  qdrantUrl: string,
  collectionName: string,
  queryEmbedding: number[],
  weights: {
    content?: number; // 0-1
    summary?: number;
    title?: number;
    signature?: number;
    feature?: number;
  } = { content: 0.6, summary: 0.4 },
  topK: number = 20,
  filter?: Record<string, unknown>
): Promise<QdrantPoint[]> {
  throw new Error('LEGACY_384_MULTIVECTOR_SEARCH_DISABLED: use the admitted semantic_768 retrieval owner');
}

/**
 * Update multi-vector for existing point (e.g., from embeddings pipeline)
 */
export async function updateMultiVectors(
  qdrantUrl: string,
  collectionName: string,
  pointId: string,
  vectors: {
    content_embedding?: number[];
    summary_embedding?: number[];
    title_embedding?: number[];
    signature_embedding?: number[];
    feature_embedding?: number[];
    latent64?: number[];
  }
): Promise<void> {
  throw new Error('LEGACY_384_MULTIVECTOR_WRITE_DISABLED: historical 384-D vectors cannot be written');
}
