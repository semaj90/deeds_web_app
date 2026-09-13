import { z } from 'zod';
import { retrievalMetricBindingV1Schema } from './retrieval-metric-family-v1.js';

export const CANDIDATE_METRIC_EVIDENCE_V1 = 'atlas.candidate-metric-evidence.v1' as const;

export const candidateMetricEvidenceV1Schema = z.object({
  schema: z.literal(CANDIDATE_METRIC_EVIDENCE_V1),
  requestId: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  binding: retrievalMetricBindingV1Schema,
  rawValue: z.number().finite(),
  calibratedSimilarity: z.number().min(0).max(1).nullable(),
  calibrationRevision: z.string().min(1).nullable(),
}).strict().superRefine((row, ctx) => {
  if ((row.calibratedSimilarity === null) !== (row.calibrationRevision === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['calibrationRevision'],
      message: 'CALIBRATION_VALUE_AND_REVISION_MUST_COHERENTLY_COEXIST',
    });
  }

  if (
    row.binding.metric === 'COSINE'
    || row.binding.metric === 'DOT'
    || row.binding.metric === 'JACCARD'
    || row.binding.metric === 'WEIGHTED_JACCARD'
    || row.binding.metric === 'SPARSE_COSINE'
    || row.binding.metric === 'PPR'
  ) {
    if (row.rawValue < -1 || row.rawValue > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rawValue'],
        message: `SIMILARITY_LIKE_METRIC_OUT_OF_RANGE:${row.binding.metric}`,
      });
    }
  } else if (row.rawValue < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rawValue'],
      message: `DISTANCE_METRIC_NEGATIVE:${row.binding.metric}`,
    });
  }
});

export type CandidateMetricEvidenceV1 = z.infer<typeof candidateMetricEvidenceV1Schema>;

export function groupMetricEvidenceByCandidateOrdinal(
  rows: readonly CandidateMetricEvidenceV1[],
): Map<number, CandidateMetricEvidenceV1[]> {
  const grouped = new Map<number, CandidateMetricEvidenceV1[]>();
  for (const input of rows) {
    const row = candidateMetricEvidenceV1Schema.parse(input);
    const current = grouped.get(row.candidateOrdinal) ?? [];
    current.push(row);
    grouped.set(row.candidateOrdinal, current);
  }
  return grouped;
}
