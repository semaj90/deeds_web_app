import { z } from 'zod';

/**
 * Hard boundary for the active codebase Qdrant projection.
 *
 * `source_ref` identifies the Postgres-owned source record. It is not an
 * embedding coordinate and it is not replaced by a Qdrant point id. The
 * active dense projection is EmbeddingGemma native semantic_768 only.
 */
export const CANONICAL_CODEBASE_QDRANT_COLLECTION = 'codebase_chunks_768_v2' as const;
export const CANONICAL_CODEBASE_REPRESENTATION = 'semantic_768' as const;
export const CANONICAL_CODEBASE_DIMENSION = 768 as const;

const NonEmpty = z.string().trim().min(1);

export const CanonicalSemantic768SourceRefV1Schema = z.object({
  packet_key: NonEmpty,
  source_ref: NonEmpty,
  postgres_id: NonEmpty,
  qdrant_collection: z.literal(CANONICAL_CODEBASE_QDRANT_COLLECTION),
  representation_id: z.literal(CANONICAL_CODEBASE_REPRESENTATION),
  embedding_dimension: z.literal(CANONICAL_CODEBASE_DIMENSION),
  qdrant_vector_dim: z.literal(CANONICAL_CODEBASE_DIMENSION),
  embedding_model: NonEmpty.regex(/embeddinggemma/i, 'EmbeddingGemma is required for the active semantic_768 lane'),
  embedding_native_dimension: z.literal(CANONICAL_CODEBASE_DIMENSION),
  embedding_lane: z.literal('dense_768'),
  embedding_role: z.literal('canonical_native_semantic'),
  embedding_status: z.literal('ACTIVE'),
  projection_method: z.literal('none'),
  normalization: z.literal('L2'),
  ontology_version: NonEmpty,
  ontology_revision: NonEmpty,
  domain_class: NonEmpty,
  concepts: z.array(NonEmpty),
});

export type CanonicalSemantic768SourceRefV1 = z.infer<typeof CanonicalSemantic768SourceRefV1Schema>;

export function assertCanonicalSemantic768SourceRefV1(
  value: unknown,
): asserts value is CanonicalSemantic768SourceRefV1 {
  CanonicalSemantic768SourceRefV1Schema.parse(value);
}
