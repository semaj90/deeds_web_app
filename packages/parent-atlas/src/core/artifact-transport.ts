import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ARTIFACT_CONTENT_FORMATS = [
  'JSON_CANONICAL_CONTROL',
  'ARROW_IPC_FILE',
  'ARROW_IPC_STREAM',
  'MSGPACK_ENVELOPE',
  'RAW_BINARY',
] as const;

export const ARTIFACT_ACCESS_MODES = [
  'INLINE',
  'FILE_READ',
  'MMAP_READONLY',
  'STREAM',
  'SHARED_MEMORY',
] as const;

export const ARTIFACT_ROLES = [
  'CONTROL_GRAPH',
  'SEMANTIC_SNAPSHOT',
  'FEATURE_SIGNAL_BLOCK',
  'NARY_INCIDENCE',
  'ORDERED_CONTEXT',
  'PREFILL_PLAN',
  'DECODE_TRACE',
  'WORKFLOW_EVENT',
  'PATCH',
  'VALIDATION_RECEIPT',
  'OTHER',
] as const;

export const artifactTransportRefSchema = z.object({
  schema: z.literal('atlas.artifact-transport-ref.v1').default('atlas.artifact-transport-ref.v1'),
  artifact_id: id,
  artifact_revision: revision,
  role: z.enum(ARTIFACT_ROLES),
  content_format: z.enum(ARTIFACT_CONTENT_FORMATS),
  access_mode: z.enum(ARTIFACT_ACCESS_MODES),
  storage_ref: z.string().min(1),
  byte_length: z.number().int().nonnegative(),
  /** Checksum of the logical artifact payload used by Atlas lineage. */
  content_checksum_sha256: checksum,
  /** Optional checksum of the encoded transport bytes. Never substitutes for logical identity. */
  transport_checksum_sha256: checksum.nullable().optional(),
  row_identity_checksum: checksum.nullable().optional(),
  source_snapshot_revision: revision.nullable().optional(),
  canonical_authority: z.literal(false).default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.access_mode === 'MMAP_READONLY' && !['ARROW_IPC_FILE', 'RAW_BINARY'].includes(value.content_format)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['access_mode'],
      message: 'MMAP_READONLY is valid only for random-access file/binary artifacts, not stream/envelope formats',
    });
  }
  if (value.content_format === 'ARROW_IPC_STREAM' && value.access_mode !== 'STREAM') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['access_mode'],
      message: 'ARROW_IPC_STREAM is sequential and must use STREAM access',
    });
  }
  if (value.content_format === 'MSGPACK_ENVELOPE' && value.access_mode === 'MMAP_READONLY') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['access_mode'],
      message: 'MessagePack envelopes are transport objects, not mmap snapshot identity',
    });
  }
  if (['SEMANTIC_SNAPSHOT', 'FEATURE_SIGNAL_BLOCK', 'NARY_INCIDENCE', 'ORDERED_CONTEXT'].includes(value.role) && !value.row_identity_checksum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['row_identity_checksum'],
      message: `${value.role} requires row_identity_checksum for cross-artifact alignment`,
    });
  }
});

export type ArtifactTransportRefV1 = z.infer<typeof artifactTransportRefSchema>;

export const sampleQueryNominationSchema = z.object({
  schema: z.literal('atlas.sample-query-nomination.v1').default('atlas.sample-query-nomination.v1'),
  nomination_id: id,
  nomination_revision: revision,
  source_artifact_id: id,
  access_model: z.enum(['L2_SAMPLE_QUERY', 'LOW_RANK_SAMPLE_QUERY']),
  probability_basis: z.enum(['ROW_L2_NORM_SQUARED', 'LOW_RANK_RESIDUAL_L2_NORM_SQUARED']),
  sample_count: z.number().int().positive(),
  prng_seed: z.string().min(1),
  candidate_limit: z.number().int().positive(),
  exact_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.sample_count > value.candidate_limit) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sample_count'], message: 'sample_count cannot exceed candidate_limit' });
  }
  if (value.access_model === 'L2_SAMPLE_QUERY' && value.probability_basis !== 'ROW_L2_NORM_SQUARED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probability_basis'], message: 'L2 sample/query access must use row L2 norm-squared probability' });
  }
  if (value.access_model === 'LOW_RANK_SAMPLE_QUERY' && value.probability_basis !== 'LOW_RANK_RESIDUAL_L2_NORM_SQUARED') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probability_basis'], message: 'low-rank sample/query nomination must use the declared low-rank residual probability basis' });
  }
});

export type SampleQueryNominationV1 = z.infer<typeof sampleQueryNominationSchema>;

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

export function canonicalJsonChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function describeArtifactTransportPolicy(): string {
  return [
    'Fixed aligned tensor snapshots should use Arrow IPC file/random-access artifacts and may be read through read-only mmap.',
    'Arrow IPC streams are sequential transports and are never described as mmap snapshots.',
    'MessagePack is reserved for compact short-lived envelopes/events; Atlas lineage hashes logical canonical content separately from encoded transport bytes.',
    'Tang-style sample/query nomination is bounded exploration only and always requires exact evidence promotion before mutation or synthesis authority.',
  ].join(' ');
}
