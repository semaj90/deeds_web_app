import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QDRANT_REPRESENTATION_INDEX_PLAN_SCHEMA = 'atlas.qdrant-representation-index-plan.v1' as const;
export const QDRANT_REPRESENTATION_INDEX_PLAN_REVISION = 'atlas.qdrant-representation-index-plan.2026-08-21.v1' as const;

export const QdrantRepresentationRoleSchema = z.enum([
  'DENSE_SEMANTIC',
  'DENSE_DERIVED_MRL',
  'SPARSE_LEXICAL',
  'SPARSE_CONTEXTUAL_LEXICAL',
  'SPARSE_EXPANSION',
]);

export const QdrantRepresentationPlanV1Schema = z.object({
  name: z.string().min(1),
  role: QdrantRepresentationRoleSchema,
  storage: z.enum(['DENSE_VECTOR', 'SPARSE_VECTOR']),
  dimensions: z.number().int().positive().nullable(),
  distance: z.enum(['Cosine', 'Dot', 'Euclid', 'Manhattan']).nullable(),
  modifier: z.enum(['idf']).nullable(),
  modelFamily: z.string().min(1),
  representationRevision: z.string().min(1),
  derivedFrom: z.string().min(1).nullable(),
  activeByDefault: z.boolean(),
  challengerOnly: z.boolean(),
  evidenceAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.storage === 'DENSE_VECTOR' && (!value.dimensions || !value.distance)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dense vectors require dimensions and distance' });
  }
  if (value.storage === 'SPARSE_VECTOR' && (value.dimensions !== null || value.distance !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sparse vectors do not use dense dimensions/distance' });
  }
  if (value.activeByDefault && value.challengerOnly) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'challenger-only representation cannot be active by default' });
  }
});

export const QdrantPayloadIndexFieldV1Schema = z.object({
  fieldName: z.string().min(1),
  fieldSchema: z.enum(['keyword', 'integer', 'uuid', 'bool', 'datetime', 'text']),
  purpose: z.string().min(1),
  requiredForCanonicalFilter: z.boolean(),
  indexByDefault: z.boolean(),
}).strict();

export const QdrantRepresentationIndexPlanV1Schema = z.object({
  schema: z.literal(QDRANT_REPRESENTATION_INDEX_PLAN_SCHEMA),
  planRevision: z.literal(QDRANT_REPRESENTATION_INDEX_PLAN_REVISION),
  collection: z.string().min(1),
  canonicalTruthOwner: z.literal('POSTGRES'),
  projectionOwner: z.literal('QDRANT'),
  oneVotePerLogicalLane: z.literal(true),
  laneExecutorSeparation: z.literal(true),
  representations: z.array(QdrantRepresentationPlanV1Schema).min(1),
  payloadIndexes: z.array(QdrantPayloadIndexFieldV1Schema).min(1),
  forbiddenPayloadIndexPatterns: z.array(z.string().min(1)),
  canonicalWritesAllowed: z.literal(false),
  qdrantWritesAllowed: z.literal(false),
}).strict();

export type QdrantRepresentationIndexPlanV1 = z.infer<typeof QdrantRepresentationIndexPlanV1Schema>;

export const QDRANT_CODEBASE_768_INDEX_PLAN: QdrantRepresentationIndexPlanV1 = QdrantRepresentationIndexPlanV1Schema.parse({
  schema: QDRANT_REPRESENTATION_INDEX_PLAN_SCHEMA,
  planRevision: QDRANT_REPRESENTATION_INDEX_PLAN_REVISION,
  collection: 'codebase_chunks_768',
  canonicalTruthOwner: 'POSTGRES',
  projectionOwner: 'QDRANT',
  oneVotePerLogicalLane: true,
  laneExecutorSeparation: true,
  representations: [
    { name: 'semantic_768', role: 'DENSE_SEMANTIC', storage: 'DENSE_VECTOR', dimensions: 768, distance: 'Cosine', modifier: null, modelFamily: 'google/embeddinggemma-300m', representationRevision: 'semantic_768.embeddinggemma.native.v1', derivedFrom: null, activeByDefault: true, challengerOnly: false, evidenceAuthority: false },
    { name: 'semantic_mrl_512', role: 'DENSE_DERIVED_MRL', storage: 'DENSE_VECTOR', dimensions: 512, distance: 'Cosine', modifier: null, modelFamily: 'google/embeddinggemma-300m', representationRevision: 'semantic_mrl_512.prefix-l2.v1', derivedFrom: 'semantic_768', activeByDefault: false, challengerOnly: true, evidenceAuthority: false },
    { name: 'bm25', role: 'SPARSE_LEXICAL', storage: 'SPARSE_VECTOR', dimensions: null, distance: null, modifier: 'idf', modelFamily: 'qdrant/bm25', representationRevision: 'bm25.qdrant.idf.v1', derivedFrom: null, activeByDefault: false, challengerOnly: true, evidenceAuthority: false },
    { name: 'minicoil', role: 'SPARSE_CONTEXTUAL_LEXICAL', storage: 'SPARSE_VECTOR', dimensions: null, distance: null, modifier: 'idf', modelFamily: 'Qdrant/minicoil-v1', representationRevision: 'minicoil.qdrant.idf.v1', derivedFrom: null, activeByDefault: false, challengerOnly: true, evidenceAuthority: false },
    { name: 'splade', role: 'SPARSE_EXPANSION', storage: 'SPARSE_VECTOR', dimensions: null, distance: null, modifier: null, modelFamily: 'UNBOUND_SPLADE_MODEL', representationRevision: 'splade.unbound-model.v1', derivedFrom: null, activeByDefault: false, challengerOnly: true, evidenceAuthority: false },
  ],
  payloadIndexes: [
    { fieldName: 'canonical_id', fieldSchema: 'keyword', purpose: 'canonical candidate projection lookup', requiredForCanonicalFilter: true, indexByDefault: true },
    { fieldName: 'packet_key', fieldSchema: 'keyword', purpose: 'packet projection lookup', requiredForCanonicalFilter: true, indexByDefault: true },
    { fieldName: 'workspace_revision', fieldSchema: 'keyword', purpose: 'workspace revision qualification', requiredForCanonicalFilter: true, indexByDefault: true },
    { fieldName: 'source_revision', fieldSchema: 'keyword', purpose: 'source revision qualification', requiredForCanonicalFilter: true, indexByDefault: true },
    { fieldName: 'domain_class', fieldSchema: 'keyword', purpose: 'domain restriction', requiredForCanonicalFilter: false, indexByDefault: true },
    { fieldName: 'node_kind', fieldSchema: 'keyword', purpose: 'AST/node restriction', requiredForCanonicalFilter: false, indexByDefault: true },
    { fieldName: 'document_id', fieldSchema: 'keyword', purpose: 'document-scoped retrieval', requiredForCanonicalFilter: false, indexByDefault: true },
    { fieldName: 'evidence_kind', fieldSchema: 'keyword', purpose: 'evidence-kind restriction', requiredForCanonicalFilter: false, indexByDefault: true },
  ],
  forbiddenPayloadIndexPatterns: ['semantic_*', '*_score', '*_similarity', 'pagerank', 'personalized_pagerank', 'execution_utility', 'memory_utility', 'som_*', 'kmeans_*', 'cross_encoder_*'],
  canonicalWritesAllowed: false,
  qdrantWritesAllowed: false,
});

export interface QdrantSchemaObservationV1 {
  denseVectors: Record<string, { size: number; distance: string }>;
  sparseVectors: Record<string, { modifier: string | null }>;
  payloadSchema: Record<string, string>;
}

export interface QdrantSchemaDriftV1 {
  status: 'READY' | 'MISSING' | 'EXTRA' | 'TYPE_DRIFT' | 'CONFIG_DRIFT';
  missingRepresentations: string[];
  representationConfigDrift: string[];
  missingPayloadIndexes: string[];
  payloadTypeDrift: string[];
  extraPayloadIndexes: string[];
  applyAllowed: false;
}

export function compareQdrantSchemaToPlan(observation: QdrantSchemaObservationV1, plan = QDRANT_CODEBASE_768_INDEX_PLAN): QdrantSchemaDriftV1 {
  const missingRepresentations: string[] = [];
  const representationConfigDrift: string[] = [];
  for (const representation of plan.representations) {
    if (representation.storage === 'DENSE_VECTOR') {
      const observed = observation.denseVectors[representation.name];
      if (!observed) missingRepresentations.push(representation.name);
      else if (observed.size !== representation.dimensions || observed.distance.toLowerCase() !== representation.distance?.toLowerCase()) representationConfigDrift.push(representation.name);
    } else {
      const observed = observation.sparseVectors[representation.name];
      if (!observed) missingRepresentations.push(representation.name);
      else if ((observed.modifier ?? null)?.toLowerCase() !== (representation.modifier ?? null)?.toLowerCase()) representationConfigDrift.push(representation.name);
    }
  }

  const expectedPayload = new Map(plan.payloadIndexes.filter((field) => field.indexByDefault).map((field) => [field.fieldName, field.fieldSchema]));
  const missingPayloadIndexes: string[] = [];
  const payloadTypeDrift: string[] = [];
  for (const [field, type] of expectedPayload) {
    const observed = observation.payloadSchema[field];
    if (!observed) missingPayloadIndexes.push(field);
    else if (observed.toLowerCase() !== type.toLowerCase()) payloadTypeDrift.push(field);
  }
  const extraPayloadIndexes = Object.keys(observation.payloadSchema).filter((field) => !expectedPayload.has(field)).sort();

  let status: QdrantSchemaDriftV1['status'] = 'READY';
  if (representationConfigDrift.length) status = 'CONFIG_DRIFT';
  else if (payloadTypeDrift.length) status = 'TYPE_DRIFT';
  else if (missingRepresentations.length || missingPayloadIndexes.length) status = 'MISSING';
  else if (extraPayloadIndexes.length) status = 'EXTRA';

  return {
    status,
    missingRepresentations: missingRepresentations.sort(),
    representationConfigDrift: representationConfigDrift.sort(),
    missingPayloadIndexes: missingPayloadIndexes.sort(),
    payloadTypeDrift: payloadTypeDrift.sort(),
    extraPayloadIndexes,
    applyAllowed: false,
  };
}

export function qdrantRepresentationIndexPlanDigest(plan = QDRANT_CODEBASE_768_INDEX_PLAN): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
