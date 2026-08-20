import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ONTOLOGY_COLLECTION_KINDS = [
  'RDF_LIST',
  'RDF_SEQ',
  'ROLE_MAP',
  'NARY_RELATION',
] as const;

export const ontologyCollectionProjectionSchema = z.object({
  schema: z.literal('atlas.ontology-collection-projection.v1').default('atlas.ontology-collection-projection.v1'),
  collection_id: id,
  collection_revision: revision,
  kind: z.enum(ONTOLOGY_COLLECTION_KINDS),
  source_ref: z.string().min(1),
  source_revision: revision,
  relationship_id: id.nullable().default(null),
  member_ids: z.array(id).min(1).max(4096),
  member_roles: z.array(z.string().min(1)).max(4096).default([]),
  ordered: z.boolean(),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (['RDF_LIST', 'RDF_SEQ'].includes(value.kind) && !value.ordered) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ordered'], message: `${value.kind} must preserve member order` });
  }
  if (value.kind === 'ROLE_MAP') {
    if (value.member_roles.length !== value.member_ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['member_roles'], message: 'ROLE_MAP requires one role per member' });
    }
    if (new Set(value.member_roles).size !== value.member_roles.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['member_roles'], message: 'ROLE_MAP roles must be unique' });
    }
  }
  if (value.kind === 'NARY_RELATION' && value.relationship_id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationship_id'], message: 'NARY_RELATION requires relationship_id' });
  }
});
export type OntologyCollectionProjectionV1 = z.infer<typeof ontologyCollectionProjectionSchema>;

export const DERIVED_FEATURE_RECIPE_KINDS = [
  'KNN_EXACT',
  'KNN_ANN',
  'PAGERANK',
  'PPR',
  'NODE2VEC',
  'KMEANS',
  'SOM',
  'RANDOM_FOREST',
  'POLYNOMIAL_INTERACTION',
  'SPARSE_BINARY',
  'RIEMANNIAN_TOPOLOGY',
] as const;

export const DERIVED_FEATURE_EXECUTORS = [
  'CPU_REFERENCE',
  'NETWORKX',
  'PYTORCH',
  'CUVS',
  'CUGRAPH',
  'CUML',
  'CUTILE',
  'CUSTOM_NATIVE',
] as const;

export const derivedFeatureRecipeSchema = z.object({
  schema: z.literal('atlas.derived-feature-recipe.v1').default('atlas.derived-feature-recipe.v1'),
  recipe_id: id,
  recipe_revision: revision,
  kind: z.enum(DERIVED_FEATURE_RECIPE_KINDS),
  executor: z.enum(DERIVED_FEATURE_EXECUTORS),
  row_identity_checksum: checksum,
  source_snapshot_revisions: z.array(revision).min(1).max(64),
  input_artifact_ids: z.array(id).min(1).max(64),
  output_artifact_id: id,
  random_seed: z.number().int().nonnegative().nullable().default(null),
  parameters: z.record(z.string(), z.unknown()).default({}),
  deterministic_required: z.boolean().default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (['NODE2VEC', 'KMEANS', 'SOM', 'RANDOM_FOREST'].includes(value.kind) && value.deterministic_required && value.random_seed === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['random_seed'], message: `${value.kind} requires a recorded seed when deterministic_required=true` });
  }
  if (value.kind === 'NODE2VEC' && !['CUGRAPH', 'CPU_REFERENCE'].includes(value.executor)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executor'], message: 'NODE2VEC reference is admitted through cuGraph or a CPU oracle' });
  }
  if (value.kind === 'RANDOM_FOREST' && !['CUML', 'CPU_REFERENCE'].includes(value.executor)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executor'], message: 'RANDOM_FOREST is admitted through cuML or a CPU oracle' });
  }
  if (['KNN_EXACT', 'KNN_ANN', 'KMEANS'].includes(value.kind) && !['CUVS', 'PYTORCH', 'CPU_REFERENCE'].includes(value.executor)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executor'], message: `${value.kind} executor must preserve the vector/cluster contract` });
  }
});
export type DerivedFeatureRecipeV1 = z.infer<typeof derivedFeatureRecipeSchema>;

export const featurePlaneSchema = z.object({
  schema: z.literal('atlas.feature-plane.v1').default('atlas.feature-plane.v1'),
  plane_id: id,
  plane_revision: revision,
  row_identity_checksum: checksum,
  row_count: z.number().int().nonnegative(),
  dimensions: z.number().int().positive(),
  layout: z.enum(['DENSE', 'CSR', 'COO', 'BSR', 'BITPACKED']),
  dtype: z.enum(['float32', 'float16', 'bfloat16', 'uint8', 'int32', 'int64']),
  semantics: z.enum(['CONTINUOUS', 'PROBABILITY', 'BINARY_01', 'COORDINATE', 'EMBEDDING']),
  logical_checksum: checksum,
  transport_checksum: checksum.nullable().default(null),
  bit_order: z.enum(['LITTLE', 'BIG']).nullable().default(null),
  source_snapshot_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.layout === 'BITPACKED') {
    if (value.dtype !== 'uint8' || value.semantics !== 'BINARY_01' || value.bit_order === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['layout'], message: 'BITPACKED planes require uint8 + BINARY_01 + explicit bit_order' });
    }
  } else if (value.bit_order !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bit_order'], message: 'bit_order is only meaningful for BITPACKED planes' });
  }
});
export type FeaturePlaneV1 = z.infer<typeof featurePlaneSchema>;

export const riemannianTopologyProjectionSchema = z.object({
  schema: z.literal('atlas.riemannian-topology-projection.v1').default('atlas.riemannian-topology-projection.v1'),
  topology_id: id,
  topology_revision: revision,
  source_snapshot_revision: revision,
  row_identity_checksum: checksum,
  manifold: z.enum(['EUCLIDEAN_R4', 'SPHERE_S3', 'PRODUCT_MANIFOLD', 'CUSTOM']),
  ambient_dimension: z.number().int().positive(),
  intrinsic_dimension: z.number().int().positive(),
  coordinate_checksum: checksum,
  metric_revision: revision,
  mutation_semantics: z.literal('IMMUTABLE_SNAPSHOT_NEW_REVISION_ON_CHANGE').default('IMMUTABLE_SNAPSHOT_NEW_REVISION_ON_CHANGE'),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.manifold === 'EUCLIDEAN_R4' && (value.ambient_dimension !== 4 || value.intrinsic_dimension !== 4)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ambient_dimension'], message: 'EUCLIDEAN_R4 requires ambient=intrinsic=4' });
  }
  if (value.manifold === 'SPHERE_S3' && (value.ambient_dimension !== 4 || value.intrinsic_dimension !== 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ambient_dimension'], message: 'SPHERE_S3 is a 3D manifold embedded in R4' });
  }
});
export type RiemannianTopologyProjectionV1 = z.infer<typeof riemannianTopologyProjectionSchema>;

export const hydratedEvidenceRefSchema = z.object({
  hydration_id: id,
  artifact_id: id,
  artifact_revision: revision,
  artifact_checksum: checksum,
  kind: z.enum(['SOURCE_SPAN', 'SEMANTIC_ROW', 'RDF_GRAPH', 'FEATURE_PLANE', 'NARY_RELATION', 'MODEL_STATE', 'TOOL_SCHEMA']),
  canonical_id: id.nullable().default(null),
  relationship_id: id.nullable().default(null),
  source_ref: z.string().min(1).nullable().default(null),
  source_revision: revision.nullable().default(null),
  tree_node_id: id.nullable().default(null),
  byte_start: z.number().int().nonnegative().nullable().default(null),
  byte_end: z.number().int().positive().nullable().default(null),
  immutable: z.literal(true).default(true),
}).strict().superRefine((value, ctx) => {
  if ((value.source_ref === null) !== (value.source_revision === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source_ref'], message: 'source_ref/source_revision must be present together' });
  }
  if ((value.byte_start === null) !== (value.byte_end === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_start'], message: 'source byte span must be fully present or absent' });
  }
  if (value.byte_start !== null && value.byte_end !== null && value.byte_end <= value.byte_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['byte_end'], message: 'byte_end must exceed byte_start' });
  }
});
export type HydratedEvidenceRefV1 = z.infer<typeof hydratedEvidenceRefSchema>;

export const hydrationManifestSchema = z.object({
  schema: z.literal('atlas.hydration-manifest.v1').default('atlas.hydration-manifest.v1'),
  hydration_revision: revision,
  request_id: id,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  refs: z.array(hydratedEvidenceRefSchema).max(8192),
  total_bytes: z.number().int().nonnegative(),
  producer_revision: revision,
  manifest_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const ids = value.refs.map((item) => item.hydration_id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['refs'], message: 'hydration_id must be unique' });
  }
});
export type HydrationManifestV1 = z.infer<typeof hydrationManifestSchema>;

export const instructionAtomSchema = z.object({
  instruction_id: id,
  instruction_revision: revision,
  category: z.enum(['USER_TASK', 'EVIDENCE_POLICY', 'RETRIEVAL_POLICY', 'TOOL_POLICY', 'MUTATION_POLICY', 'OUTPUT_CONSTRAINT', 'STYLE']),
  text: z.string().min(1),
  normalized_text_checksum: checksum,
  priority: z.number().int().nonnegative(),
  repeat_policy: z.enum(['ALWAYS', 'ONCE_PER_PREFILL', 'ON_CHANGE']),
  dependency_checksums: z.array(checksum).default([]),
  source_ref: z.string().min(1).nullable().default(null),
  source_revision: revision.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if ((value.source_ref === null) !== (value.source_revision === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source_ref'], message: 'instruction source_ref/source_revision must be present together' });
  }
});
export type InstructionAtomV1 = z.infer<typeof instructionAtomSchema>;

export const contextFragmentSchema = z.object({
  fragment_id: id,
  kind: z.enum(['INSTRUCTION', 'EVIDENCE', 'SUMMARY', 'TOOL_SCHEMA', 'FEATURE_SUMMARY']),
  logical_checksum: checksum,
  source_ref: z.string().min(1).nullable().default(null),
  source_revision: revision.nullable().default(null),
  tree_node_id: id.nullable().default(null),
  token_estimate: z.number().int().nonnegative(),
  repeat_policy: z.enum(['ALLOW_DUPLICATE', 'DEDUP_EXACT', 'DEDUP_SOURCE_COORDINATE']),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ContextFragmentV1 = z.infer<typeof contextFragmentSchema>;

export const compiledInstructionSetSchema = z.object({
  schema: z.literal('atlas.compiled-instruction-set.v1').default('atlas.compiled-instruction-set.v1'),
  compiler_revision: revision,
  atoms: z.array(instructionAtomSchema).min(1).max(4096),
  instruction_set_checksum: checksum,
  dropped_duplicate_instruction_ids: z.array(id).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type CompiledInstructionSetV1 = z.infer<typeof compiledInstructionSetSchema>;

export const prefillSynthesisCacheEntrySchema = z.object({
  schema: z.literal('atlas.prefill-synthesis-cache-entry.v1').default('atlas.prefill-synthesis-cache-entry.v1'),
  cache_key: checksum,
  prefill_identity_checksum: checksum,
  instruction_set_checksum: checksum,
  hydration_manifest_checksum: checksum,
  feature_alignment_checksum: checksum,
  context_manifest_checksum: checksum,
  compiler_revision: revision,
  compiled_prefill_artifact_id: id,
  compiled_prefill_checksum: checksum,
  status: z.enum(['VALID', 'STALE', 'REVOKED']),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type PrefillSynthesisCacheEntryV1 = z.infer<typeof prefillSynthesisCacheEntrySchema>;

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

export function contextualFabricChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function normalizeInstructionText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function buildInstructionAtom(input: Omit<z.input<typeof instructionAtomSchema>, 'normalized_text_checksum' | 'canonical_authority'>): InstructionAtomV1 {
  return instructionAtomSchema.parse({
    ...input,
    normalized_text_checksum: contextualFabricChecksum(normalizeInstructionText(input.text)),
    canonical_authority: false,
  });
}

export function compileInstructionSet(atoms: readonly InstructionAtomV1[], compilerRevision: string): CompiledInstructionSetV1 {
  const sorted = [...atoms].sort((left, right) => left.priority - right.priority || left.instruction_id.localeCompare(right.instruction_id));
  const kept: InstructionAtomV1[] = [];
  const dropped: string[] = [];
  const exact = new Set<string>();
  for (const atom of sorted) {
    if (exact.has(atom.normalized_text_checksum)) {
      dropped.push(atom.instruction_id);
      continue;
    }
    exact.add(atom.normalized_text_checksum);
    kept.push(atom);
  }
  const instruction_set_checksum = contextualFabricChecksum({
    compiler_revision: compilerRevision,
    atoms: kept.map((atom) => ({
      instruction_id: atom.instruction_id,
      instruction_revision: atom.instruction_revision,
      normalized_text_checksum: atom.normalized_text_checksum,
      priority: atom.priority,
      repeat_policy: atom.repeat_policy,
      dependency_checksums: [...atom.dependency_checksums].sort(),
    })),
  });
  return compiledInstructionSetSchema.parse({
    compiler_revision: compilerRevision,
    atoms: kept,
    instruction_set_checksum,
    dropped_duplicate_instruction_ids: dropped,
    canonical_authority: false,
  });
}

export function deduplicateContextFragments(fragments: readonly ContextFragmentV1[]): ContextFragmentV1[] {
  const exact = new Set<string>();
  const sourceCoordinates = new Set<string>();
  const result: ContextFragmentV1[] = [];
  for (const fragment of fragments) {
    if (fragment.repeat_policy === 'ALLOW_DUPLICATE') {
      result.push(fragment);
      continue;
    }
    if (fragment.repeat_policy === 'DEDUP_EXACT') {
      if (exact.has(fragment.logical_checksum)) continue;
      exact.add(fragment.logical_checksum);
      result.push(fragment);
      continue;
    }
    const coordinate = contextualFabricChecksum({
      source_ref: fragment.source_ref,
      source_revision: fragment.source_revision,
      tree_node_id: fragment.tree_node_id,
      logical_checksum: fragment.logical_checksum,
    });
    if (sourceCoordinates.has(coordinate)) continue;
    sourceCoordinates.add(coordinate);
    result.push(fragment);
  }
  return result;
}

export function buildHydrationManifest(input: Omit<z.input<typeof hydrationManifestSchema>, 'schema' | 'manifest_checksum' | 'canonical_authority'>): HydrationManifestV1 {
  const raw = { schema: 'atlas.hydration-manifest.v1' as const, ...input, canonical_authority: false as const };
  const manifest_checksum = contextualFabricChecksum({ ...raw, manifest_checksum: undefined });
  return hydrationManifestSchema.parse({ ...raw, manifest_checksum });
}

export function prefillCacheKey(input: {
  prefill_identity_checksum: string;
  instruction_set_checksum: string;
  hydration_manifest_checksum: string;
  feature_alignment_checksum: string;
  context_manifest_checksum: string;
  compiler_revision: string;
}): string {
  return contextualFabricChecksum(input);
}

export function buildPrefillCacheEntry(input: Omit<z.input<typeof prefillSynthesisCacheEntrySchema>, 'schema' | 'cache_key' | 'canonical_authority'>): PrefillSynthesisCacheEntryV1 {
  const cache_key = prefillCacheKey({
    prefill_identity_checksum: input.prefill_identity_checksum,
    instruction_set_checksum: input.instruction_set_checksum,
    hydration_manifest_checksum: input.hydration_manifest_checksum,
    feature_alignment_checksum: input.feature_alignment_checksum,
    context_manifest_checksum: input.context_manifest_checksum,
    compiler_revision: input.compiler_revision,
  });
  return prefillSynthesisCacheEntrySchema.parse({
    schema: 'atlas.prefill-synthesis-cache-entry.v1',
    ...input,
    cache_key,
    canonical_authority: false,
  });
}

export function canReusePrefillCache(entry: PrefillSynthesisCacheEntryV1, input: Parameters<typeof prefillCacheKey>[0]): boolean {
  return entry.status === 'VALID' && entry.cache_key === prefillCacheKey(input);
}

export function describeContextualPrefillFabric(): string {
  return [
    'RDF lists/sequences preserve ordering; role maps and N-ary relations preserve participant roles instead of flattening semantic structure into generic dictionaries.',
    'KNN, PageRank/PPR, Node2Vec, KMeans, SOM, Random Forest, polynomial interactions, sparse binary masks and Riemannian coordinates are derived feature recipes aligned by one row-identity checksum.',
    'Sparse/bit-packed planes are physical encodings only; exact 0/1 support survives packing and transport bytes never define semantic identity.',
    'Hydration loads immutable source, tensor, RDF and relation artifacts by revision. A changed source or feature plane creates a new hydration/prefill identity rather than mutating the old snapshot.',
    'The prefill cache deduplicates exact repeated instructions and repeated source coordinates, then keys reuse by prefill identity + instruction set + hydration + feature/context checksums. This is the deterministic do-not-repeat-yourself boundary.',
  ].join(' ');
}
