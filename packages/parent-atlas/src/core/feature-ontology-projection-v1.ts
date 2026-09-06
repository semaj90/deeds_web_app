import { z } from 'zod';

const revisionSchema = z.string().min(1);
const canonicalIdSchema = z.string().min(1);
const sourceRefSchema = z.string().min(1);
const confidenceSchema = z.number().finite().min(0).max(1);

export const FEATURE_SURFACE_VALUES = ['WEB', 'MOBILE', 'API', 'WORKER', 'CLI'] as const;
export const FEATURE_KIND_VALUES = [
  'USER_FEATURE',
  'PLATFORM_FEATURE',
  'INTEGRATION',
  'OPERATIONS',
  'SECURITY',
] as const;
export const FEATURE_IMPLEMENTATION_ROLE_VALUES = [
  'ENTRYPOINT',
  'UI',
  'API',
  'DOMAIN_LOGIC',
  'DATA_ACCESS',
  'VALIDATION',
  'AUTHORIZATION',
  'BACKGROUND_JOB',
  'TEST',
  'CONFIG',
] as const;
export const FEATURE_DEPENDENCY_RELATION_VALUES = [
  'USES',
  'REQUIRES',
  'READS',
  'WRITES',
  'EXPOSED_BY',
  'IMPLEMENTED_BY',
  'RUNS_ON',
  'HAS_WORKFLOW',
] as const;

export const featureDefinitionProjectionSchema = z.object({
  schema: z.literal('atlas.feature-definition-projection.v1').default('atlas.feature-definition-projection.v1'),
  feature_id: canonicalIdSchema,
  feature_key: z.string().min(1),
  feature_label: z.string().min(1),
  domain_id: canonicalIdSchema,
  capability_id: canonicalIdSchema,
  kind: z.enum(FEATURE_KIND_VALUES),
  description: z.string().min(1),
  surfaces: z.array(z.enum(FEATURE_SURFACE_VALUES)).min(1),
  dependencies: z.array(canonicalIdSchema).default([]),
  feature_revision: revisionSchema,
  producer_revision: revisionSchema,
  evidence_refs: z.array(canonicalIdSchema).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict();

export const featureImplementationBindingSchema = z.object({
  schema: z.literal('atlas.feature-implementation-binding.v1').default('atlas.feature-implementation-binding.v1'),
  feature_id: canonicalIdSchema,
  source_ref: sourceRefSchema,
  source_revision: revisionSchema,
  symbol_version_id: canonicalIdSchema.nullable().optional(),
  tree_node_id: canonicalIdSchema.nullable().optional(),
  role: z.enum(FEATURE_IMPLEMENTATION_ROLE_VALUES),
  evidence_refs: z.array(canonicalIdSchema).min(1),
  confidence: confidenceSchema,
  binding_revision: revisionSchema,
  canonical_authority: z.literal(false).default(false),
}).strict();

export const featureDependencyEdgeSchema = z.object({
  schema: z.literal('atlas.feature-dependency-edge.v1').default('atlas.feature-dependency-edge.v1'),
  from_feature_id: canonicalIdSchema,
  relation: z.enum(FEATURE_DEPENDENCY_RELATION_VALUES),
  to_entity_type: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  to_entity_id: canonicalIdSchema,
  source_ref: sourceRefSchema,
  source_revision: revisionSchema,
  evidence_refs: z.array(canonicalIdSchema).min(1),
  relationship_revision: revisionSchema,
  producer_revision: revisionSchema,
  canonical_authority: z.literal(false).default(false),
}).strict();

export type FeatureDefinitionProjectionV1 = z.infer<typeof featureDefinitionProjectionSchema>;
export type FeatureImplementationBindingV1 = z.infer<typeof featureImplementationBindingSchema>;
export type FeatureDependencyEdgeV1 = z.infer<typeof featureDependencyEdgeSchema>;

export function buildFeatureDefinitionProjection(
  input: z.input<typeof featureDefinitionProjectionSchema>,
): FeatureDefinitionProjectionV1 {
  return featureDefinitionProjectionSchema.parse(input);
}

export function buildFeatureImplementationBinding(
  input: z.input<typeof featureImplementationBindingSchema>,
): FeatureImplementationBindingV1 {
  return featureImplementationBindingSchema.parse(input);
}

export function buildFeatureDependencyEdge(
  input: z.input<typeof featureDependencyEdgeSchema>,
): FeatureDependencyEdgeV1 {
  return featureDependencyEdgeSchema.parse(input);
}

