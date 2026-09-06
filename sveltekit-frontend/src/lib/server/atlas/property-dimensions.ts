/**
 * property-dimensions.ts
 *
 * Canonical registry for embedding/feature vector dimensions.
 * Single source of truth to replace scattered hardcoded representation widths.
 *
 * Usage:
 *   import { DIMENSIONS } from '$lib/server/atlas/property-dimensions';
 *   const embedding = new Float32Array(DIMENSIONS.DENSE_CANONICAL.size);
 */

import type { Simplify } from 'type-fest';

/**
 * Dimension definitions.
 * Each dimension has a name, size, and semantic role.
 */
export const DIMENSIONS = {
  /** 768-dim: Native embeddinggemma:latest canonical semantic representation. */
  DENSE_CANONICAL: {
    name: 'dense_768_canonical',
    size: 768,
    model: 'embeddinggemma:latest',
    role: 'semantic_truth',
    lineage_key: 'embedding_768_native'
  } as const,

  /** EmbeddingGemma MRL prefix view derived from semantic_768. */
  DENSE_MRL_512: {
    name: 'semantic_mrl_512',
    size: 512,
    model: 'embeddinggemma:latest',
    role: 'derived_semantic_view',
    lineage_key: 'semantic_768:mrl_512'
  } as const,

  /** EmbeddingGemma MRL prefix view derived from semantic_768. */
  DENSE_MRL_256: {
    name: 'semantic_mrl_256',
    size: 256,
    model: 'embeddinggemma:latest',
    role: 'derived_semantic_view',
    lineage_key: 'semantic_768:mrl_256'
  } as const,

  /** EmbeddingGemma MRL prefix view derived from semantic_768. */
  DENSE_MRL_128: {
    name: 'semantic_mrl_128',
    size: 128,
    model: 'embeddinggemma:latest',
    role: 'derived_semantic_view',
    lineage_key: 'semantic_768:mrl_128'
  } as const,

  /** 384-dim: retired compatibility projection; never a live EmbeddingGemma lane. */
  DENSE_LEGACY_RETRIEVAL: {
    name: 'dense_384_retrieval',
    size: 384,
    model: 'embeddinggemma:latest:truncated',
    role: 'reference_only',
    lineage_key: 'embedding_384_truncated'
  } as const,

  /** 256-dim: physical learned autoencoder bottleneck derived from semantic_768. */
  LATENT_256: {
    name: 'latent_256',
    size: 256,
    model: 'nested-semantic-autoencoder-v3-full01',
    role: 'learned_routing_projection',
    lineage_key: 'semantic_768:autoencoder:latent_256'
  } as const,

  /** 128-dim: derived learned autoencoder view. */
  LATENT_128: {
    name: 'latent_128',
    size: 128,
    model: 'nested-semantic-autoencoder-v3-full01',
    role: 'learned_routing_projection',
    lineage_key: 'latent_256:prefix_128'
  } as const,

  /** 64-dim: derived learned autoencoder view for routing/clustering only. */
  LATENT_ROUTING: {
    name: 'latent_64_routing',
    size: 64,
    model: 'autoencoder_768_to_64',
    role: 'routing_and_clustering',
    lineage_key: 'embedding_64_latent'
  } as const
} as const;

/**
 * Validate that a vector matches expected dimensionality.
 */
export function validateDimension(
  vector: Float32Array | number[],
  expectedDim: (typeof DIMENSIONS)[keyof typeof DIMENSIONS]
): boolean {
  return vector.length === expectedDim.size;
}

/**
 * Get dimension by size (reverse lookup).
 */
export function getDimensionBySize(
  size: number
): (typeof DIMENSIONS)[keyof typeof DIMENSIONS] | null {
  const matches = Object.values(DIMENSIONS).filter((dim) => dim.size === size);
  // 128 and 256 are intentionally shared by MRL and latent families. A raw
  // length cannot identify the coordinate system; callers must name it.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Qdrant collection names and their canonical dimensions.
 */
export const QDRANT_COLLECTIONS = {
  /** Primary code/document index (768-dim native). */
  codebase_chunks_768: DIMENSIONS.DENSE_CANONICAL,

  /** Retired compatibility collection; no new 384 writes or query routing. */
  codebase_chunks_384: DIMENSIONS.DENSE_LEGACY_RETRIEVAL,

  /** Evidence and research documents. */
  evidence_items: DIMENSIONS.DENSE_CANONICAL,

  /** Legal documents index. */
  legal_documents: DIMENSIONS.DENSE_CANONICAL,

  /** Chat context search. */
  chat_messages: DIMENSIONS.DENSE_CANONICAL
} as const;

export type QdrantCollectionName = keyof typeof QDRANT_COLLECTIONS;

/**
 * Get the expected dimension for a Qdrant collection.
 */
export function getQdrantDimension(
  collectionName: QdrantCollectionName
): (typeof DIMENSIONS)[keyof typeof DIMENSIONS] {
  return QDRANT_COLLECTIONS[collectionName];
}

/**
 * Default Qdrant search collection and its dimension.
 */
export const DEFAULT_QDRANT_COLLECTION = {
  name: 'codebase_chunks_768' as const,
  dimension: DIMENSIONS.DENSE_CANONICAL
} as const;

/**
 * Postgres vector column definitions.
 */
export const POSTGRES_VECTORS = {
  /** codebase_chunk_index.content_embedding */
  content_embedding: DIMENSIONS.DENSE_CANONICAL,

  /** atlas_packets.embedding (deprecated, unused) */
  packet_embedding: DIMENSIONS.DENSE_CANONICAL,

  /** feature_matrix.dense_768 (canonical lineage) */
  feature_dense_768: DIMENSIONS.DENSE_CANONICAL,

  /** feature_matrix.dense_384 (retired compatibility projection) */
  feature_dense_384: DIMENSIONS.DENSE_LEGACY_RETRIEVAL,

  /** feature_matrix.latent_64 (routing features) */
  feature_latent_64: DIMENSIONS.LATENT_ROUTING
} as const;

export type PostgresVectorColumn = keyof typeof POSTGRES_VECTORS;

/**
 * Get Postgres vector dimension by column name.
 */
export function getPostgresVectorDimension(
  columnName: PostgresVectorColumn
): (typeof DIMENSIONS)[keyof typeof DIMENSIONS] {
  return POSTGRES_VECTORS[columnName];
}

/**
 * Type-safe helper for vector operations.
 */
export type DimensionConfig = Simplify<(typeof DIMENSIONS)[keyof typeof DIMENSIONS]>;

/**
 * Redis keys for cached dimension metadata.
 */
export const DIMENSION_REDIS_KEYS = {
  /** Hash: dimension_name → json config */
  dimensions: 'config:dimensions',

  /** Hash: collection_name → dimension_name */
  qdrant_dimensions: 'config:qdrant_dimensions',

  /** Hash: postgres_column → dimension_name */
  postgres_dimensions: 'config:postgres_dimensions',

  /** Set: list of all known dimension names */
  all_dimensions: 'config:all_dimensions'
} as const;

/**
 * Export all dimensions as a tuple for iteration.
 */
export const ALL_DIMENSIONS = [
  DIMENSIONS.DENSE_CANONICAL,
  DIMENSIONS.DENSE_LEGACY_RETRIEVAL,
  DIMENSIONS.LATENT_ROUTING
] as const;

export type AnyDimension = (typeof ALL_DIMENSIONS)[number];
