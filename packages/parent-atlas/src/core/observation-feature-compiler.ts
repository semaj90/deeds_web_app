import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  astGrepObservationSchema,
  groundedLangExtractObservationSchema,
  type AstGrepObservationV1,
  type GroundedLangExtractObservationV1,
} from './structural-symbol.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const OBSERVATION_FEATURE_FAMILIES = [
  'AST_BINARY',
  'ONTOLOGY_BINARY',
  'LANGEXTRACT_BINARY',
  'GRAPH_CONTINUOUS',
  'CLUSTER_CATEGORICAL',
  'CONTEXT_CONTINUOUS',
] as const;

export const observationFeatureDefinitionSchema = z.object({
  feature_id: z.string().regex(/^[a-z0-9_.:-]+$/),
  family: z.enum(OBSERVATION_FEATURE_FAMILIES),
  ordinal: z.number().int().nonnegative(),
  value_kind: z.enum(['BINARY', 'CONTINUOUS', 'CATEGORICAL']),
  description: z.string().min(1),
}).strict();
export type ObservationFeatureDefinitionV1 = z.infer<typeof observationFeatureDefinitionSchema>;

export const observationFeatureRegistrySchema = z.object({
  schema: z.literal('atlas.observation-feature-registry.v1').default('atlas.observation-feature-registry.v1'),
  registry_revision: revision,
  definitions: z.array(observationFeatureDefinitionSchema).min(1).max(4096),
  registry_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const definition of value.definitions) {
    if (ids.has(definition.feature_id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['definitions'], message: `duplicate feature_id ${definition.feature_id}` });
    if (ordinals.has(definition.ordinal)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['definitions'], message: `duplicate ordinal ${definition.ordinal}` });
    ids.add(definition.feature_id);
    ordinals.add(definition.ordinal);
  }
  const sorted = [...ordinals].sort((a, b) => a - b);
  if (sorted.some((ordinal, index) => ordinal !== index)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['definitions'], message: 'feature ordinals must be dense 0..N-1' });
  }
});
export type ObservationFeatureRegistryV1 = z.infer<typeof observationFeatureRegistrySchema>;

export const observationFeatureValueSchema = z.object({
  feature_id: z.string().min(1),
  feature_ordinal: z.number().int().nonnegative(),
  family: z.enum(OBSERVATION_FEATURE_FAMILIES),
  binary_value: z.union([z.literal(0), z.literal(1)]).nullable().default(null),
  continuous_value: z.number().finite().nullable().default(null),
  categorical_value: z.string().min(1).nullable().default(null),
  evidence_refs: z.array(id).min(1),
}).strict().superRefine((value, ctx) => {
  const populated = [value.binary_value !== null, value.continuous_value !== null, value.categorical_value !== null].filter(Boolean).length;
  if (populated !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'feature value must populate exactly one value representation' });
});
export type ObservationFeatureValueV1 = z.infer<typeof observationFeatureValueSchema>;

export const observationFeatureRowSchema = z.object({
  schema: z.literal('atlas.observation-feature-row.v1').default('atlas.observation-feature-row.v1'),
  candidate_id: id,
  row_ordinal: z.number().int().nonnegative(),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  row_identity_checksum: checksum,
  registry_revision: revision,
  ast_features: z.array(observationFeatureValueSchema),
  ontology_features: z.array(observationFeatureValueSchema),
  langextract_features: z.array(observationFeatureValueSchema).default([]),
  graph_features: z.array(observationFeatureValueSchema),
  cluster_features: z.array(observationFeatureValueSchema),
  context_features: z.array(observationFeatureValueSchema),
  qdrant_tags: z.array(z.string().regex(/^[a-z0-9_.:-]+=[^=]+$/)).max(256).default([]),
  observation_refs: z.array(id).min(1),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ObservationFeatureRowV1 = z.infer<typeof observationFeatureRowSchema>;

export const routerFeatureTensorSchema = z.object({
  schema: z.literal('atlas.router-feature-tensor.v1').default('atlas.router-feature-tensor.v1'),
  candidate_id: id,
  row_ordinal: z.number().int().nonnegative(),
  row_identity_checksum: checksum,
  semantic_latent_dimension: z.union([z.literal(64), z.literal(128)]),
  semantic_latent: z.array(z.number().finite()).min(64).max(128),
  exact_binary_feature_ordinals: z.array(z.number().int().nonnegative()).default([]),
  continuous_features: z.array(z.object({ ordinal: z.number().int().nonnegative(), value: z.number().finite() }).strict()).default([]),
  categorical_features: z.array(z.object({ ordinal: z.number().int().nonnegative(), value: z.string().min(1) }).strict()).default([]),
  exact_semantic_promotion_required: z.literal(true).default(true),
  exact_source_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.semantic_latent.length !== value.semantic_latent_dimension) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic_latent'], message: 'semantic latent length must equal declared dimension' });
  }
});
export type RouterFeatureTensorV1 = z.infer<typeof routerFeatureTensorSchema>;

const POSTGRES_INDEXED_ARRAYS = ['ontology_classes', 'ast_observation_kinds', 'langextract_classes'] as const;
const POSTGRES_INDEXED_SCALARS = ['source_id', 'source_revision', 'domain_class', 'kmeans_cluster', 'som_cell'] as const;
const QDRANT_PAYLOAD_INDEXES = [
  'source_id', 'source_revision', 'domain_class', 'ontology_classes', 'language',
  'ast_observation_kinds', 'langextract_classes', 'kmeans_cluster', 'som_cell',
  'document_checksum', 'chunk_checksum', 'tags',
] as const;

export const observationStorageProjectionSchema = z.object({
  schema: z.literal('atlas.observation-storage-projection.v1').default('atlas.observation-storage-projection.v1'),
  projection_revision: revision,
  postgres: z.object({
    identity_owner: z.literal(true),
    store_observations: z.literal(true),
    store_feature_rows: z.literal(true),
    vector_column: z.literal('semantic_768'),
    vector_dimension: z.literal(768),
    vector_index_role: z.literal('FILTERED_EXACT_OR_BOUNDED_ANN'),
    indexed_arrays: z.array(z.enum(POSTGRES_INDEXED_ARRAYS)).default([...POSTGRES_INDEXED_ARRAYS]),
    indexed_scalars: z.array(z.enum(POSTGRES_INDEXED_SCALARS)).default([...POSTGRES_INDEXED_SCALARS]),
  }).strict(),
  qdrant: z.object({
    retrieval_projection_only: z.literal(true),
    collection: z.string().min(1),
    dense_vector: z.literal('semantic_768'),
    sparse_vector: z.literal('lexical_bm25'),
    semantic_lane_votes: z.literal(1),
    payload_indexes: z.array(z.enum(QDRANT_PAYLOAD_INDEXES)),
  }).strict(),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ObservationStorageProjectionV1 = z.infer<typeof observationStorageProjectionSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function observationFeatureChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizeFeatureToken(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');
}

export function buildObservationFeatureRegistry(input: {
  registryRevision: string;
  definitions: Array<Omit<ObservationFeatureDefinitionV1, 'ordinal'>>;
}): ObservationFeatureRegistryV1 {
  const definitions = [...input.definitions]
    .sort((a, b) => a.feature_id.localeCompare(b.feature_id))
    .map((definition, ordinal) => observationFeatureDefinitionSchema.parse({ ...definition, ordinal }));
  return observationFeatureRegistrySchema.parse({
    registry_revision: input.registryRevision,
    definitions,
    registry_checksum: observationFeatureChecksum({ registry_revision: input.registryRevision, definitions }),
    canonical_authority: false,
  });
}

function registryMap(registry: ObservationFeatureRegistryV1): Map<string, ObservationFeatureDefinitionV1> {
  return new Map(registry.definitions.map((definition) => [definition.feature_id, definition]));
}

function binaryFeature(definition: ObservationFeatureDefinitionV1, evidenceRefs: string[]): ObservationFeatureValueV1 {
  if (definition.value_kind !== 'BINARY') throw new Error(`OBSERVATION_FEATURE_NOT_BINARY:${definition.feature_id}`);
  return observationFeatureValueSchema.parse({
    feature_id: definition.feature_id,
    feature_ordinal: definition.ordinal,
    family: definition.family,
    binary_value: 1,
    evidence_refs: [...new Set(evidenceRefs)].sort(),
  });
}

function compileBinaryMap(source: Map<string, string[]>, definitions: Map<string, ObservationFeatureDefinitionV1>): ObservationFeatureValueV1[] {
  return [...source.entries()]
    .map(([featureId, refs]) => {
      const definition = definitions.get(featureId);
      return definition ? binaryFeature(definition, refs) : null;
    })
    .filter((value): value is ObservationFeatureValueV1 => value !== null)
    .sort((a, b) => a.feature_ordinal - b.feature_ordinal);
}

/** Compile exact/grounded observations into discrete feature signals; raw observation JSON is never appended to embedding text. */
export function compileObservationFeatures(input: {
  candidateId: string;
  rowOrdinal: number;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  rowIdentityChecksum: string;
  registry: ObservationFeatureRegistryV1;
  astObservations?: AstGrepObservationV1[];
  langExtractObservations?: GroundedLangExtractObservationV1[];
  ontologyClasses?: string[];
  graph?: { pagerank?: number | null; ppr?: number | null; degree?: number | null };
  cluster?: { kmeansCluster?: number | null; somCell?: string | null; communityId?: string | null };
  context?: { authorityWeight?: number | null; recency?: number | null; validationPassed?: boolean | null };
}): ObservationFeatureRowV1 {
  const registry = observationFeatureRegistrySchema.parse(input.registry);
  const definitions = registryMap(registry);
  const astObservations = (input.astObservations ?? []).map((value) => astGrepObservationSchema.parse(value));
  const langExtractObservations = (input.langExtractObservations ?? []).map((value) => groundedLangExtractObservationSchema.parse(value));
  const observations = [...astObservations, ...langExtractObservations];
  for (const observation of observations) {
    if (observation.source_ref !== input.sourceRef || observation.source_revision !== input.sourceRevision) {
      throw new Error('OBSERVATION_FEATURE_SOURCE_REVISION_MISMATCH');
    }
  }

  const astByFeature = new Map<string, string[]>();
  const ontologyByFeature = new Map<string, string[]>();
  const langExtractByFeature = new Map<string, string[]>();
  const qdrantTags = new Set<string>();
  const allEvidenceRefs = new Set<string>();

  for (const parsed of astObservations) {
    const token = normalizeFeatureToken(parsed.observation_kind);
    const featureId = `ast.${token}`;
    astByFeature.set(featureId, [...(astByFeature.get(featureId) ?? []), parsed.observation_id]);
    allEvidenceRefs.add(parsed.observation_id);
    qdrantTags.add(`ast=${token}`);
    qdrantTags.add(`ast_rule=${normalizeFeatureToken(parsed.rule_id)}`);
  }
  for (const parsed of langExtractObservations) {
    const token = normalizeFeatureToken(parsed.extraction_class);
    const featureId = `langextract.${token}`;
    langExtractByFeature.set(featureId, [...(langExtractByFeature.get(featureId) ?? []), parsed.extraction_id]);
    allEvidenceRefs.add(parsed.extraction_id);
    qdrantTags.add(`langextract=${token}`);
    qdrantTags.add(`alignment=${parsed.alignment_exact ? 'exact' : 'grounded_nonexact'}`);
  }
  for (const ontologyClass of input.ontologyClasses ?? []) {
    const normalized = normalizeFeatureToken(ontologyClass);
    const evidenceRef = `ontology-class:${normalized}`;
    const featureId = `ontology.${normalized}`;
    ontologyByFeature.set(featureId, [...(ontologyByFeature.get(featureId) ?? []), evidenceRef]);
    allEvidenceRefs.add(evidenceRef);
    qdrantTags.add(`ontology=${normalized}`);
  }

  const graphFeatures: ObservationFeatureValueV1[] = [];
  for (const [suffix, raw] of Object.entries({ pagerank: input.graph?.pagerank, ppr: input.graph?.ppr, degree: input.graph?.degree })) {
    if (raw == null) continue;
    const definition = definitions.get(`graph.${suffix}`);
    if (!definition || definition.value_kind !== 'CONTINUOUS') continue;
    const ref = `graph:${suffix}:${input.sourceRevision}`;
    allEvidenceRefs.add(ref);
    graphFeatures.push(observationFeatureValueSchema.parse({ feature_id: definition.feature_id, feature_ordinal: definition.ordinal, family: definition.family, continuous_value: raw, evidence_refs: [ref] }));
  }

  const clusterFeatures: ObservationFeatureValueV1[] = [];
  for (const [suffix, raw] of Object.entries({ kmeans: input.cluster?.kmeansCluster, som: input.cluster?.somCell, community: input.cluster?.communityId })) {
    if (raw == null) continue;
    const definition = definitions.get(`cluster.${suffix}`);
    if (!definition || definition.value_kind !== 'CATEGORICAL') continue;
    const ref = `cluster:${suffix}:${input.sourceRevision}`;
    allEvidenceRefs.add(ref);
    clusterFeatures.push(observationFeatureValueSchema.parse({ feature_id: definition.feature_id, feature_ordinal: definition.ordinal, family: definition.family, categorical_value: String(raw), evidence_refs: [ref] }));
    qdrantTags.add(`${suffix}=${normalizeFeatureToken(String(raw))}`);
  }

  const contextFeatures: ObservationFeatureValueV1[] = [];
  for (const [suffix, raw] of Object.entries({ authority: input.context?.authorityWeight, recency: input.context?.recency })) {
    if (raw == null) continue;
    const definition = definitions.get(`context.${suffix}`);
    if (!definition || definition.value_kind !== 'CONTINUOUS') continue;
    const ref = `context:${suffix}:${input.sourceRevision}`;
    allEvidenceRefs.add(ref);
    contextFeatures.push(observationFeatureValueSchema.parse({ feature_id: definition.feature_id, feature_ordinal: definition.ordinal, family: definition.family, continuous_value: raw, evidence_refs: [ref] }));
  }
  if (input.context?.validationPassed != null) {
    const definition = definitions.get('context.validation_passed');
    if (definition) {
      const ref = `validation:${input.sourceRevision}`;
      allEvidenceRefs.add(ref);
      contextFeatures.push(observationFeatureValueSchema.parse({ feature_id: definition.feature_id, feature_ordinal: definition.ordinal, family: definition.family, binary_value: input.context.validationPassed ? 1 : 0, evidence_refs: [ref] }));
    }
  }

  if (allEvidenceRefs.size === 0) throw new Error('OBSERVATION_FEATURE_ROW_REQUIRES_EVIDENCE');
  const byOrdinal = <T extends ObservationFeatureValueV1>(values: T[]) => values.sort((a, b) => a.feature_ordinal - b.feature_ordinal);
  return observationFeatureRowSchema.parse({
    candidate_id: input.candidateId,
    row_ordinal: input.rowOrdinal,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    workspace_revision: input.workspaceRevision,
    row_identity_checksum: input.rowIdentityChecksum,
    registry_revision: registry.registry_revision,
    ast_features: compileBinaryMap(astByFeature, definitions),
    ontology_features: compileBinaryMap(ontologyByFeature, definitions),
    langextract_features: compileBinaryMap(langExtractByFeature, definitions),
    graph_features: byOrdinal(graphFeatures),
    cluster_features: byOrdinal(clusterFeatures),
    context_features: byOrdinal(contextFeatures),
    qdrant_tags: [...qdrantTags].sort(),
    observation_refs: [...allEvidenceRefs].sort(),
    canonical_authority: false,
  });
}

export function buildRouterFeatureTensor(input: { row: ObservationFeatureRowV1; semanticLatent: number[] }): RouterFeatureTensorV1 {
  const row = observationFeatureRowSchema.parse(input.row);
  const binary = [...row.ast_features, ...row.ontology_features, ...row.langextract_features, ...row.context_features]
    .filter((feature) => feature.binary_value === 1)
    .map((feature) => feature.feature_ordinal)
    .sort((a, b) => a - b);
  const continuous = [...row.graph_features, ...row.context_features]
    .filter((feature) => feature.continuous_value !== null)
    .map((feature) => ({ ordinal: feature.feature_ordinal, value: feature.continuous_value! }))
    .sort((a, b) => a.ordinal - b.ordinal);
  const categorical = row.cluster_features
    .filter((feature) => feature.categorical_value !== null)
    .map((feature) => ({ ordinal: feature.feature_ordinal, value: feature.categorical_value! }))
    .sort((a, b) => a.ordinal - b.ordinal);
  return routerFeatureTensorSchema.parse({
    candidate_id: row.candidate_id,
    row_ordinal: row.row_ordinal,
    row_identity_checksum: row.row_identity_checksum,
    semantic_latent_dimension: input.semanticLatent.length,
    semantic_latent: input.semanticLatent,
    exact_binary_feature_ordinals: binary,
    continuous_features: continuous,
    categorical_features: categorical,
    exact_semantic_promotion_required: true,
    exact_source_promotion_required: true,
    canonical_authority: false,
  });
}

export function describeObservationFeatureCompiler(): string {
  return [
    'ast-grep, LangExtract and ontology observations compile into separate discrete revision-qualified feature families; raw observation JSON is never appended to semantic embedding text.',
    'semantic_768 and latent_128/64 remain separate semantic representations; rare exact binary AST, ontology and grounded LangExtract evidence is preserved outside the autoencoder bottleneck.',
    'PostgreSQL owns exact identity/observation materialization and filtered relational/vector joins; Qdrant is a dense+BM25 retrieval projection with one semantic-family vote.',
    'KMeans, SOM and graph metrics are derived features and payload hints, never collection identity or canonical relationship truth.',
    'Ornith consumes promoted evidence and router outputs through ContextManifest/MCP surfaces; it does not become the persistent embedding or observation identity owner.',
  ].join(' ');
}
