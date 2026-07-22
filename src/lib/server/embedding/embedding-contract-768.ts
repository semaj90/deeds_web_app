/**
 * Step 3: Embedding Contract — embeddinggemma-768-v1 (native, production canonical)
 *
 * Single source of truth for embedding model, dimension, normalization, pooling.
 * All downstream modules (Qdrant, TurboVec, GPU, storage) refer to this contract.
 *
 * Primary: 768-dim (production canonical, aligned with embedding-ingestion-worker.ts)
 * Legacy: 384-dim (deprecated, handled in validation with catch block and warnings)
 */

export const EMBEDDING_CONTRACT = {
  model_id: 'embeddinggemma:latest',
  model_name: 'Embedding Gemma (Google)',
  model_family: 'embedding-gemma',
  variant: 'latest',

  // Primary: 768-dim native (production canonical)
  embedding_dimension: 768,
  native_dimension: 768,

  // Legacy: 384-dim (deprecated, handled in validation with catch block)
  legacy_dimension: 384,

  truncation_method: 'none', // 768-dim is native, no truncation
  truncation_position: 768,

  // L2 normalization status
  normalization: 'L2' as const,
  normalized_norm_squared: 1.0, // ±0.01 tolerance

  // Pooling method (how single embeddings are combined)
  pooling: 'mean' as const,

  // Token limit (max input token length before truncation)
  max_tokens: 4096,

  // Ollama service endpoint
  ollama_host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  ollama_endpoint: '/api/embeddings',

  // Qdrant collection names
  qdrant_collection: 'codebase_chunks_768', // Primary (768-dim, production)
  qdrant_collection_legacy: 'codebase_chunks_384', // Deprecated fallback

  // TurboVec configuration (prefilter from 768-dim)
  turbovec: {
    quantization: '4-bit',
    input_dimension: 768,
    reduction_dimension: 64, // 768 → 64 via autoencoder
    prefilter_enabled: true,
  },

  // Redis cache configuration
  redis: {
    ttl_seconds: 3600,
    key_prefix: 'embedding:768:',
    max_batch_size: 100,
  },

  // Vector validation rules
  validation: {
    primary_dimension: 768,
    legacy_dimension: 384,
    min_norm_squared: 0.98, // 1.0 ± 0.02
    max_norm_squared: 1.02,
    allow_denormalized: false, // Hard fail if not normalized
  },

  // Query embedding settings
  query_settings: {
    batch_size: 32,
    normalize_output: true,
    cache_queries: true,
    cache_ttl_seconds: 300,
  },

  // Document embedding settings
  document_settings: {
    batch_size: 64,
    chunk_size: 512, // tokens, split on newline
    chunk_overlap: 50,
    normalize_output: true,
  },

  // Version identifier (for migrations + schema versioning)
  version: '2.0',
  schema_version: '768-canonical-v2',

  // Canonical timestamp (when this contract was locked)
  locked_at: new Date('2026-07-21').toISOString(),

  // Description for documentation
  description:
    'Legal AI platform canonical embedding contract. 768-dim Embedding Gemma via Ollama (native output). ' +
    'L2-normalized. Used by Qdrant ANN search (codebase_chunks_768), TurboVec prefilter, GPU reranking, and ACE context assembly. ' +
    'Legacy 384-dim handled via fallback with warnings.',
} as const;

/**
 * Type guard: verify embedding has correct dimension and normalization.
 *
 * Accepts 768-dim (primary) or 384-dim (legacy).
 * Returns true if embedding is valid, false otherwise.
 *
 * CATCH BLOCK: 384-dim embeddings logged as fallback but not rejected.
 */
export function isValidEmbedding(embedding: number[] | Float32Array): boolean {
  if (!embedding) return false;

  const dim = embedding.length;

  // Accept 768-dim (primary) or 384-dim (legacy)
  if (dim !== 768 && dim !== 384) {
    console.error(`[EmbeddingContract] Invalid dimension: ${dim}. Expected 768 or 384.`);
    return false;
  }

  // Legacy 384-dim: log warning but continue (catch block)
  if (dim === 384) {
    console.warn(
      '[EmbeddingContract] Using legacy 384-dim embedding. ' +
      'This is deprecated and should be migrated to 768-dim. Accepting for now.'
    );
  }

  // Check L2 norm squared (not just norm) to match validation-ingestion-worker.ts
  let normSq = 0;
  for (let i = 0; i < embedding.length; i++) {
    normSq += embedding[i] * embedding[i];
  }

  const isNormalized =
    normSq >= EMBEDDING_CONTRACT.validation.min_norm_squared &&
    normSq <= EMBEDDING_CONTRACT.validation.max_norm_squared;

  if (!isNormalized) {
    // Log warning but don't reject—catch block will handle
    console.warn(
      `[EmbeddingContract] Embedding not L2-normalized. norm² = ${normSq.toFixed(4)}, ` +
      `expected ≈1.0. Accepting but recommend renormalization.`
    );
  }

  return isNormalized;
}

/**
 * Type guard: verify it's the correct model
 */
export function isCorrectModel(modelId: string): boolean {
  return modelId === EMBEDDING_CONTRACT.model_id;
}

/**
 * Get the expected dimension for a given embedding.
 * Returns 768 for production, 384 for legacy (with warning).
 * Throws if dimension is unsupported.
 */
export function getNormalizedDimension(dim: number): number {
  if (dim === 768) return 768;
  if (dim === 384) {
    console.warn('[EmbeddingContract] 384-dim detected. Recommend upgrading to 768-dim (production canonical).');
    return 384; // Continue with legacy dimension
  }
  throw new Error(`Unsupported embedding dimension: ${dim}. Expected 768 (primary) or 384 (legacy fallback).`);
}

/**
 * Get the appropriate Qdrant collection for a given dimension.
 * Returns production collection for 768-dim, legacy for 384-dim.
 */
export function getQdrantCollectionForDimension(dim: number): string {
  if (dim === 768) return EMBEDDING_CONTRACT.qdrant_collection;
  if (dim === 384) {
    console.warn('[EmbeddingContract] Using legacy Qdrant collection for 384-dim. Recommend migration.');
    return EMBEDDING_CONTRACT.qdrant_collection_legacy;
  }
  throw new Error(`Unsupported dimension for Qdrant collection: ${dim}`);
}

/**
 * Export canonical dimension constants
 */
export const CANONICAL_EMBEDDING_DIM = EMBEDDING_CONTRACT.embedding_dimension; // 768
export const CANONICAL_EMBEDDING_MODEL = EMBEDDING_CONTRACT.model_id;
export const CANONICAL_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection; // codebase_chunks_768
export const LEGACY_EMBEDDING_DIM = EMBEDDING_CONTRACT.legacy_dimension; // 384
export const LEGACY_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection_legacy; // codebase_chunks_384
