/**
 * Step 3: Embedding Contract
 *
 * Canonical dense search is 768-dim.
 * The 384 lane may exist as a legacy or experimental projection, but it is
 * not the authority contract for current retrieval.
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
   * Canonical dense embedding dimension.
   */
  embedding_dimension: 768,

  /**
   * Native model output dimension.
   */
  native_dimension: 768,

  /**
   * Explicit source/retrieval lane metadata for adaptive routing.
   */
  source_embedding_dimension: 768,
  retrieval_embedding_dimension: 768,
  legacy_retrieval_embedding_dimension: 384,

  /**
   * Official EmbeddingGemma MRL truncation targets. 384 is not an
   * EmbeddingGemma MRL target and remains legacy-only below.
   */
  truncation_method: 'mrl_prefix_truncate_renormalize',
  supported_mrl_dimensions: [768, 512, 256, 128] as const,
  truncation_position: 768,

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
   * retrieval: 768-dim canonical lane
   */
  qdrant_source_collection: 'codebase_chunks_768_v2',
  qdrant_collection: 'codebase_chunks_768_v2',
  qdrant_legacy_collection: 'codebase_chunks_384_hybrid',

  /**
   * TurboVec configuration
   */
  turbovec: {
    quantization: '4-bit',
    reduction_dimension: 64, // 768 → 64 via a separate routing autoencoder
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
    // Canonical callers must use native semantic_768. Legacy 384 inputs are
    // accepted only by explicitly named reference-lane contracts.
    min_dimension: 768,
    max_dimension: 768,
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
  version: '2.0',
  schema_version: '768-canonical-plus-mrl-512-256-128-v5',

  /**
   * Explicit representation lineage contract.
   * Keep each lane separate and fuse downstream by rank or calibrated score,
   * never by raw coordinate concatenation.
   */
  representations: {
    semantic_768: {
      lane_id: 'dense_768',
      role: 'canonical_semantic_authority',
      status: 'ACTIVE',
      source_dimension: 768,
      output_dimension: 768,
      projection_method: 'none',
      projection_version: 'embeddinggemma-native-768-v1',
      normalization: 'L2',
      collection: 'codebase_chunks_768_v2',
    },
    semantic_512: {
      lane_id: 'mrl_512',
      role: 'derived_reference_projection',
      status: 'REFERENCE_ONLY',
      source_dimension: 768,
      output_dimension: 512,
      projection_method: 'mrl_prefix_truncate_renormalize',
      projection_version: 'embeddinggemma-mrl-512-v1',
      normalization: 'L2',
      collection: null,
      alias_for: 'semantic_mrl_512',
    },
    semantic_mrl_512: {
      lane_id: 'mrl_512',
      role: 'derived_reference_projection',
      status: 'REFERENCE_ONLY',
      source_dimension: 768,
      output_dimension: 512,
      projection_method: 'mrl_prefix_truncate_renormalize',
      projection_version: 'embeddinggemma-full768-v1',
      normalization: 'L2',
      collection: null,
      parent_representation: 'semantic_768',
      query_encoder_role: 'QUERY',
      candidate_encoder_role: 'DOCUMENT',
    },
    semantic_mrl_256: {
      lane_id: 'mrl_256',
      role: 'derived_reference_projection',
      status: 'REFERENCE_ONLY',
      source_dimension: 768,
      output_dimension: 256,
      projection_method: 'mrl_prefix_truncate_renormalize',
      projection_version: 'embeddinggemma-full768-v1',
      normalization: 'L2',
      collection: null,
      parent_representation: 'semantic_768',
      query_encoder_role: 'QUERY',
      candidate_encoder_role: 'DOCUMENT',
    },
    semantic_mrl_128: {
      lane_id: 'mrl_128',
      role: 'derived_reference_projection',
      status: 'REFERENCE_ONLY',
      source_dimension: 768,
      output_dimension: 128,
      projection_method: 'mrl_prefix_truncate_renormalize',
      projection_version: 'embeddinggemma-full768-v1',
      normalization: 'L2',
      collection: null,
      parent_representation: 'semantic_768',
      query_encoder_role: 'QUERY',
      candidate_encoder_role: 'DOCUMENT',
    },
    semantic_384: {
      lane_id: 'dense_384',
      role: 'legacy_external_model_retrieval',
      status: 'REFERENCE_ONLY',
      source_dimension: 384,
      output_dimension: 384,
      projection_method: 'legacy_external_model',
      projection_version: 'legacy-dense-384-v1',
      normalization: 'L2',
      collection: 'codebase_chunks_384_hybrid',
    },
    latent_64: {
      lane_id: 'latent_64',
      role: 'routing_only',
      status: 'ACTIVE',
      source_dimension: 768,
      output_dimension: 64,
      projection_method: 'autoencoder',
      projection_version: 'atlas-ae-768x64-v1',
      normalization: 'L2',
      collection: 'codebase_topology_64',
    },
  },

  /**
   * Canonical timestamp (when this contract was locked)
   */
  locked_at: new Date('2026-07-21').toISOString(),

  /**
   * Description for documentation
   */
  description:
    'Legal AI platform embedding contract. 768-dim is the canonical dense lane; ' +
    '384-dim may exist only as a legacy or experimental projection with explicit lineage. ' +
    'L2-normalized. Used by Qdrant ANN search, TurboVec prefilter, GPU reranking, and ACE context assembly.',
} as const;

export const SOURCE_EMBEDDING_DIMENSION = EMBEDDING_CONTRACT.source_embedding_dimension;
export const RETRIEVAL_EMBEDDING_DIMENSION = EMBEDDING_CONTRACT.retrieval_embedding_dimension;
export const SOURCE_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_source_collection;
export const RETRIEVAL_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection;
export type EmbeddingRepresentationName = keyof typeof EMBEDDING_CONTRACT.representations;

export function getEmbeddingRepresentation(name: EmbeddingRepresentationName) {
  return EMBEDDING_CONTRACT.representations[name];
}

/**
 * Type guard: verify embedding has correct dimension and normalization
 */
export function isValidEmbedding(embedding: number[] | Float32Array): boolean {
  if (!embedding) return false;

  if (
    embedding.length !== EMBEDDING_CONTRACT.embedding_dimension &&
    embedding.length !== EMBEDDING_CONTRACT.retrieval_embedding_dimension &&
    embedding.length !== EMBEDDING_CONTRACT.native_dimension
  ) {
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
