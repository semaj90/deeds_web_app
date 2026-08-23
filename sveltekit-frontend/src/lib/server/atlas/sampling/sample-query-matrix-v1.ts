import { z } from 'zod';

export const SampleQueryMatrixRoleV1Schema = z.enum(['CANDIDATE_FEATURE', 'SEMANTIC_RESIDUAL', 'LATENT_ROUTING']);
export const SampleQueryMatrixNormalizationV1Schema = z.enum(['NONE', 'COLUMN_STANDARDIZED', 'ROW_L2']);
export const SampleQueryMatrixSamplingAxisV1Schema = z.enum(['ROW', 'COLUMN']);
export const SampleQueryMatrixSamplingPolicyV1Schema = z.enum(['LENGTH_SQUARED', 'UNIFORM', 'LEVERAGE_APPROX']);

export const SampleQueryMatrixV1Schema = z.object({
  schema: z.literal('atlas.sample-query-matrix.v1'),
  matrixRole: SampleQueryMatrixRoleV1Schema,
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  normalization: SampleQueryMatrixNormalizationV1Schema,
  samplingAxis: SampleQueryMatrixSamplingAxisV1Schema,
  samplingPolicy: SampleQueryMatrixSamplingPolicyV1Schema,
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().min(1),
  canonicalIdentityAuthority: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  matrixChecksum: z.string().min(1),
}).strict();
export type SampleQueryMatrixV1 = z.infer<typeof SampleQueryMatrixV1Schema>;

export interface SamplingDecisionV1 {
  schema: 'atlas.sampling-decision.v1';
  selectedIndex: number;
  probability: number;
  probabilities: number[];
  normalizationDegeneratedToUniform: boolean;
  matrixRole: SampleQueryMatrixV1['matrixRole'];
  samplingAxis: SampleQueryMatrixV1['samplingAxis'];
  samplingPolicy: SampleQueryMatrixV1['samplingPolicy'];
  canonicalIdentityAuthority: false;
  retrievalVoteAdded: false;
}

function squaredNorm(row: readonly number[]): number {
  return row.reduce((sum, value) => sum + value * value, 0);
}

export function buildLengthSquaredSamplingDecisionV1(
  matrix: readonly (readonly number[])[],
  input: Pick<SampleQueryMatrixV1, 'matrixRole' | 'samplingAxis' | 'samplingPolicy' | 'normalization'>,
  selectedIndex = 0,
): SamplingDecisionV1 {
  if (input.samplingAxis !== 'ROW' || input.samplingPolicy !== 'LENGTH_SQUARED') throw new Error('ATLAS_LENGTH_SQUARED_ROW_REQUIRED');
  if (matrix.length === 0 || matrix.some((row) => row.length === 0 || row.some((value) => !Number.isFinite(value)))) throw new Error('ATLAS_SAMPLING_MATRIX_INVALID');
  // Length-squared sampling is defined over the matrix actually supplied to
  // the sampler. Row-L2 normalization therefore removes row magnitude and
  // intentionally degenerates non-zero rows to equal weight.
  const weights = matrix.map((row) => input.normalization === 'ROW_L2'
    ? (squaredNorm(row) > 0 ? 1 : 0)
    : squaredNorm(row));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const probabilities = total > 0 ? weights.map((value) => value / total) : weights.map(() => 1 / weights.length);
  const index = Math.min(Math.max(selectedIndex, 0), probabilities.length - 1);
  return { schema: 'atlas.sampling-decision.v1', selectedIndex: index, probability: probabilities[index]!, probabilities, normalizationDegeneratedToUniform: input.normalization === 'ROW_L2' || total === 0, matrixRole: input.matrixRole, samplingAxis: input.samplingAxis, samplingPolicy: input.samplingPolicy, canonicalIdentityAuthority: false, retrievalVoteAdded: false };
}
