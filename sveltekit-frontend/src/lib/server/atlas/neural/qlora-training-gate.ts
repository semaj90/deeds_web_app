import { z } from 'zod';

/**
 * QLoRA is a later-stage model adaptation path. It consumes validated Atlas
 * execution evidence; it never trains directly from approximate retrieval or
 * unvalidated DAG mutations.
 */
export const QloraTrainingStateSchema = z.enum([
  'DEFERRED',
  'DATASET_INSUFFICIENT',
  'EVAL_BASELINE_MISSING',
  'READY_FOR_SHADOW_TRAINING',
  'SHADOW_VALIDATED',
  'REJECTED',
]);
export type QloraTrainingState = z.infer<typeof QloraTrainingStateSchema>;

export const QloraTrainingGateV1Schema = z.object({
  schema: z.literal('atlas.qlora-training-gate.v1'),
  state: QloraTrainingStateSchema,
  baseModelRevision: z.string().min(1),
  datasetRevision: z.string().min(1).nullable(),
  policyRevision: z.string().min(1),
  evidenceReceiptCount: z.number().int().nonnegative(),
  minimumEvidenceReceipts: z.number().int().positive(),
  validatedExecutionRate: z.number().min(0).max(1),
  minimumValidatedExecutionRate: z.number().min(0).max(1),
  exactPromotionCoverage: z.number().min(0).max(1),
  minimumExactPromotionCoverage: z.number().min(0).max(1),
  baselineRevision: z.string().min(1).nullable(),
  quantizationMode: z.literal('NF4_4BIT'),
  adapterMethod: z.literal('QLORA'),
  targetPolicy: z.literal('ALL_LINEAR_CANDIDATE'),
  trainableBaseWeights: z.literal(false),
  onlineTrainingAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  shadowEvaluationRequired: z.literal(true),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  producerRevision: z.string().min(1),
}).strict();
export type QloraTrainingGateV1 = z.infer<typeof QloraTrainingGateV1Schema>;

export interface QloraTrainingEvidenceSummary {
  datasetRevision?: string | null;
  evidenceReceiptCount: number;
  validatedExecutionRate: number;
  exactPromotionCoverage: number;
  baselineRevision?: string | null;
  shadowMetricsPassed?: boolean;
}

/**
 * Conservative gate: the QLoRA adapter only becomes eligible after the graph/
 * retrieval/search path has produced enough exact-promoted, validator-backed
 * receipts. This avoids using PCA/SVD/greedy/A* heuristics as labels.
 */
export function evaluateQloraTrainingGate(input: {
  baseModelRevision: string;
  policyRevision: string;
  evidence: QloraTrainingEvidenceSummary;
  minimumEvidenceReceipts?: number;
  minimumValidatedExecutionRate?: number;
  minimumExactPromotionCoverage?: number;
  producerRevision: string;
}): QloraTrainingGateV1 {
  const minimumEvidenceReceipts = input.minimumEvidenceReceipts ?? 1000;
  const minimumValidatedExecutionRate = input.minimumValidatedExecutionRate ?? 0.95;
  const minimumExactPromotionCoverage = input.minimumExactPromotionCoverage ?? 0.99;
  const reasonCodes: string[] = [];

  let state: QloraTrainingState = 'DEFERRED';
  if (!input.evidence.datasetRevision || input.evidence.evidenceReceiptCount < minimumEvidenceReceipts) {
    state = 'DATASET_INSUFFICIENT';
    reasonCodes.push('INSUFFICIENT_VALIDATED_RECEIPTS');
  } else if (!input.evidence.baselineRevision) {
    state = 'EVAL_BASELINE_MISSING';
    reasonCodes.push('EVALUATION_BASELINE_REQUIRED');
  } else if (input.evidence.validatedExecutionRate < minimumValidatedExecutionRate) {
    state = 'DATASET_INSUFFICIENT';
    reasonCodes.push('VALIDATED_EXECUTION_RATE_TOO_LOW');
  } else if (input.evidence.exactPromotionCoverage < minimumExactPromotionCoverage) {
    state = 'DATASET_INSUFFICIENT';
    reasonCodes.push('EXACT_PROMOTION_COVERAGE_TOO_LOW');
  } else if (input.evidence.shadowMetricsPassed === true) {
    state = 'SHADOW_VALIDATED';
    reasonCodes.push('SHADOW_METRICS_PASSED');
  } else {
    state = 'READY_FOR_SHADOW_TRAINING';
    reasonCodes.push('VALIDATED_DATASET_READY');
    reasonCodes.push('SHADOW_TRAINING_ONLY');
  }

  return QloraTrainingGateV1Schema.parse({
    schema: 'atlas.qlora-training-gate.v1',
    state,
    baseModelRevision: input.baseModelRevision,
    datasetRevision: input.evidence.datasetRevision ?? null,
    policyRevision: input.policyRevision,
    evidenceReceiptCount: input.evidence.evidenceReceiptCount,
    minimumEvidenceReceipts,
    validatedExecutionRate: input.evidence.validatedExecutionRate,
    minimumValidatedExecutionRate,
    exactPromotionCoverage: input.evidence.exactPromotionCoverage,
    minimumExactPromotionCoverage,
    baselineRevision: input.evidence.baselineRevision ?? null,
    quantizationMode: 'NF4_4BIT',
    adapterMethod: 'QLORA',
    targetPolicy: 'ALL_LINEAR_CANDIDATE',
    trainableBaseWeights: false,
    onlineTrainingAllowed: false,
    canonicalWritesAllowed: false,
    shadowEvaluationRequired: true,
    reasonCodes,
    producerRevision: input.producerRevision,
  });
}
