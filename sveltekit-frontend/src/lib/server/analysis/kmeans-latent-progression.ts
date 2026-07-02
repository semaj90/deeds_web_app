/**
 * KMeans Latent Space Progression Analysis
 *
 * Hierarchical vector reduction for semantic clustering:
 *   768-dim (full embedding) → 384-dim → 128-dim → 64-dim (hot memory)
 *
 * Each layer trained on previous layer output via TurboVec sidecar GPU.
 * Results stored as bytea (compressed binary) in Postgres for audit trail.
 *
 * Use case: Fast semantic similarity + clustering without full 768-dim vectors in RAM.
 * 20×20 SOM uses 64-dim centroids for topology mapping.
 */

/**
 * Latent space level descriptor
 */
export interface LatentLevel {
  name: string;
  dimension: number;
  storageFormat: 'vector' | 'bytea'; // vector(n) or bytea (compressed)
  description: string;
}

export const LATENT_PROGRESSION: LatentLevel[] = [
  {
    name: 'embedding_768',
    dimension: 768,
    storageFormat: 'vector',
    description: 'Full EmbeddingGemma output (primary Qdrant ANN)'
  },
  {
    name: 'embedding_384',
    dimension: 384,
    storageFormat: 'vector',
    description: 'First reduction (Qdrant named vector, pgvector mirror)'
  },
  {
    name: 'embedding_128',
    dimension: 128,
    storageFormat: 'bytea',
    description: 'KMeans level 1 (semantic clustering, Louvain communities)'
  },
  {
    name: 'embedding_64',
    dimension: 64,
    storageFormat: 'bytea',
    description: 'KMeans level 2 (hot memory, 20×20 SOM centroids)'
  }
];

/**
 * KMeans clustering result at each level
 */
export interface KMeansLevel {
  level: number; // 0=768, 1=384, 2=128, 3=64
  input_dim: number;
  output_dim: number;
  k_clusters: number;
  centroid_embedding: Float32Array;
  cluster_assignment: number; // Which cluster this feature belongs to
  distance_to_centroid: number;
  cluster_size: number;
  silhouette_score: number; // -1 to 1, measures cluster quality
}

/**
 * Compression format for bytea storage
 * Stores Float32Array as compact binary with metadata header
 */
export interface CompressedEmbedding {
  format: 'float32-binary';
  dimension: number;
  data: Uint8Array; // 4 bytes per float32
  checksum: string; // SHA-256 for verification
}

/**
 * Serialize Float32Array to CompressedEmbedding bytea format
 */
export function compressEmbedding(embedding: Float32Array): CompressedEmbedding {
  const buffer = new ArrayBuffer(embedding.length * 4);
  const view = new Float32Array(buffer);
  view.set(embedding);

  // Simple checksum (in production, use proper cryptographic hash)
  const checksum = Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16); // First 16 hex chars

  return {
    format: 'float32-binary',
    dimension: embedding.length,
    data: new Uint8Array(buffer),
    checksum
  };
}

/**
 * Deserialize bytea CompressedEmbedding back to Float32Array
 */
export function decompressEmbedding(compressed: CompressedEmbedding): Float32Array {
  const buffer = compressed.data.buffer;
  return new Float32Array(buffer);
}

/**
 * KMeans progression execution plan
 * Submits jobs to TurboVec sidecar via RPC for GPU acceleration
 */
export interface KMeansProgressionPlan {
  feature_id: string;
  input_embedding: Float32Array; // 768-dim
  levels: {
    level_384: { k: number; timeout_ms: number }; // Standard KMeans
    level_128: { k: number; timeout_ms: number };
    level_64: { k: number; timeout_ms: number };
  };
}

/**
 * Build KMeans progression plan for batch submission to TurboVec
 */
export function buildKMeansProgressionPlan(
  featureId: string,
  embedding768: Float32Array,
  options?: { k384?: number; k128?: number; k64?: number }
): KMeansProgressionPlan {
  return {
    feature_id: featureId,
    input_embedding: embedding768,
    levels: {
      level_384: {
        k: options?.k384 ?? 100, // 768→384 reduces to 100 clusters
        timeout_ms: 5000
      },
      level_128: {
        k: options?.k128 ?? 64, // 384→128 reduces to 64 clusters
        timeout_ms: 3000
      },
      level_64: {
        k: options?.k64 ?? 20, // 128→64 reduces to 20 clusters (SOM grid size)
        timeout_ms: 2000
      }
    }
  };
}

/**
 * Batch submission to TurboVec sidecar (:8791)
 * Returns job IDs for polling progress
 */
export interface TurboVecKMeansJob {
  job_id: string;
  feature_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  results?: {
    embedding_384: { vector: Float32Array; cluster: number };
    embedding_128: { compressed: CompressedEmbedding; cluster: number };
    embedding_64: { compressed: CompressedEmbedding; cluster: number };
  };
}

/**
 * Query TurboVec job status (polling for async completion)
 */
export async function queryTurboVecKMeansJob(
  jobId: string,
  turboVecUrl: string = 'http://127.0.0.1:8791'
): Promise<TurboVecKMeansJob | null> {
  try {
    const response = await fetch(`${turboVecUrl}/jobs/${jobId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error(`Failed to query TurboVec job ${jobId}:`, err);
    return null;
  }
}

/**
 * Postgres schema migration for latent progression storage
 * Run once per database to add embedding columns
 */
export const SCHEMA_MIGRATION_SQL = `
-- Add latent progression columns
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS embedding_768 vector(768),
ADD COLUMN IF NOT EXISTS embedding_384 vector(384),
ADD COLUMN IF NOT EXISTS embedding_128 bytea,
ADD COLUMN IF NOT EXISTS embedding_64 bytea,
ADD COLUMN IF NOT EXISTS kmeans_cluster_64 integer,
ADD COLUMN IF NOT EXISTS kmeans_centroid_distance_64 real,
ADD COLUMN IF NOT EXISTS som_cell_x integer,
ADD COLUMN IF NOT EXISTS som_cell_y integer;

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_kmeans_cluster_64
  ON codebase_chunk_index(kmeans_cluster_64);
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_som_cell
  ON codebase_chunk_index(som_cell_x, som_cell_y);

-- Comments
COMMENT ON COLUMN codebase_chunk_index.embedding_768 IS
  'Full 768-dim EmbeddingGemma vector (primary Qdrant ANN)';
COMMENT ON COLUMN codebase_chunk_index.embedding_384 IS
  'First reduction to 384-dim (Qdrant named vector, pgvector mirror)';
COMMENT ON COLUMN codebase_chunk_index.embedding_128 IS
  'KMeans level 1 compressed to 128-dim bytea (semantic clustering)';
COMMENT ON COLUMN codebase_chunk_index.embedding_64 IS
  'KMeans level 2 compressed to 64-dim bytea (hot memory, SOM centroids)';
COMMENT ON COLUMN codebase_chunk_index.kmeans_cluster_64 IS
  'Cluster assignment at 64-dim level (0-19 for 20-cluster SOM)';
COMMENT ON COLUMN codebase_chunk_index.kmeans_centroid_distance_64 IS
  'Distance to assigned 64-dim centroid (0-1 normalized)';
COMMENT ON COLUMN codebase_chunk_index.som_cell_x IS
  '20x20 SOM grid X coordinate (0-19)';
COMMENT ON COLUMN codebase_chunk_index.som_cell_y IS
  '20x20 SOM grid Y coordinate (0-19)';
`;

/**
 * HyperRAG RPC packet structure for keyword/semantic similarity search
 * Merged with RRF fusion results for final ranking
 */
export interface HyperRAGPacket {
  packet_id: string;
  feature_id: string;
  title_id: string;
  source_ref: string;
  keyword_tokens: string[]; // From keyword extraction
  semantic_similarity: number; // Cosine similarity via 64-dim
  keyword_similarity: number; // BM25 or lexical match
  rrf_fused_score: number; // All 6 signals merged
  rank: number;
}

/**
 * Build HyperRAG packet for RPC transmission
 * Used by Go Retrieval orchestrator to fan-out search
 */
export function buildHyperRAGPacket(
  featureId: string,
  titleId: string,
  sourceRef: string,
  keywords: string[],
  semanticSim: number,
  keywordSim: number,
  rrfScore: number,
  rank: number
): HyperRAGPacket {
  return {
    packet_id: `hyperrag:${featureId}:${Date.now()}`,
    feature_id: featureId,
    title_id: titleId,
    source_ref: sourceRef,
    keyword_tokens: keywords,
    semantic_similarity: semanticSim,
    keyword_similarity: keywordSim,
    rrf_fused_score: rrfScore,
    rank
  };
}
