import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().min(1);

export const relationshipVectorPointSchema = z.object({
  relationship_id: id,
  relationship_revision: revision,
  source_revision: revision,
  semantic_768_ref: z.string().min(1),
  embedding_model_revision: revision,
  projection_revision: revision,
  domain: z.string().min(1).nullable().optional(),
  relationship_type: z.string().min(1),
  participant_entity_ids: z.array(id).default([]),
  evidence_refs: z.array(id).default([]),
}).strict();

export const relationshipVectorProjectionReceiptSchema = z.object({
  schema: z.literal('atlas.relationship-vector-projection-receipt.v1').default('atlas.relationship-vector-projection-receipt.v1'),
  projection_revision: revision,
  source_snapshot_revision: revision,
  embedding_model_revision: revision,
  executor: z.enum(['pgvector_exact', 'pgvector_hnsw', 'qdrant', 'cuvs_bruteforce', 'cuvs_cagra']),
  logical_lane: z.literal('semantic').default('semantic'),
  vector_count: z.number().int().nonnegative(),
  dimensions: z.literal(768).default(768),
  source_checksum: checksum,
  output_checksum: checksum.nullable().optional(),
  peak_vram_bytes: z.number().int().nonnegative().nullable().optional(),
  build_parameters: z.record(z.string(), z.unknown()).default({}),
  producer_revision: revision,
}).strict();

export const relationshipAnnEvaluationReceiptSchema = z.object({
  schema: z.literal('atlas.relationship-ann-evaluation-receipt.v1').default('atlas.relationship-ann-evaluation-receipt.v1'),
  query_set_revision: revision,
  exact_executor: z.enum(['pgvector_exact', 'cuvs_bruteforce']),
  challenger_executor: z.enum(['pgvector_hnsw', 'qdrant', 'cuvs_cagra']),
  k: z.number().int().positive(),
  recall_at_k: z.number().finite().min(0).max(1),
  mean_latency_ms: z.number().finite().nonnegative(),
  p95_latency_ms: z.number().finite().nonnegative(),
  exact_result_checksum: checksum,
  challenger_result_checksum: checksum,
  producer_revision: revision,
}).strict();

export type RelationshipVectorPointV1 = z.infer<typeof relationshipVectorPointSchema>;
export type RelationshipVectorProjectionReceiptV1 = z.infer<typeof relationshipVectorProjectionReceiptSchema>;
export type RelationshipAnnEvaluationReceiptV1 = z.infer<typeof relationshipAnnEvaluationReceiptSchema>;

/**
 * TODO(FI-17): implement Qdrant upsert using canonical relationship_id payloads.
 * Qdrant point IDs are projection IDs only; relationship_id remains canonical.
 */
export interface QdrantRelationshipProjectorV1 {
  upsert(points: RelationshipVectorPointV1[]): Promise<RelationshipVectorProjectionReceiptV1>;
}

/**
 * TODO(FI-17): implement cuVS brute-force exact oracle and CAGRA build/search
 * worker. The worker consumes a frozen relationship semantic_768 snapshot and
 * must emit the projection receipt before its index becomes eligible.
 */
export interface CuvsRelationshipProjectorV1 {
  buildExact(points: RelationshipVectorPointV1[]): Promise<RelationshipVectorProjectionReceiptV1>;
  buildCagra(points: RelationshipVectorPointV1[]): Promise<RelationshipVectorProjectionReceiptV1>;
}
