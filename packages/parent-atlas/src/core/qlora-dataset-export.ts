import { z } from 'zod';

const revision = z.string().min(1);
const id = z.string().min(1);

export const qloraTrainingExampleSchema = z.object({
  example_id: id,
  feature_id: id,
  feature_revision: revision,
  evidence_snapshot_revision: revision,
  matrix_snapshot_revision: revision,
  prompt: z.string().min(1),
  target: z.string().min(1),
  evidence_refs: z.array(id).min(1),
  relationship_ids: z.array(id).default([]),
  quality: z.number().finite().min(0).max(1),
  split: z.enum(['train', 'validation', 'test']),
  derived_sampling_signals: z.record(z.string(), z.number().finite()).default({}),
  canonical_label_source: z.literal('verified_evidence').default('verified_evidence'),
}).strict();

export const qloraDatasetExportReceiptSchema = z.object({
  schema: z.literal('atlas.qlora-dataset-export-receipt.v1').default('atlas.qlora-dataset-export-receipt.v1'),
  dataset_revision: revision,
  evidence_snapshot_revision: revision,
  matrix_snapshot_revision: revision,
  example_count: z.number().int().nonnegative(),
  train_count: z.number().int().nonnegative(),
  validation_count: z.number().int().nonnegative(),
  test_count: z.number().int().nonnegative(),
  source_checksum: z.string().min(1),
  dataset_checksum: z.string().min(1),
  selection_policy_revision: revision,
  producer_revision: revision,
}).strict();

export type QloraTrainingExampleV1 = z.infer<typeof qloraTrainingExampleSchema>;
export type QloraDatasetExportReceiptV1 = z.infer<typeof qloraDatasetExportReceiptSchema>;

export function validateQloraTrainingExample(input: unknown): QloraTrainingExampleV1 {
  return qloraTrainingExampleSchema.parse(input);
}

/**
 * TODO(FI-22G): dataset builder must reject examples whose required evidence is
 * stale, contradictory, unverified, or derived only from ANN/manifold/model
 * scores. TurboVec/SVD/SOM/PPR may affect sampling priority, never target truth.
 */
export interface QloraDatasetSelectorV1 {
  select(input: {
    evidence_snapshot_revision: string;
    matrix_snapshot_revision: string;
    minimum_quality: number;
    maximum_examples: number;
  }): Promise<QloraTrainingExampleV1[]>;
}
