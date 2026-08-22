import { z } from 'zod';

export const ClassifierKindEnum = z.enum([
  'rule_baseline',
  'word_frequency_prototype',
  'naive_bayes',
  'logistic_regression',
  'xgboost',
  'pytorch_mlp',
  'unknown',
]);
export type ClassifierKind = z.infer<typeof ClassifierKindEnum>;

export const PredictionStatusEnum = z.enum([
  'PREDICTED',
  'GATED_LOW_CONFIDENCE',
  'GATED_VERSION_MISMATCH',
  'GATED_UNKNOWN',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
]);
export type PredictionStatus = z.infer<typeof PredictionStatusEnum>;

export const DomainPredictionSchema = z.object({
  schemaId: z.literal('atlas:domain:prediction'),
  schemaVersion: z.literal('1.0.0'),
  predictionId: z.string().uuid().optional().nullable(),
  classificationRunId: z.string().uuid(),
  packetKey: z.string().min(8),
  predictedDomain: z.string().min(1),
  rawScore: z.number(),
  scoreMargin: z.number().optional().nullable(),
  calibratedConfidence: z.number().min(0).max(1).optional().nullable(),
  classifierKind: ClassifierKindEnum,
  classifierVersion: z.string().min(1),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  featureSchemaVersion: z.string().min(1),
  sourceSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  ontologyVersion: z.string().min(1),
  status: PredictionStatusEnum,
  gateReason: z.string().optional().nullable(),
  authorizedBy: z.string().optional().nullable(),
  authorizedAt: z.string().datetime().optional().nullable(),
  promotedToCanonicalAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type DomainPrediction = z.infer<typeof DomainPredictionSchema>;

/**
 * Validate and construct domain prediction.
 */
export function createDomainPrediction(input: unknown): DomainPrediction {
  return DomainPredictionSchema.parse(input);
}

/**
 * Authorization gate: move prediction from ACCEPTED to authorized state.
 */
export function authorizedPromotePrediction(
  prediction: DomainPrediction,
  authorizedBy: string
): DomainPrediction {
  if (prediction.status !== 'ACCEPTED') {
    throw new Error(`Cannot promote prediction with status ${prediction.status}. Must be ACCEPTED.`);
  }

  return {
    ...prediction,
    status: 'SUPERSEDED' as const,
    authorizedBy,
    authorizedAt: new Date().toISOString(),
  };
}
