/**
 * Step 3: Embedding Contract
 *
 * This file keeps the legacy 384 projection contract for downstream validators,
 * while also declaring the 768 source lane explicitly. The retrieval stack now
 * treats these as separate contracts rather than one ambiguous dimension.
 */

export const EMBEDDING_CONTRACT = {
  /**
   * Model identifier (canonical Ollama tag)
   */
  model_id: 'embeddinggemma:latest',

  /**
   * Full model name for documentation
   */
  model_name: 'Embedding Gemma (Google)',

  /**
   * Model family and variant
   */
  model_family: 'embedding-gemma',
  variant: 'latest',

  /**
   * Derived retrieval dimension used by the 384-dim canonical lane.
   */
  embedding_dimension: 384,

  /**
   * Native Ollama output dimension (before any truncation).
   */
  native_dimension: 768,

  /**
   * Explicit source/retrieval lane metadata for adaptive routing.
   */
  source_embedding_dimension: 768,
  retrieval_embedding_dimension: 384,

  /**
   * Truncation from 768 to 384 is applied by Ollama on this model config
   * (not standard Matryoshka; custom for this project)
   */
  truncation_method: 'direct_slice',
  truncation_position: 384,

  /**
   * L2 normalization status
   */
  normalization: 'L2' as const,
  normalized_norm_squared: 1.0, // ±0.01 tolerance

  /**
   * Pooling method (how single embeddings are combined)
   */
  pooling: 'mean' as const,

  /**
   * Token limit (max input token length before truncation)
   */
  max_tokens: 4096,

  /**
   * Ollama service endpoint
   */
  ollama_host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  ollama_endpoint: '/api/embeddings',

  /**
   * Qdrant collection names (must exist).
   * source: 768-dim lane
   * retrieval: 384-dim hybrid lane
   */
  qdrant_source_collection: 'codebase_chunks_768',
  qdrant_collection: 'codebase_chunks_384_hybrid',

  /**
   * TurboVec configuration
   */
  turbovec: {
    quantization: '4-bit',
    reduction_dimension: 64, // 384 → 64 via autoencoder
    prefilter_enabled: true,
  },

  /**
   * Redis cache configuration
   */
  redis: {
    ttl_seconds: 3600,
    key_prefix: 'embedding:',
    max_batch_size: 100,
  },

  /**
   * Vector validation rules
   */
  validation: {
    min_dimension: 384,
    max_dimension: 384,
    min_norm_squared: 0.98, // 1.0 ± 0.02
    max_norm_squared: 1.02,
    allow_denormalized: false, // Hard fail if not normalized
  },

  /**
   * Query embedding settings
   */
  query_settings: {
    batch_size: 32,
    normalize_output: true,
    cache_queries: true,
    cache_ttl_seconds: 300,
  },

  /**
   * Document embedding settings
   */
  document_settings: {
    batch_size: 64,
    chunk_size: 512, // tokens, split on newline
    chunk_overlap: 50,
    normalize_output: true,
  },

  /**
   * Version identifier (for migrations + schema versioning)
   */
  version: '1.0',
  schema_version: '384-canonical-v1',

  /**
   * Canonical timestamp (when this contract was locked)
   */
  locked_at: new Date('2026-07-21').toISOString(),

  /**
   * Description for documentation
   */
  description:
    'Legal AI platform canonical embedding contract. 384-dim Embedding Gemma via Ollama. ' +
    'L2-normalized. Used by Qdrant ANN search, TurboVec prefilter, GPU reranking, and ACE context assembly.',
} as const;

export const SOURCE_EMBEDDING_DIMENSION = EMBEDDING_CONTRACT.source_embedding_dimension;
export const RETRIEVAL_EMBEDDING_DIMENSION = EMBEDDING_CONTRACT.retrieval_embedding_dimension;
export const SOURCE_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_source_collection;
export const RETRIEVAL_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection;

/**
 * Type guard: verify embedding has correct dimension and normalization
 */
export function isValidEmbedding(embedding: number[] | Float32Array): boolean {
  if (!embedding) return false;

  if (embedding.length !== EMBEDDING_CONTRACT.embedding_dimension) {
    return false;
  }

  // Check L2 norm squared is ≈1.0 ±0.02
  let normSq = 0;
  for (let i = 0; i < embedding.length; i++) {
    normSq += embedding[i] * embedding[i];
  }

  return (
    normSq >= EMBEDDING_CONTRACT.validation.min_norm_squared &&
    normSq <= EMBEDDING_CONTRACT.validation.max_norm_squared
  );
}

/**
 * Type guard: verify it's the correct model
 */
export function isCorrectModel(modelId: string): boolean {
  return modelId === EMBEDDING_CONTRACT.model_id;
}

/**
 * Export for use in validation, storage, and retrieval modules
 */
export const CANONICAL_EMBEDDING_DIM = EMBEDDING_CONTRACT.embedding_dimension;
export const CANONICAL_EMBEDDING_MODEL = EMBEDDING_CONTRACT.model_id;
export const CANONICAL_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection;
