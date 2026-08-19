import { createHash } from 'crypto';

/**
 * Parent Atlas currently has a real/tested 512-dim EmbeddingGemma Qdrant
 * projection. Do not invent a 768-dim persisted corpus merely because the
 * underlying model's native output is 768. EmbeddingGemma explicitly supports
 * MRL 512 by prefix truncation followed by L2 re-normalization.
 */
export const ATLAS_CANONICAL_SEMANTIC_REPRESENTATION = 'semantic_512' as const;
export const ATLAS_CANONICAL_SEMANTIC_DIMENSION = 512 as const;
export const ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION = 768 as const;
export const ATLAS_SEMANTIC_PROJECTION_METHOD = 'embeddinggemma-mrl-prefix-renorm' as const;
export const QDRANT_SEMANTIC_COLLECTION = 'codebase_chunks_512' as const;
// The existing codebase_chunks_512 collection was created as a single unnamed
// dense-vector collection. null means callers MUST omit Qdrant's `using` field.
export const QDRANT_SEMANTIC_VECTOR_NAME = null as null;

export const QDRANT_BM42_CHALLENGER_COLLECTION = 'codebase_chunks_384_hybrid' as const;
export const QDRANT_BM42_VECTOR_NAME = 'bm42' as const;

export type QdrantMemoryTier = 'hot' | 'warm' | 'cold';

/**
 * PostgreSQL remains the identity authority. Qdrant is a rebuildable semantic
 * projection. tree_node_id / feature_label may be null when the upstream
 * structural/classification owner has not populated them; they must never be
 * fabricated by KNN, clustering, or Qdrant point identity.
 */
export interface AtlasQdrantSemanticPayloadV1 {
  schema_version: 'atlas-qdrant-semantic-projection-v1';
  canonical_id: string;
  packet_key: string;
  symbol_version_id: string | null;
  tree_node_id: string | null;
  feature_id?: string | null;
  feature_label?: string | null;
  snapshot_id: string | null;
  workspace_revision: string;
  source_revision: string;
  representation_id: typeof ATLAS_CANONICAL_SEMANTIC_REPRESENTATION;
  representation_revision: number;
  native_model_dimension: typeof ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION;
  projection_method: typeof ATLAS_SEMANTIC_PROJECTION_METHOD;
  projection_revision: string;
  source_ref: string;
  language: string | null;
  node_type: string | null;
  module: string | null;
  domain: string | null;
  graph_component: string | null;
  community: string | null;
  kmeans_cluster_id?: number | null;
}

export interface AtlasQdrantSemanticProjectionV1 {
  schema: 'atlas.qdrant-semantic-projection.v1';
  collection: typeof QDRANT_SEMANTIC_COLLECTION;
  vectorName: null;
  representationId: typeof ATLAS_CANONICAL_SEMANTIC_REPRESENTATION;
  nativeModelDimension: typeof ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION;
  dimension: typeof ATLAS_CANONICAL_SEMANTIC_DIMENSION;
  projectionMethod: typeof ATLAS_SEMANTIC_PROJECTION_METHOD;
  distance: 'Cosine';
  memoryTier: QdrantMemoryTier;
  vectorStorage: 'on-disk';
  hnswStorage: 'memory-or-mmap';
  quantization: 'int8';
  payload: AtlasQdrantSemanticPayloadV1;
  payloadChecksum: string;
}

export interface AtlasBm42ChallengerProjectionV1 {
  schema: 'atlas.qdrant-bm42-challenger.v1';
  collection: typeof QDRANT_BM42_CHALLENGER_COLLECTION;
  vectorName: typeof QDRANT_BM42_VECTOR_NAME;
  role: 'experimental-challenger';
  evidenceAuthority: false;
  packetKey: string;
  sourceRevision: string;
}

export const ATLAS_QDRANT_FILTER_FIELDS_V1 = [
  'packet_key',
  'symbol_version_id',
  'tree_node_id',
  'feature_id',
  'feature_label',
  'snapshot_id',
  'workspace_revision',
  'source_revision',
  'representation_id',
  'representation_revision',
  'native_model_dimension',
  'projection_method',
  'projection_revision',
  'source_ref',
  'language',
  'node_type',
  'module',
  'domain',
  'graph_component',
  'community',
  'kmeans_cluster_id',
] as const;

export function canonicalSemanticId(snapshotId: string | null, packetKey: string): string {
  return snapshotId ? `${snapshotId}:${packetKey}` : packetKey;
}

export function checksumQdrantPayloadV1(payload: AtlasQdrantSemanticPayloadV1): string {
  const ordered = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

export function assertQdrantSemanticPayloadV1(payload: AtlasQdrantSemanticPayloadV1): void {
  if (!payload.packet_key || !payload.canonical_id || !payload.source_ref) {
    throw new Error('ATLAS_QDRANT_IDENTITY_REQUIRED');
  }
  if (!payload.workspace_revision || !payload.source_revision || !payload.projection_revision) {
    throw new Error('ATLAS_QDRANT_REVISION_REQUIRED');
  }
  if (payload.representation_id !== ATLAS_CANONICAL_SEMANTIC_REPRESENTATION) {
    throw new Error(`ATLAS_QDRANT_REPRESENTATION_MISMATCH: expected ${ATLAS_CANONICAL_SEMANTIC_REPRESENTATION}`);
  }
  if (payload.native_model_dimension !== ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION) {
    throw new Error(`ATLAS_QDRANT_NATIVE_DIMENSION_MISMATCH: expected ${ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION}`);
  }
  if (payload.projection_method !== ATLAS_SEMANTIC_PROJECTION_METHOD) {
    throw new Error(`ATLAS_QDRANT_PROJECTION_METHOD_MISMATCH: expected ${ATLAS_SEMANTIC_PROJECTION_METHOD}`);
  }
  if (!Number.isInteger(payload.representation_revision) || payload.representation_revision < 0) {
    throw new Error('ATLAS_QDRANT_REPRESENTATION_REVISION_INVALID');
  }
  const expectedCanonical = canonicalSemanticId(payload.snapshot_id, payload.packet_key);
  if (payload.canonical_id !== expectedCanonical) {
    throw new Error(`ATLAS_QDRANT_CANONICAL_ID_MISMATCH: expected ${expectedCanonical}`);
  }
}

export function buildQdrantSemanticProjectionV1(
  payload: AtlasQdrantSemanticPayloadV1,
  memoryTier: QdrantMemoryTier = 'warm',
): AtlasQdrantSemanticProjectionV1 {
  assertQdrantSemanticPayloadV1(payload);
  return {
    schema: 'atlas.qdrant-semantic-projection.v1',
    collection: QDRANT_SEMANTIC_COLLECTION,
    vectorName: QDRANT_SEMANTIC_VECTOR_NAME,
    representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    nativeModelDimension: ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
    dimension: ATLAS_CANONICAL_SEMANTIC_DIMENSION,
    projectionMethod: ATLAS_SEMANTIC_PROJECTION_METHOD,
    distance: 'Cosine',
    memoryTier,
    vectorStorage: 'on-disk',
    hnswStorage: 'memory-or-mmap',
    quantization: 'int8',
    payload,
    payloadChecksum: checksumQdrantPayloadV1(payload),
  };
}

export function buildBm42ChallengerProjectionV1(
  packetKey: string,
  sourceRevision: string,
): AtlasBm42ChallengerProjectionV1 {
  if (!packetKey || !sourceRevision) throw new Error('ATLAS_BM42_IDENTITY_REQUIRED');
  return {
    schema: 'atlas.qdrant-bm42-challenger.v1',
    collection: QDRANT_BM42_CHALLENGER_COLLECTION,
    vectorName: QDRANT_BM42_VECTOR_NAME,
    role: 'experimental-challenger',
    evidenceAuthority: false,
    packetKey,
    sourceRevision,
  };
}
