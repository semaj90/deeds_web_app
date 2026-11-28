/**
 * N-API / TypeScript-fallback NES-LUT bitmask + calibrated-floor Top-K stage for SearchRuntime (Step 3).
 *
 * Uses `matchNesLutMask` -> `batchCosineTopKMasked` in `tensorrt_bridge.node` with caller-owned
 * TypedArray reuse when available, and falls back deterministically to the scalar TypeScript oracle.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const DEFAULT_CALIBRATED_COSINE_FLOOR_TAU = 0.6172;

export interface NlutMaskedTopKAddonV1 {
  nesLutSupportsAvx2?: () => number;
  matchNesLutMask: (
    lut: Uint8Array,
    allowed: Uint8Array,
    forceScalar?: number,
    out?: Uint32Array,
  ) => Uint32Array;
  batchCosineTopKMasked: (
    query: Float32Array,
    corpus: Float32Array,
    n: number,
    dim: number,
    k: number,
    activeMask: Uint32Array,
    outIndices?: Int32Array,
    outScores?: Float32Array,
  ) => {
    indices: Int32Array;
    scores: Float32Array;
    count: number;
    evaluatedCount: number;
    backend: string;
  };
}

export interface NlutMaskedTopKInputV1 {
  queryVector: Float32Array;
  corpusMatrix: Float32Array;
  n: number;
  dim: number;
  k: number;
  lutBytes: Uint8Array;
  allowedBytes: Uint8Array;
  cosineFloorTau?: number;
  outMask?: Uint32Array;
  outIndices?: Int32Array;
  outScores?: Float32Array;
  addon?: NlutMaskedTopKAddonV1 | null;
}

export interface NlutMaskedTopKHitV1 {
  index: number;
  score: number;
}

export interface NlutMaskedTopKResultV1 {
  hits: NlutMaskedTopKHitV1[];
  evaluatedCount: number;
  rejectedBelowTau: number;
  calibratedTau: number;
  backend: string;
}

export function loadTensorrtBridgeAddonV1(cwd = process.cwd()): NlutMaskedTopKAddonV1 | null {
  const candidates = [
    resolve(cwd, '../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    resolve(cwd, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    resolve(cwd, '../simd-bridge/cpp/build-x64-fallback/Release/tensorrt_bridge.node'),
    resolve(cwd, '../simd-bridge/build/Release/tensorrt_bridge.node'),
  ];
  const addonPath = candidates.find((p) => existsSync(p));
  if (!addonPath) return null;
  try {
    const req = createRequire(import.meta.url);
    const loaded = req(addonPath) as Partial<NlutMaskedTopKAddonV1>;
    if (typeof loaded.matchNesLutMask !== 'function' || typeof loaded.batchCosineTopKMasked !== 'function') {
      return null;
    }
    return loaded as NlutMaskedTopKAddonV1;
  } catch {
    return null;
  }
}

function scalarMatchNesLutMask(lut: Uint8Array, allowed: Uint8Array, out?: Uint32Array): Uint32Array {
  if (allowed.length === 0 || allowed.length > 16) throw new RangeError('NES_LUT_ALLOWED_COUNT_INVALID');
  const allowedSet = new Set<number>();
  for (let i = 0; i < allowed.length; i++) {
    const v = allowed[i]!;
    if (allowedSet.has(v)) throw new RangeError('NES_LUT_ALLOWED_DUPLICATE');
    allowedSet.add(v);
  }
  const words = Math.ceil(lut.length / 32);
  const mask = out && out.length >= words ? out : new Uint32Array(words);
  if (out) mask.fill(0, 0, words);
  for (let i = 0; i < lut.length; i++) {
    if (allowedSet.has(lut[i]!)) {
      mask[i >> 5] |= (1 << (i & 31)) >>> 0;
    }
  }
  return mask;
}

function scalarBatchCosineTopKMasked(
  query: Float32Array,
  corpus: Float32Array,
  n: number,
  dim: number,
  k: number,
  activeMask: Uint32Array,
  outIndices?: Int32Array,
  outScores?: Float32Array,
) {
  let qNormSq = 0;
  for (let d = 0; d < dim; d++) qNormSq += query[d]! * query[d]!;
  const qNorm = Math.sqrt(qNormSq);

  const scored: NlutMaskedTopKHitV1[] = [];
  let evaluatedCount = 0;
  for (let i = 0; i < n; i++) {
    if (((activeMask[i >> 5]! >>> (i & 31)) & 1) === 0) continue;
    evaluatedCount++;
    let dot = 0;
    let rNormSq = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) {
      const rv = corpus[base + d]!;
      dot += query[d]! * rv;
      rNormSq += rv * rv;
    }
    const denom = qNorm * Math.sqrt(rNormSq);
    scored.push({ index: i, score: denom > 0 ? Math.fround(dot / denom) : 0 });
  }
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  const count = Math.min(k, scored.length);
  const indices = outIndices && outIndices.length >= count ? outIndices : new Int32Array(count);
  const scores = outScores && outScores.length >= count ? outScores : new Float32Array(count);
  for (let j = 0; j < count; j++) {
    indices[j] = scored[j]!.index;
    scores[j] = scored[j]!.score;
  }
  return { indices, scores, count, evaluatedCount, backend: 'ts_scalar_masked' };
}

export function runNlutMaskedTopKStageV1(input: NlutMaskedTopKInputV1): NlutMaskedTopKResultV1 {
  const { queryVector, corpusMatrix, n, dim, k, lutBytes, allowedBytes } = input;
  if (n <= 0 || dim <= 0 || k <= 0) throw new RangeError('NLUT_TOPK_DIMENSIONS_INVALID');
  if (lutBytes.length !== n) throw new RangeError('NLUT_LENGTH_MISMATCH');
  if (queryVector.length < dim || corpusMatrix.length < n * dim) throw new RangeError('NLUT_VECTOR_BUFFER_TOO_SMALL');

  const calibratedTau = input.cosineFloorTau ?? DEFAULT_CALIBRATED_COSINE_FLOOR_TAU;
  const addon = input.addon === undefined ? loadTensorrtBridgeAddonV1() : input.addon;

  const res = addon
    ? (() => {
        const mask = addon.matchNesLutMask(lutBytes, allowedBytes, 0, input.outMask);
        return addon.batchCosineTopKMasked(
          queryVector,
          corpusMatrix,
          n,
          dim,
          k,
          mask,
          input.outIndices,
          input.outScores,
        );
      })()
    : (() => {
        const mask = scalarMatchNesLutMask(lutBytes, allowedBytes, input.outMask);
        return scalarBatchCosineTopKMasked(
          queryVector,
          corpusMatrix,
          n,
          dim,
          k,
          mask,
          input.outIndices,
          input.outScores,
        );
      })();

  const hits: NlutMaskedTopKHitV1[] = [];
  let rejectedBelowTau = 0;
  for (let j = 0; j < res.count; j++) {
    const score = res.scores[j]!;
    if (score >= calibratedTau) {
      hits.push({ index: res.indices[j]!, score });
    } else {
      rejectedBelowTau++;
    }
  }

  return {
    hits,
    evaluatedCount: res.evaluatedCount,
    rejectedBelowTau,
    calibratedTau,
    backend: res.backend,
  };
}
