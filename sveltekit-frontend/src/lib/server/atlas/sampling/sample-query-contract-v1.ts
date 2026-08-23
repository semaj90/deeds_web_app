import { z } from 'zod';

export const SAMPLE_QUERY_MATRIX_DESCRIPTOR_SCHEMA = 'atlas.sample-query-matrix-descriptor.v1' as const;
export const SAMPLE_QUERY_PLAN_SCHEMA = 'atlas.sample-query-plan.v1' as const;

const revision = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const SampleQueryMatrixRoleSchema = z.enum([
  'SEMANTIC_REFERENCE',
  'CANDIDATE_FEATURE',
  'SEMANTIC_RESIDUAL',
  'LATENT_ROUTING',
]);
export type SampleQueryMatrixRoleV1 = z.infer<typeof SampleQueryMatrixRoleSchema>;

export const SampleQueryNormalizationSchema = z.enum([
  'NONE',
  'COLUMN_STANDARDIZED',
  'ROW_L2',
]);
export type SampleQueryNormalizationV1 = z.infer<typeof SampleQueryNormalizationSchema>;

export const SampleQueryArtifactFormatSchema = z.enum([
  'RAW_F32',
  'NPY',
  'ARROW_IPC',
  'PARQUET',
]);
export type SampleQueryArtifactFormatV1 = z.infer<typeof SampleQueryArtifactFormatSchema>;

export const SampleQueryPolicySchema = z.enum([
  'LENGTH_SQUARED',
  'UNIFORM',
  'TOP_K_ROW_NORM',
]);
export type SampleQueryPolicyV1 = z.infer<typeof SampleQueryPolicySchema>;

export const SampleQueryBackendSchema = z.enum([
  'PYTORCH_CPU',
  'PYTORCH_CUDA',
  'TORCH_CUSTOM_OP_CUDA',
]);
export type SampleQueryBackendV1 = z.infer<typeof SampleQueryBackendSchema>;

export const sampleQueryMatrixDescriptorV1Schema = z.object({
  schema: z.literal(SAMPLE_QUERY_MATRIX_DESCRIPTOR_SCHEMA),
  artifactRef: z.string().min(1),
  artifactFormat: SampleQueryArtifactFormatSchema,
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: sha256,
  workspaceRevision: revision,
  sourceMatrixRevision: revision,
  sourceMatrixChecksum: sha256,
  rowIdentityChecksum: sha256,
  matrixRole: SampleQueryMatrixRoleSchema,
  normalization: SampleQueryNormalizationSchema,
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  dtype: z.literal('float32'),
  byteOrder: z.literal('little'),
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: revision,
}).strict();
export type SampleQueryMatrixDescriptorV1 = z.infer<typeof sampleQueryMatrixDescriptorV1Schema>;

export const sampleQueryPlanV1Schema = z.object({
  schema: z.literal(SAMPLE_QUERY_PLAN_SCHEMA),
  matrixDescriptorChecksum: sha256,
  policy: SampleQueryPolicySchema,
  sampleSize: z.number().int().positive(),
  seeds: z.array(z.number().int().min(0).max(0xffffffff)).min(1),
  preferredBackends: z.array(SampleQueryBackendSchema).min(1),
  requireCuda: z.boolean(),
  lowRank: z.object({
    enabled: z.boolean(),
    targetRank: z.number().int().positive().nullable(),
    oversampling: z.number().int().nonnegative(),
    powerIterations: z.number().int().nonnegative(),
  }).strict(),
  measurementOnly: z.literal(true),
  promotionAuthorized: z.literal(false),
  producerRevision: revision,
}).strict().superRefine((value, ctx) => {
  if (new Set(value.seeds).size !== value.seeds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SAMPLE_QUERY_DUPLICATE_SEED' });
  }
  if (value.requireCuda && !value.preferredBackends.some((backend) => backend !== 'PYTORCH_CPU')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SAMPLE_QUERY_CUDA_REQUIRED_WITHOUT_CUDA_BACKEND' });
  }
  if (value.lowRank.enabled && value.lowRank.targetRank === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SAMPLE_QUERY_LOW_RANK_TARGET_REQUIRED' });
  }
  if (!value.lowRank.enabled && value.lowRank.targetRank !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SAMPLE_QUERY_LOW_RANK_TARGET_FORBIDDEN_WHEN_DISABLED' });
  }
});
export type SampleQueryPlanV1 = z.infer<typeof sampleQueryPlanV1Schema>;
