import { z } from 'zod';
import {
  ATLAS_CANONICAL_SEMANTIC_DIMENSION,
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
  ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
  QDRANT_SEMANTIC_COLLECTION,
} from './qdrant-semantic-projection.js';

/**
 * Storage ownership contract for semantic data.
 *
 * PostgreSQL owns canonical identity/revisions/registries and may host bounded
 * pgvector exact-reference columns when their representation is explicit.
 * Qdrant owns rebuildable semantic ANN/sparse projections only.
 * Dimensionality never confers identity or ownership.
 */
export const SemanticStoreRoleV1Schema = z.enum([
  'CANONICAL_METADATA',
  'RELATIONAL_EXACT_VECTOR',
  'SEMANTIC_ANN_PROJECTION',
  'LEGACY_VECTOR_STORE',
]);

export const SemanticRepresentationStorageV1Schema = z.object({
  representationId: z.enum(['semantic_512', 'semantic_768', 'legacy_ingestion_384']),
  dimension: z.union([z.literal(384), z.literal(512), z.literal(768)]),
  store: z.enum(['POSTGRES', 'QDRANT']),
  role: SemanticStoreRoleV1Schema,
  authoritativeIdentity: z.boolean(),
  rebuildable: z.boolean(),
  exactSearchCapable: z.boolean(),
  approximateSearchCapable: z.boolean(),
  collectionOrTable: z.string().min(1),
}).strict();
export type SemanticRepresentationStorageV1 = z.infer<typeof SemanticRepresentationStorageV1Schema>;

export const SEMANTIC_STORAGE_BOUNDARY_V1 = [
  {
    representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    dimension: ATLAS_CANONICAL_SEMANTIC_DIMENSION,
    store: 'POSTGRES',
    role: 'CANONICAL_METADATA',
    authoritativeIdentity: true,
    rebuildable: false,
    exactSearchCapable: false,
    approximateSearchCapable: false,
    collectionOrTable: 'atlas_packets/representation registries',
  },
  {
    representationId: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    dimension: ATLAS_CANONICAL_SEMANTIC_DIMENSION,
    store: 'QDRANT',
    role: 'SEMANTIC_ANN_PROJECTION',
    authoritativeIdentity: false,
    rebuildable: true,
    exactSearchCapable: false,
    approximateSearchCapable: true,
    collectionOrTable: QDRANT_SEMANTIC_COLLECTION,
  },
  {
    representationId: 'semantic_768',
    dimension: ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
    store: 'POSTGRES',
    role: 'RELATIONAL_EXACT_VECTOR',
    authoritativeIdentity: false,
    rebuildable: true,
    exactSearchCapable: true,
    approximateSearchCapable: false,
    collectionOrTable: 'representation-qualified pgvector snapshot/column',
  },
  {
    representationId: 'legacy_ingestion_384',
    dimension: 384,
    store: 'POSTGRES',
    role: 'LEGACY_VECTOR_STORE',
    authoritativeIdentity: false,
    rebuildable: true,
    exactSearchCapable: true,
    approximateSearchCapable: true,
    collectionOrTable: 'document_chunks / embedding_cache_enhanced',
  },
] as const satisfies readonly SemanticRepresentationStorageV1[];

export function validateSemanticStorageBoundaryV1(
  entries: readonly SemanticRepresentationStorageV1[] = SEMANTIC_STORAGE_BOUNDARY_V1,
): SemanticRepresentationStorageV1[] {
  const parsed = entries.map((entry) => SemanticRepresentationStorageV1Schema.parse(entry));

  const identityOwners = parsed.filter((entry) => entry.authoritativeIdentity);
  if (identityOwners.length !== 1 || identityOwners[0]?.store !== 'POSTGRES' || identityOwners[0]?.role !== 'CANONICAL_METADATA') {
    throw new Error('SEMANTIC_STORAGE_IDENTITY_OWNER_MUST_BE_POSTGRES_METADATA');
  }

  for (const entry of parsed) {
    if (entry.store === 'QDRANT') {
      if (entry.authoritativeIdentity) throw new Error('QDRANT_CANNOT_OWN_CANONICAL_IDENTITY');
      if (!entry.rebuildable) throw new Error('QDRANT_PROJECTION_MUST_BE_REBUILDABLE');
      if (entry.role !== 'SEMANTIC_ANN_PROJECTION') throw new Error('QDRANT_ROLE_MUST_BE_SEMANTIC_ANN_PROJECTION');
    }
    if (entry.representationId === 'semantic_512' && entry.dimension !== 512) {
      throw new Error('SEMANTIC_512_DIMENSION_MISMATCH');
    }
    if (entry.representationId === 'semantic_768' && entry.dimension !== 768) {
      throw new Error('SEMANTIC_768_DIMENSION_MISMATCH');
    }
    if (entry.representationId === 'legacy_ingestion_384' && entry.dimension !== 384) {
      throw new Error('LEGACY_INGESTION_384_DIMENSION_MISMATCH');
    }
  }

  return parsed;
}
