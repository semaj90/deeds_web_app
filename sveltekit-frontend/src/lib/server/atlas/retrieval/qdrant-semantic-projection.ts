import { createHash } from 'crypto';

export const QDRANT_SEMANTIC_768_COLLECTION = 'codebase_chunks_768_v2' as const;
export const QDRANT_SEMANTIC_768_VECTOR_NAME = 'content' as const;
export const QDRANT_BM42_CHALLENGER_COLLECTION = 'codebase_chunks_384_hybrid' as const;
export const QDRANT_BM42_VECTOR_NAME = 'bm42' as const;

export type QdrantMemoryTier = 'hot' | 'warm' | 'cold';

/**
 * PostgreSQL remains the identity authority. This is the revision-qualified
 * projection payload that Qdrant may index/filter; none of these fields are
 * allowed to mint a new canonical identity.
 */
export interface AtlasQdrantSemanticPayloadV1 {
  schema_version: 'atlas-qdrant-semantic-projection-v1';
  canonical_id: string;
  packet_key: string;
  symbol_version_id: string | null;
  tree_node_id: string | null;
  snapshot_id: string | null;
  workspace_revision: string;
  source_revision: string;
  representation_id: string;
  representation_revision: number;
  projection_revision: string;
  source_ref: string;
  language: string | null;
  node_type: string | null;
  module: string | null;
  domain: string | null;
  graph_component: string | null;
  community: string | null;
}

export interface AtlasQdrantSemanticProjectionV1 {
  schema: 'atlas.qdrant-semantic-projection.v1';
  collection: typeof QDRANT_SEMANTIC_768_COLLECTION;
  vectorName: typeof QDRANT_SEMANTIC_768_VECTOR_NAME;
  dimension: 768;
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
  'snapshot_id',
  'workspace_revision',
  'source_revision',
  'representation_id',
  'representation_revision',
  'projection_revision',
  'source_ref',
  'language',
  'node_type',
  'module',
  'domain',
  'graph_component',
  'community',
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
    collection: QDRANT_SEMANTIC_768_COLLECTION,
    vectorName: QDRANT_SEMANTIC_768_VECTOR_NAME,
    dimension: 768,
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
