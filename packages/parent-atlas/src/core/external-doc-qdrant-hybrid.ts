import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const qdrantUuid = z.string().uuid();

export const externalDocsHybridCollectionSchema = z.object({
  schema: z.literal('atlas.external-docs-hybrid-collection.v1').default('atlas.external-docs-hybrid-collection.v1'),
  collection_name: z.string().min(1),
  dense_vector_name: z.literal('semantic_768'),
  dense_dimension: z.literal(768),
  dense_distance: z.literal('Cosine'),
  sparse_vector_name: z.literal('lexical_bm25'),
  sparse_modifier: z.literal('idf'),
  bm25_model: z.literal('qdrant/bm25'),
  live_storage: z.literal('LOCAL_POSIX_NVME'),
  semantic_lane_votes: z.literal(1),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ExternalDocsHybridCollectionV1 = z.infer<typeof externalDocsHybridCollectionSchema>;

export const externalDocsHybridPointSchema = z.object({
  schema: z.literal('atlas.external-docs-hybrid-point.v1').default('atlas.external-docs-hybrid-point.v1'),
  point_id: qdrantUuid,
  chunk_id: id,
  source_id: id,
  source_revision: revision,
  document_checksum: checksum,
  chunk_checksum: checksum,
  domain_class: z.string().min(1),
  ontology_classes: z.array(z.string().min(1)).default([]),
  language: z.string().min(1),
  text: z.string().min(1),
  semantic_768: z.array(z.number().finite()).length(768),
  embedding_revision: revision,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ExternalDocsHybridPointV1 = z.infer<typeof externalDocsHybridPointSchema>;

export const externalDocsHybridMigrationPlanSchema = z.object({
  schema: z.literal('atlas.external-docs-hybrid-migration-plan.v1').default('atlas.external-docs-hybrid-migration-plan.v1'),
  plan_id: id,
  plan_revision: revision,
  source_collection: z.literal('external_programming_docs_768'),
  shadow_collection: z.literal('external_programming_docs_hybrid_768'),
  collection_schema: externalDocsHybridCollectionSchema,
  phases: z.tuple([
    z.literal('CREATE_SHADOW'),
    z.literal('POPULATE_CHANGED_AND_CURRENT'),
    z.literal('VERIFY_POINT_COUNTS'),
    z.literal('VERIFY_DENSE_EXACT_PARITY'),
    z.literal('VERIFY_BM25_RETRIEVAL'),
    z.literal('VERIFY_HYBRID_RETRIEVAL'),
    z.literal('CUTOVER_RETRIEVAL_OWNER'),
    z.literal('SNAPSHOT_OLD_COLLECTION'),
  ]),
  minimum_dense_topk_overlap: z.number().finite().min(0).max(1),
  minimum_bm25_recall_at_k: z.number().finite().min(0).max(1),
  old_collection_delete_allowed: z.literal(false).default(false),
  cutover_requires_receipt: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.collection_schema.collection_name !== value.shadow_collection) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['collection_schema', 'collection_name'], message: 'shadow collection schema must target the shadow collection' });
  }
});
export type ExternalDocsHybridMigrationPlanV1 = z.infer<typeof externalDocsHybridMigrationPlanSchema>;

export const externalDocsHybridProjectionReceiptSchema = z.object({
  schema: z.literal('atlas.external-docs-hybrid-projection-receipt.v1').default('atlas.external-docs-hybrid-projection-receipt.v1'),
  receipt_id: id,
  collection_name: z.literal('external_programming_docs_hybrid_768'),
  projection_revision: revision,
  source_snapshot_revision: revision,
  changed_point_count: z.number().int().nonnegative(),
  deleted_point_count: z.number().int().nonnegative(),
  unchanged_point_count: z.number().int().nonnegative(),
  dense_vector_name: z.literal('semantic_768'),
  sparse_vector_name: z.literal('lexical_bm25'),
  bm25_modifier: z.literal('idf'),
  point_set_checksum: checksum,
  qdrant_operation_ids: z.array(z.union([z.string().min(1), z.number().int().nonnegative()])).default([]),
  status: z.enum(['WRITTEN_UNVERIFIED', 'VERIFIED']),
  dense_parity_receipt_id: id.nullable().default(null),
  bm25_retrieval_receipt_id: id.nullable().default(null),
  hybrid_retrieval_receipt_id: id.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.status === 'VERIFIED' && (
    value.dense_parity_receipt_id === null ||
    value.bm25_retrieval_receipt_id === null ||
    value.hybrid_retrieval_receipt_id === null
  )) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'verified hybrid projection requires dense, BM25 and hybrid retrieval receipts' });
  }
});
export type ExternalDocsHybridProjectionReceiptV1 = z.infer<typeof externalDocsHybridProjectionReceiptSchema>;

export type QdrantHybridWirePointV1 = {
  id: string;
  vector: {
    semantic_768: number[];
    lexical_bm25: {
      text: string;
      model: 'qdrant/bm25';
    };
  };
  payload: Record<string, unknown>;
};

export interface ExternalDocsHybridQdrantPort {
  upsert(points: QdrantHybridWirePointV1[]): Promise<Array<string | number>>;
  delete(pointIds: string[]): Promise<Array<string | number>>;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Stable UUID-shaped point ID. Chunk identity remains in payload; this is a transport ID only. */
export function qdrantPointUuidForChunk(chunkId: string): string {
  const bytes = Uint8Array.from(sha256(`atlas:external-doc:${chunkId}`).subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function hybridWirePoint(point: ExternalDocsHybridPointV1): QdrantHybridWirePointV1 {
  const parsed = externalDocsHybridPointSchema.parse(point);
  return {
    id: parsed.point_id,
    vector: {
      semantic_768: parsed.semantic_768,
      lexical_bm25: {
        text: parsed.text,
        model: 'qdrant/bm25',
      },
    },
    payload: {
      chunk_id: parsed.chunk_id,
      source_id: parsed.source_id,
      source_revision: parsed.source_revision,
      document_checksum: parsed.document_checksum,
      chunk_checksum: parsed.chunk_checksum,
      domain_class: parsed.domain_class,
      ontology_classes: parsed.ontology_classes,
      language: parsed.language,
      embedding_revision: parsed.embedding_revision,
      producer_revision: parsed.producer_revision,
      canonical_authority: false,
    },
  };
}

export async function projectExternalDocDelta(input: {
  port: ExternalDocsHybridQdrantPort;
  projectionRevision: string;
  sourceSnapshotRevision: string;
  changed: readonly ExternalDocsHybridPointV1[];
  deletedChunkIds: readonly string[];
  unchangedPointCount: number;
  producerRevision: string;
}): Promise<ExternalDocsHybridProjectionReceiptV1> {
  const changed = input.changed.map((point) => externalDocsHybridPointSchema.parse(point));
  const sorted = [...changed].sort((a, b) => a.point_id.localeCompare(b.point_id));
  const wirePoints = sorted.map(hybridWirePoint);
  const deletedIds = [...new Set(input.deletedChunkIds.map(qdrantPointUuidForChunk))].sort();
  const operationIds: Array<string | number> = [];
  if (wirePoints.length) operationIds.push(...await input.port.upsert(wirePoints));
  if (deletedIds.length) operationIds.push(...await input.port.delete(deletedIds));
  const pointSetChecksum = createHash('sha256').update(JSON.stringify({
    upsert: sorted.map((point) => ({ point_id: point.point_id, chunk_checksum: point.chunk_checksum, embedding_revision: point.embedding_revision })),
    deleted: deletedIds,
  })).digest('hex');
  return externalDocsHybridProjectionReceiptSchema.parse({
    receipt_id: `external-doc-qdrant:${input.projectionRevision}:${pointSetChecksum.slice(0, 16)}`,
    collection_name: 'external_programming_docs_hybrid_768',
    projection_revision: input.projectionRevision,
    source_snapshot_revision: input.sourceSnapshotRevision,
    changed_point_count: sorted.length,
    deleted_point_count: deletedIds.length,
    unchanged_point_count: input.unchangedPointCount,
    dense_vector_name: 'semantic_768',
    sparse_vector_name: 'lexical_bm25',
    bm25_modifier: 'idf',
    point_set_checksum: pointSetChecksum,
    qdrant_operation_ids: operationIds,
    status: 'WRITTEN_UNVERIFIED',
    canonical_authority: false,
    producer_revision: input.producerRevision,
  });
}

export function defaultExternalDocsHybridMigrationPlan(planRevision: string): ExternalDocsHybridMigrationPlanV1 {
  return externalDocsHybridMigrationPlanSchema.parse({
    plan_id: `external-docs-hybrid:${planRevision}`,
    plan_revision: planRevision,
    source_collection: 'external_programming_docs_768',
    shadow_collection: 'external_programming_docs_hybrid_768',
    collection_schema: {
      collection_name: 'external_programming_docs_hybrid_768',
      dense_vector_name: 'semantic_768',
      dense_dimension: 768,
      dense_distance: 'Cosine',
      sparse_vector_name: 'lexical_bm25',
      sparse_modifier: 'idf',
      bm25_model: 'qdrant/bm25',
      live_storage: 'LOCAL_POSIX_NVME',
      semantic_lane_votes: 1,
      canonical_authority: false,
    },
    phases: [
      'CREATE_SHADOW',
      'POPULATE_CHANGED_AND_CURRENT',
      'VERIFY_POINT_COUNTS',
      'VERIFY_DENSE_EXACT_PARITY',
      'VERIFY_BM25_RETRIEVAL',
      'VERIFY_HYBRID_RETRIEVAL',
      'CUTOVER_RETRIEVAL_OWNER',
      'SNAPSHOT_OLD_COLLECTION',
    ],
    minimum_dense_topk_overlap: 0.99,
    minimum_bm25_recall_at_k: 0.95,
    old_collection_delete_allowed: false,
    cutover_requires_receipt: true,
    canonical_authority: false,
  });
}
