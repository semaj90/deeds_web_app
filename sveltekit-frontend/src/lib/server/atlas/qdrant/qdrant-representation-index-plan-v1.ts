import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QDRANT_REPRESENTATION_INDEX_PLAN_SCHEMA = 'atlas.qdrant-representation-index-plan.v1' as const;
export const QDRANT_REPRESENTATION_INDEX_PLAN_REVISION = 'atlas.qdrant-representation-index-plan.2026-08-21.v2' as const;

export const QdrantRepresentationRoleSchema = z.enum([
  'DENSE_SEMANTIC',
  'DENSE_DIAGNOSTIC',
  'DENSE_SIGNATURE',
  'DENSE_DERIVED_MRL',
  'SPARSE_LEXICAL',
  'SPARSE_CONTEXTUAL_LEXICAL',
  'SPARSE_EXPANSION',
]);

export const QdrantRepresentationPlanV1Schema = z.object({
  name: z.string().min(1),
  logicalRepresentation: z.string().min(1),
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
  requiredForReady: z.boolean(),
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
  requiredForReady: z.boolean(),
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
  modelProvenanceRequiredBeforePromotion: z.literal(true),
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
    { name: 'content', logicalRepresentation: 'semantic_768', role: 'DENSE_SEMANTIC', storage: 'DENSE_VECTOR', dimensions: 768, distance: 'Cosine', modifier: null, modelFamily: 'UNPROVEN_HISTORICAL_MODEL', representationRevision: 'semantic_768.historical-proven-shape.model-unproven.v1', derivedFrom: null, activeByDefault: true, challengerOnly: false, requiredForReady: true, evidenceAuthority: false },
    { name: 'error', logicalRepresentation: 'diagnostic_768', role: 'DENSE_DIAGNOSTIC', storage: 'DENSE_VECTOR', dimensions: 768, distance: 'Cosine', modifier: null, modelFamily: 'UNPROVEN_HISTORICAL_MODEL', representationRevision: 'diagnostic_768.historical-proven-shape.model-unproven.v1', derivedFrom: null, activeByDefault: false, challengerOnly: false, requiredForReady: true, evidenceAuthority: false },
    { name: 'signature', logicalRepresentation: 'signature_768', role: 'DENSE_SIGNATURE', storage: 'DENSE_VECTOR', dimensions: 768, distance: 'Cosine', modifier: null, modelFamily: 'UNPROVEN_HISTORICAL_MODEL', representationRevision: 'signature_768.historical-proven-shape.model-unproven.v1', derivedFrom: null, activeByDefault: false, challengerOnly: false, requiredForReady: true, evidenceAuthority: false },
    { name: 'semantic_mrl_512', logicalRepresentation: 'semantic_mrl_512', role: 'DENSE_DERIVED_MRL', storage: 'DENSE_VECTOR', dimensions: 512, distance: 'Cosine', modifier: null, modelFamily: 'google/embeddinggemma-300m', representationRevision: 'semantic_mrl_512.prefix-l2.v1', derivedFrom: 'content', activeByDefault: false, challengerOnly: true, requiredForReady: false, evidenceAuthority: false },
    { name: 'bm25', logicalRepresentation: 'bm25', role: 'SPARSE_LEXICAL', storage: 'SPARSE_VECTOR', dimensions: null, distance: null, modifier: 'idf', modelFamily: 'qdrant/bm25', representationRevision: 'bm25.qdrant.idf.v1', derivedFrom: null, activeByDefault: false, challengerOnly: true, requiredForReady: true, evidenceAuthority: false },
    { name: 'minicoil', logicalRepresentation: 'minicoil', role: 'SPARSE_CONTEXTUAL_LEXICAL', storage: 'SPARSE_VECTOR', dimensions: null, distance: null, modifier: 'idf', modelFamily: 'Qdrant/minicoil-v1', representationRevision: 'minicoil.qdrant.idf.v1', derivedFrom: null, activeByDefault: false, challengerOnly: true, requiredForReady: false, evidenceAuthority: false },
    { name: 'splade', logicalRepresentation: 'splade', role: 'SPARSE_EXPANSION', storage: 'SPARSE_VECTOR', dimensions: null, distance: null, modifier: null, modelFamily: 'UNBOUND_SPLADE_MODEL', representationRevision: 'splade.unbound-model.v1', derivedFrom: null, activeByDefault: false, challengerOnly: true, requiredForReady: false, evidenceAuthority: false },
  ],
  payloadIndexes: [
    { fieldName: 'canonical_id', fieldSchema: 'keyword', purpose: 'canonical candidate projection lookup', requiredForCanonicalFilter: true, indexByDefault: true, requiredForReady: true },
    { fieldName: 'packet_key', fieldSchema: 'keyword', purpose: 'packet projection lookup', requiredForCanonicalFilter: true, indexByDefault: true, requiredForReady: true },
    { fieldName: 'workspace_revision', fieldSchema: 'keyword', purpose: 'workspace revision qualification', requiredForCanonicalFilter: true, indexByDefault: true, requiredForReady: false },
    { fieldName: 'source_revision', fieldSchema: 'keyword', purpose: 'source revision qualification', requiredForCanonicalFilter: true, indexByDefault: true, requiredForReady: false },
    { fieldName: 'domain_class', fieldSchema: 'keyword', purpose: 'domain restriction', requiredForCanonicalFilter: false, indexByDefault: true, requiredForReady: false },
    { fieldName: 'node_kind', fieldSchema: 'keyword', purpose: 'AST/node restriction', requiredForCanonicalFilter: false, indexByDefault: true, requiredForReady: false },
    { fieldName: 'document_id', fieldSchema: 'keyword', purpose: 'document-scoped retrieval', requiredForCanonicalFilter: false, indexByDefault: true, requiredForReady: false },
    { fieldName: 'evidence_kind', fieldSchema: 'keyword', purpose: 'evidence-kind restriction', requiredForCanonicalFilter: false, indexByDefault: true, requiredForReady: false },
  ],
  forbiddenPayloadIndexPatterns: ['semantic_*', '*_score', '*_similarity', 'pagerank', 'personalized_pagerank', 'execution_utility', 'memory_utility', 'som_*', 'kmeans_*', 'cross_encoder_*'],
  modelProvenanceRequiredBeforePromotion: true,
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
  missingRequiredRepresentations: string[];
  missingOptionalRepresentations: string[];
  representationConfigDrift: string[];
  missingRequiredPayloadIndexes: string[];
  missingOptionalPayloadIndexes: string[];
  payloadTypeDrift: string[];
  extraPayloadIndexes: string[];
  applyAllowed: false;
}

export function compareQdrantSchemaToPlan(observation: QdrantSchemaObservationV1, plan = QDRANT_CODEBASE_768_INDEX_PLAN): QdrantSchemaDriftV1 {
  const missingRequiredRepresentations: string[] = [];
  const missingOptionalRepresentations: string[] = [];
  const representationConfigDrift: string[] = [];
  for (const representation of plan.representations) {
    const observed = representation.storage === 'DENSE_VECTOR'
      ? observation.denseVectors[representation.name]
      : observation.sparseVectors[representation.name];
    if (!observed) {
      (representation.requiredForReady ? missingRequiredRepresentations : missingOptionalRepresentations).push(representation.name);
      continue;
    }
    if (representation.storage === 'DENSE_VECTOR') {
      const dense = observed as { size: number; distance: string };
      if (dense.size !== representation.dimensions || dense.distance.toLowerCase() !== representation.distance?.toLowerCase()) representationConfigDrift.push(representation.name);
    } else {
      const sparse = observed as { modifier: string | null };
      if ((sparse.modifier ?? null)?.toLowerCase() !== (representation.modifier ?? null)?.toLowerCase()) representationConfigDrift.push(representation.name);
    }
  }

  const missingRequiredPayloadIndexes: string[] = [];
  const missingOptionalPayloadIndexes: string[] = [];
  const payloadTypeDrift: string[] = [];
  const plannedFields = new Set<string>();
  for (const field of plan.payloadIndexes.filter((entry) => entry.indexByDefault)) {
    plannedFields.add(field.fieldName);
    const observed = observation.payloadSchema[field.fieldName];
    if (!observed) {
      (field.requiredForReady ? missingRequiredPayloadIndexes : missingOptionalPayloadIndexes).push(field.fieldName);
    } else if (observed.toLowerCase() !== field.fieldSchema.toLowerCase()) {
      payloadTypeDrift.push(field.fieldName);
    }
  }
  const extraPayloadIndexes = Object.keys(observation.payloadSchema).filter((field) => !plannedFields.has(field)).sort();

  let status: QdrantSchemaDriftV1['status'] = 'READY';
  if (representationConfigDrift.length) status = 'CONFIG_DRIFT';
  else if (payloadTypeDrift.length) status = 'TYPE_DRIFT';
  else if (missingRequiredRepresentations.length || missingRequiredPayloadIndexes.length) status = 'MISSING';
  else if (extraPayloadIndexes.length) status = 'EXTRA';

  return {
    status,
    missingRequiredRepresentations: missingRequiredRepresentations.sort(),
    missingOptionalRepresentations: missingOptionalRepresentations.sort(),
    representationConfigDrift: representationConfigDrift.sort(),
    missingRequiredPayloadIndexes: missingRequiredPayloadIndexes.sort(),
    missingOptionalPayloadIndexes: missingOptionalPayloadIndexes.sort(),
    payloadTypeDrift: payloadTypeDrift.sort(),
    extraPayloadIndexes,
    applyAllowed: false,
  };
}

export function qdrantRepresentationIndexPlanDigest(plan = QDRANT_CODEBASE_768_INDEX_PLAN): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
