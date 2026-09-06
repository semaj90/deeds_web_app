export const PREFETCH_PREDICTION_V1_SCHEMA = 'parent-atlas.prefetch-prediction.v1' as const;

export interface PredictedNextActionV1 {
  actionKey: string;
  probability: number;
  source:
    | 'ACTION_GRAM'
    | 'LOW_RANK_HELPER'
    | 'DAG_POSITION'
    | 'HISTORICAL_TRANSITION'
    | 'COMBINED';
  evidenceRefs: readonly string[];
}

export interface PrefetchPredictionV1 {
  schema: typeof PREFETCH_PREDICTION_V1_SCHEMA;
  requestId: string;
  predictionRevision: string;
  predictions: readonly PredictedNextActionV1[];
}

export function normalizePrefetchPredictionV1(
  input: Omit<PrefetchPredictionV1, 'schema' | 'predictions'> & {
    predictions: readonly PredictedNextActionV1[];
  }
): PrefetchPredictionV1 {
  return {
    ...input,
    schema: PREFETCH_PREDICTION_V1_SCHEMA,
    predictions: input.predictions
      .filter((x) => Number.isFinite(x.probability) && x.probability >= 0 && x.probability <= 1)
      .map((x) => ({ ...x, evidenceRefs: [...new Set(x.evidenceRefs)].sort() }))
      .sort((a, b) => b.probability - a.probability || a.actionKey.localeCompare(b.actionKey))
  };
}
