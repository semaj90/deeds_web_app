import { describe, expect, it } from 'vitest';
import {
  executeLinearFeatureMatrix,
  executeLinearFeatureMatrixCpu,
  type FeatureMatrixV1,
  type LinearFeatureModelV1,
} from './feature-matrix-executor.js';

const model: LinearFeatureModelV1 = {
  schema: 'atlas.linear-feature-model.v1',
  modelRevision: 'linear-test-v1',
  featureNames: ['semantic', 'pagerank', 'hyperedge'],
  weights: [0.4, 0.2, -0.1],
  bias: 0.05,
};

const matrix: FeatureMatrixV1 = {
  schema: 'atlas.feature-matrix.v1',
  featureRevision: 12,
  rowIds: ['A', 'B'],
  featureNames: ['semantic', 'pagerank', 'hyperedge'],
  values: [
    [0.8, 1.0, 0.5],
    [0.7, 0.0, 1.0],
  ],
};

describe('FeatureMatrixExecutorV1', () => {
  it('computes the readable presence-aware linear equation deterministically', () => {
    const first = executeLinearFeatureMatrixCpu(matrix, model);
    const second = executeLinearFeatureMatrixCpu(matrix, model);
    expect(first).toEqual(second);

    // A: 0.05 + (0.4*.8 + 0.2*1 - 0.1*.5) / (0.4+0.2+0.1)
    expect(first[0].score).toBeCloseTo(0.05 + 0.47 / 0.7, 12);
  });

  it('distinguishes unobserved evidence from observed zero', () => {
    const masked: FeatureMatrixV1 = {
      ...matrix,
      rowIds: ['missing', 'zero'],
      values: [
        [0.8, 0, 0],
        [0.8, 0, 0],
      ],
      observed: [
        [true, false, false],
        [true, true, true],
      ],
    };
    const rows = executeLinearFeatureMatrixCpu(masked, model);

    expect(rows[0].activeWeight).toBeCloseTo(0.4, 12);
    expect(rows[0].score).toBeCloseTo(0.85, 12);
    expect(rows[1].activeWeight).toBeCloseTo(0.7, 12);
    expect(rows[1].score).toBeCloseTo(0.05 + 0.32 / 0.7, 12);
  });

  it('rejects feature-order drift', () => {
    expect(() => executeLinearFeatureMatrixCpu(
      { ...matrix, featureNames: ['pagerank', 'semantic', 'hyperedge'] },
      model,
    )).toThrow(/feature order mismatch/);
  });

  it('emits deterministic hashes for the CPU reference path', async () => {
    const first = await executeLinearFeatureMatrix(matrix, model, 'CPU_REFERENCE');
    const second = await executeLinearFeatureMatrix(matrix, model, 'CPU_REFERENCE');

    expect(first.receipt.executedBackend).toBe('CPU_REFERENCE');
    expect(first.receipt.matrixHash).toBe(second.receipt.matrixHash);
    expect(first.receipt.modelHash).toBe(second.receipt.modelHash);
    expect(first.receipt.outputHash).toBe(second.receipt.outputHash);
  });
});
