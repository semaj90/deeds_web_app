import { z } from 'zod';

const revision = z.string().min(1);
const normalized = z.number().finite().min(0).max(1);

export const modelSignalReceiptSchema = z.object({
  schema: z.literal('atlas.model-signal-receipt.v1').default('atlas.model-signal-receipt.v1'),
  feature_id: z.string().min(1),
  feature_revision: revision,
  matrix_snapshot_revision: revision,
  signal_revision: revision,
  producer: z.enum(['turbovec', 'svd', 'randomized_low_rank', 'kmeans', 'som', 'xgboost', 'crossencoder', 'other']),
  score: normalized.nullable().optional(),
  distance: z.number().finite().nonnegative().nullable().optional(),
  component_norm: z.number().finite().nonnegative().nullable().optional(),
  cluster_id: z.string().min(1).nullable().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  input_checksum: z.string().min(1),
  output_checksum: z.string().min(1),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();

export type ModelSignalReceiptV1 = z.infer<typeof modelSignalReceiptSchema>;

export function buildModelSignalReceipt(input: z.input<typeof modelSignalReceiptSchema>): ModelSignalReceiptV1 {
  return modelSignalReceiptSchema.parse(input);
}

/** TODO(FI-22F): consumers must join these receipts by feature_id + matrix_snapshot_revision; never by row offset alone. */
