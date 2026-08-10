export const FEATURE_MATRIX_5_NAMES = [
  'entropy_norm',
  'ast_signal',
  'domain_fit',
  'authority_norm',
  'execution_utility'
] as const;

export type FeatureMatrix5Name = (typeof FEATURE_MATRIX_5_NAMES)[number];
export type FeatureVector5 = readonly [number, number, number, number, number];

export interface FeatureMatrix5Row {
  packetKey: string;
  features: FeatureVector5;
  missingMask: number;
  workspaceRevision: string;
  sourceRevision?: string;
}

export function validateFeatureVector5(v: readonly number[]): asserts v is FeatureVector5 {
  if (v.length !== 5 || v.some((x) => !Number.isFinite(x))) throw new Error('FeatureVector5 must contain five finite values');
}

export function scoreByCovector(x: FeatureVector5, w: FeatureVector5, bias = 0): number {
  let s = bias;
  for (let i = 0; i < 5; i += 1) s += x[i] * w[i];
  return s;
}

export function project5to2(
  x: FeatureVector5,
  p: readonly [FeatureVector5, FeatureVector5]
): readonly [number, number] {
  return [scoreByCovector(x, p[0]), scoreByCovector(x, p[1])];
}
