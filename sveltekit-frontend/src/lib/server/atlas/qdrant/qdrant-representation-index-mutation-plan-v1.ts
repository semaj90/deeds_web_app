import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  QDRANT_CODEBASE_768_INDEX_PLAN,
  qdrantRepresentationIndexPlanDigest,
  type QdrantSchemaDriftV1,
} from './qdrant-representation-index-plan-v1.js';

export const QDRANT_MUTATION_PLAN_SCHEMA = 'atlas.qdrant-representation-index-mutation-plan.v1' as const;
export const QDRANT_MUTATION_PLAN_REVISION = 'atlas.qdrant-representation-index-mutation-plan.2026-08-21.v1' as const;

export const QdrantProposedOperationV1Schema = z.object({
  operationId: z.string().min(1),
  kind: z.enum(['ADD_SPARSE_VECTOR_SCHEMA', 'CREATE_PAYLOAD_INDEX']),
  method: z.enum(['PUT']),
  path: z.string().min(1),
  body: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  requiredForReady: z.boolean(),
  pointPopulation: z.literal(false),
  touchesExistingDenseSlots: z.literal(false),
  canonicalIdentityMutation: z.literal(false),
  revisionAuthorityMutation: z.literal(false),
}).strict();
export type QdrantProposedOperationV1 = z.infer<typeof QdrantProposedOperationV1Schema>;

export const QdrantRepresentationMutationPlanV1Schema = z.object({
  schema: z.literal(QDRANT_MUTATION_PLAN_SCHEMA),
  planRevision: z.literal(QDRANT_MUTATION_PLAN_REVISION),
  collection: z.literal('codebase_chunks_768'),
  representationPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceDriftStatus: z.enum(['READY', 'MISSING', 'EXTRA', 'TYPE_DRIFT', 'CONFIG_DRIFT']),
  operations: z.array(QdrantProposedOperationV1Schema),
  blockers: z.array(z.string().min(1)),
  denseSlotsProtected: z.tuple([z.literal('content'), z.literal('error'), z.literal('signature')]),
  modelProvenanceInferenceAllowed: z.literal(false),
  pointPopulationAllowed: z.literal(false),
  revisionPayloadBackfillAllowed: z.literal(false),
  applyAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  qdrantWritesAllowed: z.literal(false),
  mutationPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type QdrantRepresentationMutationPlanV1 = z.infer<typeof QdrantRepresentationMutationPlanV1Schema>;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createSparseVectorOperation(name: string, modifier: string | null, requiredForReady: boolean): QdrantProposedOperationV1 {
  return QdrantProposedOperationV1Schema.parse({
    operationId: `add-sparse-vector:${name}`,
    kind: 'ADD_SPARSE_VECTOR_SCHEMA',
    method: 'PUT',
    path: `/collections/codebase_chunks_768/vectors/${encodeURIComponent(name)}`,
    body: { sparse: modifier ? { modifier } : {} },
    reason: `missing sparse vector schema ${name}`,
    requiredForReady,
    pointPopulation: false,
    touchesExistingDenseSlots: false,
    canonicalIdentityMutation: false,
    revisionAuthorityMutation: false,
  });
}

function createPayloadIndexOperation(fieldName: string, fieldSchema: string, requiredForReady: boolean): QdrantProposedOperationV1 {
  return QdrantProposedOperationV1Schema.parse({
    operationId: `create-payload-index:${fieldName}`,
    kind: 'CREATE_PAYLOAD_INDEX',
    method: 'PUT',
    path: '/collections/codebase_chunks_768/index?wait=true',
    body: { field_name: fieldName, field_schema: fieldSchema },
    reason: `missing payload index ${fieldName}`,
    requiredForReady,
    pointPopulation: false,
    touchesExistingDenseSlots: false,
    canonicalIdentityMutation: false,
    revisionAuthorityMutation: false,
  });
}

export function buildQdrantRepresentationMutationPlanV1(drift: QdrantSchemaDriftV1): QdrantRepresentationMutationPlanV1 {
  const blockers: string[] = [];
  const operations: QdrantProposedOperationV1[] = [];

  if (drift.representationConfigDrift.length > 0) {
    blockers.push(`EXISTING_REPRESENTATION_CONFIG_DRIFT:${drift.representationConfigDrift.join(',')}`);
  }
  if (drift.payloadTypeDrift.length > 0) {
    blockers.push(`EXISTING_PAYLOAD_INDEX_TYPE_DRIFT:${drift.payloadTypeDrift.join(',')}`);
  }

  if (blockers.length === 0) {
    for (const missing of [...drift.missingRequiredRepresentations, ...drift.missingOptionalRepresentations].sort()) {
      const representation = QDRANT_CODEBASE_768_INDEX_PLAN.representations.find((entry) => entry.name === missing);
      if (!representation) {
        blockers.push(`UNPLANNED_MISSING_REPRESENTATION:${missing}`);
        continue;
      }
      if (representation.storage === 'DENSE_VECTOR') {
        // Dense slot creation/replacement is intentionally outside this tranche.
        if (representation.requiredForReady) blockers.push(`REQUIRED_DENSE_REPRESENTATION_MISSING:${missing}`);
        continue;
      }
      // Only BM25 is currently authorized for schema planning. miniCOIL and SPLADE
      // stay challenger-only until their model/revision and evaluation contracts are frozen.
      if (representation.name !== 'bm25') continue;
      operations.push(createSparseVectorOperation(
        representation.name,
        representation.modifier,
        representation.requiredForReady,
      ));
    }

    const missingPayload = new Set([
      ...drift.missingRequiredPayloadIndexes,
      ...drift.missingOptionalPayloadIndexes,
    ]);
    for (const field of QDRANT_CODEBASE_768_INDEX_PLAN.payloadIndexes) {
      if (!field.indexByDefault || !missingPayload.has(field.fieldName)) continue;
      // Revision payload fields may be indexed if already present in payload, but this
      // planner must not authorize writing/backfilling revision values themselves.
      operations.push(createPayloadIndexOperation(field.fieldName, field.fieldSchema, field.requiredForReady));
    }
  }

  operations.sort((a, b) => a.operationId.localeCompare(b.operationId));
  blockers.sort();

  const unsigned = {
    schema: QDRANT_MUTATION_PLAN_SCHEMA,
    planRevision: QDRANT_MUTATION_PLAN_REVISION,
    collection: 'codebase_chunks_768' as const,
    representationPlanSha256: qdrantRepresentationIndexPlanDigest(),
    sourceDriftStatus: drift.status,
    operations,
    blockers,
    denseSlotsProtected: ['content', 'error', 'signature'] as const,
    modelProvenanceInferenceAllowed: false as const,
    pointPopulationAllowed: false as const,
    revisionPayloadBackfillAllowed: false as const,
    applyAllowed: false as const,
    canonicalWritesAllowed: false as const,
    qdrantWritesAllowed: false as const,
  };

  return QdrantRepresentationMutationPlanV1Schema.parse({
    ...unsigned,
    mutationPlanSha256: digest(unsigned),
  });
}
