import { z } from 'zod';

export const DpoTrainingStateV1Schema = z.enum([
  'DEFERRED',
  'DATASET_INSUFFICIENT',
  'SFT_EVALUATION_REQUIRED',
  'HELD_OUT_EVALUATION_REQUIRED',
  'READY_FOR_SHADOW_TRAINING',
  'SHADOW_VALIDATED',
  'REJECTED',
]);
export type DpoTrainingStateV1 = z.infer<typeof DpoTrainingStateV1Schema>;

export const DpoTrainingGateV1Schema = z.object({
  schema: z.literal('atlas.dpo-training-gate.v1'),
  state: DpoTrainingStateV1Schema,
  baseModelRevision: z.string().min(1),
  sftAdapterRevision: z.string().min(1),
  preferenceDatasetRevision: z.string().min(1).nullable(),
  sftEvaluationReceiptChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  heldOutEvaluationReceiptChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  preferencePairCount: z.number().int().nonnegative(),
  minimumPreferencePairs: z.number().int().positive(),
  trainSourceRevisions: z.array(z.string().min(1)),
  heldOutSourceRevisions: z.array(z.string().min(1)),
  sourceRevisionOverlap: z.boolean(),
  offlineOnly: z.literal(true),
  onlineWeightMutationAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  promotionAuthorized: z.literal(false),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  producerRevision: z.string().min(1),
}).strict();
export type DpoTrainingGateV1 = z.infer<typeof DpoTrainingGateV1Schema>;

export function evaluateDpoTrainingGateV1(input: {
  baseModelRevision: string;
  sftAdapterRevision: string;
  preferenceDatasetRevision?: string | null;
  sftEvaluationReceiptChecksum?: string | null;
  heldOutEvaluationReceiptChecksum?: string | null;
  preferencePairCount: number;
  minimumPreferencePairs: number;
  trainSourceRevisions: string[];
  heldOutSourceRevisions: string[];
  sftEvaluationProven: boolean;
  heldOutEvaluationProven: boolean;
  shadowMetricsPassed?: boolean;
  producerRevision: string;
}): DpoTrainingGateV1 {
  const train = new Set(input.trainSourceRevisions);
  const heldOut = new Set(input.heldOutSourceRevisions);
  const overlap = [...train].filter((revision) => heldOut.has(revision));
  const reasonCodes: string[] = [];
  let state: DpoTrainingStateV1 = 'DEFERRED';

  if (overlap.length > 0) {
    state = 'REJECTED';
    reasonCodes.push('TRAIN_HELD_OUT_SOURCE_REVISION_OVERLAP');
  } else if (!input.preferenceDatasetRevision || input.preferencePairCount < input.minimumPreferencePairs) {
    state = 'DATASET_INSUFFICIENT';
    reasonCodes.push('PREFERENCE_DATASET_INSUFFICIENT');
  } else if (!input.sftEvaluationProven || !input.sftEvaluationReceiptChecksum) {
    state = 'SFT_EVALUATION_REQUIRED';
    reasonCodes.push('PROVEN_SFT_EVALUATION_REQUIRED');
  } else if (!input.heldOutEvaluationProven || !input.heldOutEvaluationReceiptChecksum) {
    state = 'HELD_OUT_EVALUATION_REQUIRED';
    reasonCodes.push('PROVEN_HELD_OUT_EVALUATION_REQUIRED');
  } else if (input.shadowMetricsPassed === true) {
    state = 'SHADOW_VALIDATED';
    reasonCodes.push('DPO_SHADOW_METRICS_PASSED');
  } else {
    state = 'READY_FOR_SHADOW_TRAINING';
    reasonCodes.push('DPO_SHADOW_TRAINING_ONLY');
  }

  return DpoTrainingGateV1Schema.parse({
    schema: 'atlas.dpo-training-gate.v1',
    state,
    baseModelRevision: input.baseModelRevision,
    sftAdapterRevision: input.sftAdapterRevision,
    preferenceDatasetRevision: input.preferenceDatasetRevision ?? null,
    sftEvaluationReceiptChecksum: input.sftEvaluationReceiptChecksum ?? null,
    heldOutEvaluationReceiptChecksum: input.heldOutEvaluationReceiptChecksum ?? null,
    preferencePairCount: input.preferencePairCount,
    minimumPreferencePairs: input.minimumPreferencePairs,
    trainSourceRevisions: [...train].sort(),
    heldOutSourceRevisions: [...heldOut].sort(),
    sourceRevisionOverlap: overlap.length > 0,
    offlineOnly: true,
    onlineWeightMutationAllowed: false,
    canonicalWritesAllowed: false,
    promotionAuthorized: false,
    reasonCodes,
    producerRevision: input.producerRevision,
  });
}
