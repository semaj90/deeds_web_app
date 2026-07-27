/**
 * property-dimensions.ts
 *
 * Canonical registry for embedding/feature vector dimensions.
 * Single source of truth to replace scattered hardcoded 768/384/64 values.
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
    linceage_key: 'embedding_768_native'
  } as const,

  /** 384-dim: Online retrieval contract (Qdrant payload). */
  DENSE_RETRIEVAL: {
    name: 'dense_384_retrieval',
    size: 384,
    model: 'embeddinggemma:latest:truncated',
    role: 'online_retrieval',
    lineage_key: 'embedding_384_truncated'
  } as const,

  /** 64-dim: Routing + clustering only (latent autoencoder). */
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
  for (const dim of Object.values(DIMENSIONS)) {
    if (dim.size === size) return dim;
  }
  return null;
}

/**
 * Qdrant collection names and their canonical dimensions.
 */
export const QDRANT_COLLECTIONS = {
  /** Primary code/document index (768-dim native). */
  codebase_chunks_768: DIMENSIONS.DENSE_CANONICAL,

  /** Secondary retrieval mirror (384-dim online contract). */
  codebase_chunks_384: DIMENSIONS.DENSE_RETRIEVAL,

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
  content_embedding: DIMENSIONS.DENSE_RETRIEVAL,

  /** atlas_packets.embedding (deprecated, unused) */
  packet_embedding: DIMENSIONS.DENSE_CANONICAL,

  /** feature_matrix.dense_768 (canonical lineage) */
  feature_dense_768: DIMENSIONS.DENSE_CANONICAL,

  /** feature_matrix.dense_384 (retrieval projection) */
  feature_dense_384: DIMENSIONS.DENSE_RETRIEVAL,

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
  DIMENSIONS.DENSE_RETRIEVAL,
  DIMENSIONS.LATENT_ROUTING
] as const;

export type AnyDimension = (typeof ALL_DIMENSIONS)[number];
