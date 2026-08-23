import { createHash } from 'node:crypto';

export type SampleQueryMatrixRoleV1 = 'CANDIDATE_FEATURE' | 'SEMANTIC_RESIDUAL' | 'LATENT_ROUTING';
export type SampleQueryNormalizationV1 = 'NONE' | 'COLUMN_STANDARDIZED' | 'ROW_L2';
export type SampleQuerySamplingAxisV1 = 'ROW' | 'COLUMN';
export type SampleQuerySamplingPolicyV1 = 'LENGTH_SQUARED' | 'UNIFORM' | 'LEVERAGE_APPROX';

export interface SampleQueryMatrixV1 {
  schema: 'atlas.sample-query-matrix.v1';
  sourceSnapshotRevision: string;
  sourceMatrixChecksum: string;
  ordinalMapChecksum: string;
  matrixRole: SampleQueryMatrixRoleV1;
  normalization: SampleQueryNormalizationV1;
  rows: number;
  columns: number;
  rankTarget: number;
  samplingAxis: SampleQuerySamplingAxisV1;
  samplingPolicy: SampleQuerySamplingPolicyV1;
  canonicalIdentityAuthority: false;
  retrievalVoteAdded: false;
  producerRevision: string;
}

export interface SamplingDecisionV1 {
  schema: 'atlas.sampling-decision.v1';
  sourceMatrixChecksum: string;
  ordinalMapChecksum: string;
  policy: 'LENGTH_SQUARED';
  samplingAxis: SampleQuerySamplingAxisV1;
  probabilities: number[];
  normalizationDegeneratedToUniform: boolean;
  canonicalIdentityAuthority: false;
  retrievalVoteAdded: false;
  checksum: string;
}

function stableChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertFiniteMatrix(matrix: readonly (readonly number[])[]): { rows: number; columns: number } {
  const rows = matrix.length;
  if (rows === 0) throw new Error('SAMPLE_QUERY_MATRIX_EMPTY');
  const columns = matrix[0]!.length;
  if (columns === 0) throw new Error('SAMPLE_QUERY_MATRIX_ZERO_WIDTH');
  for (const row of matrix) {
    if (row.length !== columns) throw new Error('SAMPLE_QUERY_MATRIX_RAGGED');
    if (row.some((value) => !Number.isFinite(value))) throw new Error('SAMPLE_QUERY_MATRIX_NONFINITE');
  }
  return { rows, columns };
}

function sumSquares(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return sum;
}

function nearUniform(values: readonly number[], tolerance = 1e-6): boolean {
  if (values.length === 0) return false;
  const expected = 1 / values.length;
  return values.every((value) => Math.abs(value - expected) <= tolerance);
}

export function lengthSquaredProbabilitiesV1(input: {
  matrix: readonly (readonly number[])[];
  samplingAxis: SampleQuerySamplingAxisV1;
}): number[] {
  const { rows, columns } = assertFiniteMatrix(input.matrix);
  const weights: number[] = [];

  if (input.samplingAxis === 'ROW') {
    for (const row of input.matrix) weights.push(sumSquares(row));
  } else {
    for (let column = 0; column < columns; column += 1) {
      let sum = 0;
      for (let row = 0; row < rows; row += 1) {
        const value = input.matrix[row]![column]!;
        sum += value * value;
      }
      weights.push(sum);
    }
  }

  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error('SAMPLE_QUERY_MATRIX_ZERO_NORM');
  return weights.map((weight) => weight / total);
}

export function buildLengthSquaredSamplingDecisionV1(input: {
  contract: SampleQueryMatrixV1;
  matrix: readonly (readonly number[])[];
}): SamplingDecisionV1 {
  if (input.contract.samplingPolicy !== 'LENGTH_SQUARED') throw new Error('SAMPLE_QUERY_POLICY_NOT_LENGTH_SQUARED');
  const shape = assertFiniteMatrix(input.matrix);
  if (shape.rows !== input.contract.rows || shape.columns !== input.contract.columns) {
    throw new Error('SAMPLE_QUERY_MATRIX_SHAPE_MISMATCH');
  }

  const probabilities = lengthSquaredProbabilitiesV1({ matrix: input.matrix, samplingAxis: input.contract.samplingAxis });
  const body = {
    schema: 'atlas.sampling-decision.v1' as const,
    sourceMatrixChecksum: input.contract.sourceMatrixChecksum,
    ordinalMapChecksum: input.contract.ordinalMapChecksum,
    policy: 'LENGTH_SQUARED' as const,
    samplingAxis: input.contract.samplingAxis,
    probabilities,
    normalizationDegeneratedToUniform:
      input.contract.normalization === 'ROW_L2' && input.contract.samplingAxis === 'ROW' && nearUniform(probabilities),
    canonicalIdentityAuthority: false as const,
    retrievalVoteAdded: false as const,
  };
  return { ...body, checksum: stableChecksum(body) };
}
