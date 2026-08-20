import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const FILE_MUTATION_OPERATIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;

export const fileMutationTargetSchema = z.object({
  mutation_id: id,
  operation: z.enum(FILE_MUTATION_OPERATIONS),
  repository_relative_path: z.string().min(1),
  expected_before_checksum_sha256: checksum.nullable(),
  expected_after_checksum_sha256: checksum.nullable(),
  source_revision: revision.nullable(),
  patch_artifact_id: id.nullable(),
  evidence_refs: z.array(id).min(1).max(256),
  canonical_ids: z.array(id).max(256).default([]),
  exact_promotion_receipt_id: id,
}).strict().superRefine((value, ctx) => {
  if (value.repository_relative_path.startsWith('/') || value.repository_relative_path.includes('..')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repository_relative_path'], message: 'mutation paths must be repository-relative and traversal-free' });
  }
  if (value.operation === 'CREATE') {
    if (value.expected_before_checksum_sha256 !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_before_checksum_sha256'], message: 'CREATE requires no prior file checksum' });
    }
    if (!value.expected_after_checksum_sha256 || !value.patch_artifact_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_after_checksum_sha256'], message: 'CREATE requires intended output checksum and patch artifact' });
    }
  }
  if (value.operation === 'UPDATE') {
    if (!value.expected_before_checksum_sha256 || !value.expected_after_checksum_sha256 || !value.patch_artifact_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_before_checksum_sha256'], message: 'UPDATE requires before checksum, after checksum and patch artifact' });
    }
  }
  if (value.operation === 'DELETE') {
    if (!value.expected_before_checksum_sha256) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_before_checksum_sha256'], message: 'DELETE requires the expected current file checksum' });
    }
    if (value.expected_after_checksum_sha256 !== null || value.patch_artifact_id !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_after_checksum_sha256'], message: 'DELETE has no output checksum or patch payload' });
    }
  }
});

export const agenticFileMutationPlanSchema = z.object({
  schema: z.literal('atlas.agentic-file-mutation-plan.v1').default('atlas.agentic-file-mutation-plan.v1'),
  plan_id: id,
  plan_revision: revision,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  workspace_revision: revision,
  source_snapshot_revision: revision,
  mutations: z.array(fileMutationTargetSchema).min(1).max(512),
  maximum_total_patch_bytes: z.number().int().positive(),
  total_patch_bytes: z.number().int().nonnegative(),
  validator_ids: z.array(id).min(1).max(64),
  rollback_required: z.literal(true).default(true),
  canonical_writes_allowed: z.boolean(),
  producer_revision: revision,
  plan_checksum_sha256: checksum,
}).strict().superRefine((value, ctx) => {
  const paths = new Set<string>();
  const mutationIds = new Set<string>();
  for (const [index, mutation] of value.mutations.entries()) {
    if (paths.has(mutation.repository_relative_path)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mutations', index, 'repository_relative_path'], message: 'one mutation plan may touch a path only once' });
    }
    paths.add(mutation.repository_relative_path);
    if (mutationIds.has(mutation.mutation_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mutations', index, 'mutation_id'], message: 'mutation_id must be unique' });
    }
    mutationIds.add(mutation.mutation_id);
  }
  if (value.total_patch_bytes > value.maximum_total_patch_bytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['total_patch_bytes'], message: 'mutation plan exceeds bounded patch-byte envelope' });
  }
  if (!value.canonical_writes_allowed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonical_writes_allowed'], message: 'mutation plan cannot be executable while canonical writes are disabled' });
  }
});

export const fileValidationFailureSchema = z.object({
  schema: z.literal('atlas.file-validation-failure.v1').default('atlas.file-validation-failure.v1'),
  failure_id: id,
  plan_id: id,
  mutation_ids: z.array(id).min(1),
  validator_id: id,
  validator_revision: revision,
  failure_kind: z.enum(['TYPECHECK', 'UNIT_TEST', 'INTEGRATION_TEST', 'LINT', 'FORMAT', 'BUILD', 'RUNTIME_PROBE', 'LINEAGE', 'CHECKSUM_MISMATCH']),
  evidence_refs: z.array(id).min(1),
  diagnostic_artifact_id: id.nullable().optional(),
  retryable: z.boolean(),
  producer_revision: revision,
}).strict();

export const fileRepairAttemptSchema = z.object({
  schema: z.literal('atlas.file-repair-attempt.v1').default('atlas.file-repair-attempt.v1'),
  repair_id: id,
  repair_revision: revision,
  prior_plan_id: id,
  failure_ids: z.array(id).min(1),
  replacement_plan_id: id,
  attempt: z.number().int().positive().max(16),
  exact_evidence_reused: z.boolean(),
  new_evidence_refs: z.array(id).default([]),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();

export type FileMutationTargetV1 = z.infer<typeof fileMutationTargetSchema>;
export type AgenticFileMutationPlanV1 = z.infer<typeof agenticFileMutationPlanSchema>;
export type FileValidationFailureV1 = z.infer<typeof fileValidationFailureSchema>;
export type FileRepairAttemptV1 = z.infer<typeof fileRepairAttemptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildAgenticFileMutationPlan(input: Omit<z.input<typeof agenticFileMutationPlanSchema>, 'schema' | 'plan_checksum_sha256'>): AgenticFileMutationPlanV1 {
  const raw = { schema: 'atlas.agentic-file-mutation-plan.v1' as const, ...input };
  return agenticFileMutationPlanSchema.parse({ ...raw, plan_checksum_sha256: sha256(raw) });
}

export function describeAgenticFileMutationContract(): string {
  return [
    'CREATE, UPDATE and DELETE are explicit file operations with repository-relative paths and checksum preconditions.',
    'UPDATE/DELETE use the expected prior content checksum as a stale-write guard; CREATE proves path absence instead of inventing a before checksum.',
    'Every file mutation cites exact-promotion evidence and at least one validator; mutation plans remain bounded by file count and patch bytes.',
    'A repair attempt is derived from validator failure evidence and points to a replacement plan; repair reasoning never becomes canonical evidence by itself.',
  ].join(' ');
}
