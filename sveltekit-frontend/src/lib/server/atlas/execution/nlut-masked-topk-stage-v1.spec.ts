import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALIBRATED_COSINE_FLOOR_TAU,
  loadTensorrtBridgeAddonV1,
  runNlutMaskedTopKStageV1,
} from './nlut-masked-topk-stage-v1.js';

describe('runNlutMaskedTopKStageV1 (SearchRuntime Step 3)', () => {
  it('matches N-API tensorrt_bridge.node and TypeScript scalar fallback bit-for-bit with zero-alloc reuse', () => {
    const addon = loadTensorrtBridgeAddonV1();
    expect(addon).not.toBeNull();

    const n = 6;
    const dim = 3;
    const k = 3;
    const queryVector = new Float32Array([1, 0, 0]);
    const corpusMatrix = new Float32Array([
      0.99, 0.01, 0, // 0: masked OUT (0x02)
      0.85, 0.15, 0, // 1: active (0x01)
      0.95, 0.05, 0, // 2: active (0x03)
      0.10, 0.90, 0, // 3: active (0x01) -> below tau
      0.85, 0.15, 0, // 4: active (0x01) -> tie with 1, index 1 wins
      0.70, 0.30, 0, // 5: masked OUT (0x04)
    ]);
    const lutBytes = new Uint8Array([0x02, 0x01, 0x03, 0x01, 0x01, 0x04]);
    const allowedBytes = new Uint8Array([0x01, 0x03]);
    const outMask = new Uint32Array(1);
    const outIndices = new Int32Array(k);
    const outScores = new Float32Array(k);

    const nativeRes = runNlutMaskedTopKStageV1({
      queryVector,
      corpusMatrix,
      n,
      dim,
      k,
      lutBytes,
      allowedBytes,
      cosineFloorTau: DEFAULT_CALIBRATED_COSINE_FLOOR_TAU,
      outMask,
      outIndices,
      outScores,
      addon,
    });
    const tsRes = runNlutMaskedTopKStageV1({
      queryVector,
      corpusMatrix,
      n,
      dim,
      k,
      lutBytes,
      allowedBytes,
      cosineFloorTau: DEFAULT_CALIBRATED_COSINE_FLOOR_TAU,
      addon: null,
    });

    expect(nativeRes.backend).toBe('cpu_masked_bitset');
    expect(tsRes.backend).toBe('ts_scalar_masked');
    expect(nativeRes.evaluatedCount).toBe(4);
    expect(nativeRes.rejectedBelowTau).toBe(0);
    expect(nativeRes.hits).toEqual(tsRes.hits);
    expect(nativeRes.hits.map((h) => h.index)).toEqual([2, 1, 4]);
  });

  it('rejects orthogonal negative queries below calibrated cosine floor tau', () => {
    const res = runNlutMaskedTopKStageV1({
      queryVector: new Float32Array([0, 0, 1]),
      corpusMatrix: new Float32Array([1, 0, 0, 0.8, 0.2, 0]),
      n: 2,
      dim: 3,
      k: 2,
      lutBytes: new Uint8Array([0x01, 0x01]),
      allowedBytes: new Uint8Array([0x01]),
      cosineFloorTau: DEFAULT_CALIBRATED_COSINE_FLOOR_TAU,
    });

    expect(res.hits).toEqual([]);
    expect(res.rejectedBelowTau).toBe(2);
  });
});
