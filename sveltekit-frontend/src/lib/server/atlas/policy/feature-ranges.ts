export const NUMERIC_EPSILON = 1e-8;

export type NormalizationMode = 'MINMAX' | 'LOG1P_MINMAX' | 'IDENTITY';

export interface FeatureRange {
  min: number;
  max: number;
  mode: NormalizationMode;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function safeLog(value: number, epsilon = NUMERIC_EPSILON): number {
  return Math.log(Math.max(value, epsilon));
}

export function normalizeByRange(value: number, range: FeatureRange): number {
  if (range.mode === 'IDENTITY') return Number.isFinite(value) ? value : 0;
  if (range.mode === 'LOG1P_MINMAX') {
    const lo = Math.log1p(Math.max(0, range.min));
    const hi = Math.log1p(Math.max(0, range.max));
    const x = Math.log1p(clamp(value, range.min, range.max));
    return (x - lo) / Math.max(hi - lo, NUMERIC_EPSILON);
  }
  const x = clamp(value, range.min, range.max);
  return (x - range.min) / Math.max(range.max - range.min, NUMERIC_EPSILON);
}
