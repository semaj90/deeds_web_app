import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const encoderTrainingDatasetReceiptSchema = z.object({
  schema: z.literal('atlas.encoder-training-dataset-receipt.v1').default('atlas.encoder-training-dataset-receipt.v1'),
  dataset_revision: revision,
  dataset_checksum: checksum,
  evidence_snapshot_revision: revision,
  matrix_snapshot_revision: revision,
  representation_revision: revision,
  encoder_model_revision: revision,
  prompt_revision: revision,
  label_revision: revision,
  example_count: z.number().int().nonnegative(),
  verified_example_count: z.number().int().nonnegative(),
  exact_promotion_coverage: z.number().finite().min(0).max(1),
  source_receipt_refs: z.array(z.string().min(1)),
  phase_receipt_refs: z.array(z.string().min(1)),
  admission: z.enum(['BLOCKED', 'SHADOW_ONLY']),
  training_example_admitted: z.literal(false).default(false),
  canonical_writes_allowed: z.literal(false).default(false),
  producer_revision: revision,
  receipt_checksum: checksum,
}).strict().superRefine((value, ctx) => {
  if (value.verified_example_count > value.example_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['verified_example_count'], message: 'verified examples cannot exceed total examples' });
  }
  if (value.admission === 'SHADOW_ONLY' && value.verified_example_count === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['admission'], message: 'shadow admission requires verified examples' });
  }
});

export type EncoderTrainingDatasetReceiptV1 = z.infer<typeof encoderTrainingDatasetReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildEncoderTrainingDatasetReceipt(input: Omit<z.input<typeof encoderTrainingDatasetReceiptSchema>, 'schema' | 'receipt_checksum' | 'training_example_admitted' | 'canonical_writes_allowed'>): EncoderTrainingDatasetReceiptV1 {
  const body = {
    schema: 'atlas.encoder-training-dataset-receipt.v1' as const,
    ...input,
    training_example_admitted: false as const,
    canonical_writes_allowed: false as const,
  };
  return encoderTrainingDatasetReceiptSchema.parse({ ...body, receipt_checksum: digest(body) });
}
