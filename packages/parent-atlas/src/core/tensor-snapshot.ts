import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);
const canonicalId = z.string().min(1);

export const tensorRowIdentitySchema = z.object({
  ordinal: z.number().int().nonnegative(),
  canonical_id: canonicalId,
  canonical_revision: revision,
}).strict();

export const tensorSnapshotSchema = z.object({
  schema: z.literal('atlas.tensor-snapshot.v1').default('atlas.tensor-snapshot.v1'),
  snapshot_revision: revision,
  representation: z.string().min(1),
  dimensions: z.number().int().positive(),
  dtype: z.enum(['float32', 'float16', 'bfloat16', 'int8', 'uint32']),
  row_count: z.number().int().nonnegative(),
  rows: z.array(tensorRowIdentitySchema),
  tensor_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  row_identity_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  ordinal_is_canonical: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.rows.length !== value.row_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'rows.length must equal row_count' });
  }
  const ordinals = value.rows.map((row) => row.ordinal);
  const expected = Array.from({ length: value.row_count }, (_, index) => index);
  if (ordinals.some((ordinal, index) => ordinal !== expected[index])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'ordinals must be dense 0..N-1 in row order' });
  }
  if (new Set(value.rows.map((row) => row.canonical_id)).size !== value.rows.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'canonical_id must be unique within tensor snapshot' });
  }
});

export type TensorRowIdentityV1 = z.infer<typeof tensorRowIdentitySchema>;
export type TensorSnapshotV1 = z.infer<typeof tensorSnapshotSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

export function buildTensorSnapshot(input: {
  snapshot_revision: string;
  representation: string;
  dimensions: number;
  dtype: TensorSnapshotV1['dtype'];
  canonical_rows: Array<{ canonical_id: string; canonical_revision: string }>;
  tensor_checksum: string;
  producer_revision: string;
}): TensorSnapshotV1 {
  const rows = [...input.canonical_rows]
    .sort((a, b) => a.canonical_id.localeCompare(b.canonical_id) || a.canonical_revision.localeCompare(b.canonical_revision))
    .map((row, ordinal) => ({ ordinal, canonical_id: row.canonical_id, canonical_revision: row.canonical_revision }));
  return tensorSnapshotSchema.parse({
    snapshot_revision: input.snapshot_revision,
    representation: input.representation,
    dimensions: input.dimensions,
    dtype: input.dtype,
    row_count: rows.length,
    rows,
    tensor_checksum: input.tensor_checksum,
    row_identity_checksum: sha256(rows),
    ordinal_is_canonical: false,
    producer_revision: input.producer_revision,
  });
}

export function canonicalIdForOrdinal(snapshotInput: TensorSnapshotV1, ordinal: number): string {
  const snapshot = tensorSnapshotSchema.parse(snapshotInput);
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= snapshot.row_count) {
    throw new RangeError(`TENSOR_ORDINAL_OUT_OF_RANGE:${ordinal}`);
  }
  return snapshot.rows[ordinal]!.canonical_id;
}

export function ordinalForCanonicalId(snapshotInput: TensorSnapshotV1, canonical_id: string): number {
  const snapshot = tensorSnapshotSchema.parse(snapshotInput);
  const row = snapshot.rows.find((item) => item.canonical_id === canonical_id);
  if (!row) throw new Error(`TENSOR_CANONICAL_ID_NOT_FOUND:${canonical_id}`);
  return row.ordinal;
}
