import { z } from 'zod';

export const FEATURE_MATRIX_4X6_SCHEMA = 'atlas.feature-matrix-4x6.v1' as const;

export const FEATURE_CHANNELS = [
  'semantic',
  'graphPpr',
  'nary',
  'ast',
  'provenance',
  'toolEvidence',
] as const;
export type FeatureChannel = typeof FEATURE_CHANNELS[number];

export const CandidateInvestigationStateSchema = z.enum([
  'INSPECT_PARSER',
  'TRACE_CALLER',
  'VALIDATE_GRAPH',
  'RUN_TEST',
]);
export type CandidateInvestigationState = z.infer<typeof CandidateInvestigationStateSchema>;

export const InvestigationCandidateFeatureRowSchema = z
  .object({
    candidateState: CandidateInvestigationStateSchema,
    canonicalId: z.string().min(1),
    semantic: z.number().min(0).max(1),
    graphPpr: z.number().min(0).max(1),
    nary: z.number().min(0).max(1),
    ast: z.number().min(0).max(1),
    provenance: z.number().min(0).max(1),
    toolEvidence: z.number().min(0).max(1),
    provenanceRef: z.string().min(1),
    missingSignalMask: z.number().int().nonnegative().default(0), // Bitmask of missing features
  })
  .strict();
export type InvestigationCandidateFeatureRow = z.infer<typeof InvestigationCandidateFeatureRowSchema>;

export const FeatureMatrix4x6Schema = z
  .object({
    schema: z.literal(FEATURE_MATRIX_4X6_SCHEMA),
    matrixId: z.string().min(1),
    queryText: z.string().min(1),
    workspaceRevision: z.string().min(1),
    rows: z.array(InvestigationCandidateFeatureRowSchema).length(4),
    createdAt: z.string().datetime(),
  })
  .strict();
export type FeatureMatrix4x6 = z.infer<typeof FeatureMatrix4x6Schema>;

export interface AdvisoryWeights {
  semantic: number;
  graphPpr: number;
  nary: number;
  ast: number;
  provenance: number;
  toolEvidence: number;
}

export const DEFAULT_ADVISORY_WEIGHTS: AdvisoryWeights = {
  semantic: 0.20,
  graphPpr: 0.15,
  nary: 0.15,
  ast: 0.15,
  provenance: 0.15,
  toolEvidence: 0.20,
};

/**
 * Computes advisory ranking scores for the 4 candidate states.
 * Note: Advisory re-ranker only; never an independent RRF retrieval vote.
 */
export function scoreAdvisoryCandidates4x6(
  matrix: FeatureMatrix4x6,
  weights: AdvisoryWeights = DEFAULT_ADVISORY_WEIGHTS
): Array<{ candidateState: CandidateInvestigationState; canonicalId: string; score: number }> {
  return matrix.rows.map((row) => {
    const rawScore =
      row.semantic * weights.semantic +
      row.graphPpr * weights.graphPpr +
      row.nary * weights.nary +
      row.ast * weights.ast +
      row.provenance * weights.provenance +
      row.toolEvidence * weights.toolEvidence;

    return {
      candidateState: row.candidateState,
      canonicalId: row.canonicalId,
      score: Number((rawScore * 100).toFixed(2)),
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Flattens the 4x6 matrix into a contiguous 24-float array for PyTorch / TensorRT input.
 */
export function flattenFeatureMatrix4x6(matrix: FeatureMatrix4x6): Float32Array {
  const flat = new Float32Array(24);
  let offset = 0;
  for (const row of matrix.rows) {
    flat[offset++] = row.semantic;
    flat[offset++] = row.graphPpr;
    flat[offset++] = row.nary;
    flat[offset++] = row.ast;
    flat[offset++] = row.provenance;
    flat[offset++] = row.toolEvidence;
  }
  return flat;
}
