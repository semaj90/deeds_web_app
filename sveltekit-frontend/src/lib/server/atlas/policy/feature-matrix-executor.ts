import { createHash } from 'node:crypto';

export type FeatureMatrixBackend = 'AUTO' | 'CPU_REFERENCE' | 'NATIVE_GEMM';

export interface FeatureMatrixV1 {
  schema: 'atlas.feature-matrix.v1';
  featureRevision: number;
  rowIds: string[];
  featureNames: string[];
  /** Row-major N x F matrix. */
  values: number[][];
  /** Optional observation mask; false means missing/unobserved, not zero evidence. */
  observed?: boolean[][];
}

export interface LinearFeatureModelV1 {
  schema: 'atlas.linear-feature-model.v1';
  modelRevision: string;
  featureNames: string[];
  weights: number[];
  bias: number;
}

export interface FeatureMatrixExecutionReceiptV1 {
  schema: 'atlas.feature-matrix-execution-receipt.v1';
  featureRevision: number;
  modelRevision: string;
  requestedBackend: FeatureMatrixBackend;
  executedBackend: 'CPU_REFERENCE' | 'NATIVE_GEMM';
  fallbackReason?: string;
  rows: number;
  features: number;
  matrixHash: string;
  modelHash: string;
  outputHash: string;
  durationMs: number;
}

export interface FeatureMatrixExecutionResultV1 {
  scores: Array<{ rowId: string; score: number; activeWeight: number }>;
  receipt: FeatureMatrixExecutionReceiptV1;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function validateInput(matrix: FeatureMatrixV1, model: LinearFeatureModelV1) {
  if (matrix.schema !== 'atlas.feature-matrix.v1') throw new Error('Unsupported feature matrix schema');
  if (model.schema !== 'atlas.linear-feature-model.v1') throw new Error('Unsupported feature model schema');
  if (matrix.rowIds.length !== matrix.values.length) throw new Error('rowIds length must equal matrix row count');
  if (matrix.featureNames.length !== model.featureNames.length) throw new Error('feature count mismatch');
  if (model.weights.length !== model.featureNames.length) throw new Error('weight count mismatch');
  if (matrix.featureNames.some((name, i) => name !== model.featureNames[i])) {
    throw new Error('feature order mismatch; feature names are part of the mathematical contract');
  }
  const f = matrix.featureNames.length;
  matrix.values.forEach((row, index) => {
    if (row.length !== f) throw new Error(`row ${index} has wrong feature count`);
    if (!row.every(Number.isFinite)) throw new Error(`row ${index} contains non-finite feature values`);
  });
  if (!model.weights.every(Number.isFinite) || !Number.isFinite(model.bias)) {
    throw new Error('model contains non-finite values');
  }
  if (matrix.observed) {
    if (matrix.observed.length !== matrix.values.length) throw new Error('observed mask row count mismatch');
    matrix.observed.forEach((row, index) => {
      if (row.length !== f) throw new Error(`observed row ${index} has wrong feature count`);
    });
  }
}

/**
 * Readable oracle for a presence-aware linear scorer.
 *
 * score_i = bias + sum_{j observed} w_j x_ij / sum_{j observed} |w_j|
 *
 * Dividing by active absolute weight keeps "not computed" distinct from an
 * observed zero while supporting signed learned coefficients. When no feature
 * is observed, the score is just the bias.
 */
export function executeLinearFeatureMatrixCpu(
  matrix: FeatureMatrixV1,
  model: LinearFeatureModelV1,
): Array<{ rowId: string; score: number; activeWeight: number }> {
  validateInput(matrix, model);
  return matrix.values.map((row, i) => {
    let weighted = 0;
    let activeWeight = 0;
    for (let j = 0; j < row.length; j++) {
      if (matrix.observed && matrix.observed[i]?.[j] === false) continue;
      const w = model.weights[j];
      weighted += w * row[j];
      activeWeight += Math.abs(w);
    }
    return {
      rowId: matrix.rowIds[i],
      score: model.bias + (activeWeight > 0 ? weighted / activeWeight : 0),
      activeWeight,
    };
  });
}

type NativeMatrixAddon = {
  matrixMultiply?: (
    a: Float32Array,
    rowsA: number,
    colsA: number,
    b: Float32Array,
    colsB: number,
  ) => Float32Array;
};

async function loadNativeMatrixAddon(): Promise<NativeMatrixAddon | null> {
  try {
    const bridge = await import('$lib/server/gpu/libtorch-bridge.js');
    const addon = bridge.getAddonInternal?.() as NativeMatrixAddon | null | undefined;
    return addon ?? null;
  } catch {
    return null;
  }
}

/**
 * Stable app-side dispatch boundary. The current addon does not yet export the
 * generic `matrixMultiply` primitive, so AUTO truthfully falls back to the CPU
 * oracle. Once the N-API binding is added, callers need no changes.
 */
export async function executeLinearFeatureMatrix(
  matrix: FeatureMatrixV1,
  model: LinearFeatureModelV1,
  requestedBackend: FeatureMatrixBackend = 'AUTO',
): Promise<FeatureMatrixExecutionResultV1> {
  validateInput(matrix, model);
  const started = performance.now();
  let executedBackend: FeatureMatrixExecutionReceiptV1['executedBackend'] = 'CPU_REFERENCE';
  let fallbackReason: string | undefined;
  let scores: Array<{ rowId: string; score: number; activeWeight: number }>;

  const native = requestedBackend === 'CPU_REFERENCE' ? null : await loadNativeMatrixAddon();
  const canUseNative = Boolean(native?.matrixMultiply) && !matrix.observed;

  if (requestedBackend === 'NATIVE_GEMM' && !canUseNative) {
    fallbackReason = matrix.observed
      ? 'native_presence_mask_not_supported'
      : 'native_matrix_multiply_unavailable';
  }

  if (canUseNative && native?.matrixMultiply) {
    const n = matrix.values.length;
    const f = matrix.featureNames.length;
    const flat = new Float32Array(n * f);
    matrix.values.forEach((row, i) => row.forEach((value, j) => {
      flat[i * f + j] = value;
    }));
    const weights = new Float32Array(model.weights);
    const raw = native.matrixMultiply(flat, n, f, weights, 1);
    const activeWeight = model.weights.reduce((sum, w) => sum + Math.abs(w), 0);
    scores = matrix.rowIds.map((rowId, i) => ({
      rowId,
      score: model.bias + (activeWeight > 0 ? raw[i] / activeWeight : 0),
      activeWeight,
    }));
    executedBackend = 'NATIVE_GEMM';
  } else {
    scores = executeLinearFeatureMatrixCpu(matrix, model);
    if (requestedBackend === 'AUTO' && !native?.matrixMultiply) {
      fallbackReason = 'native_matrix_multiply_unavailable';
    }
  }

  const matrixHash = sha256({
    featureRevision: matrix.featureRevision,
    rowIds: matrix.rowIds,
    featureNames: matrix.featureNames,
    values: matrix.values,
    observed: matrix.observed ?? null,
  });
  const modelHash = sha256(model);
  const outputHash = sha256(scores);

  return {
    scores,
    receipt: {
      schema: 'atlas.feature-matrix-execution-receipt.v1',
      featureRevision: matrix.featureRevision,
      modelRevision: model.modelRevision,
      requestedBackend,
      executedBackend,
      fallbackReason,
      rows: matrix.values.length,
      features: matrix.featureNames.length,
      matrixHash,
      modelHash,
      outputHash,
      durationMs: performance.now() - started,
    },
  };
}
