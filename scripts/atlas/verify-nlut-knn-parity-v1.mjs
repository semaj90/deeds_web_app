#!/usr/bin/env node
/**
 * CPU-AVX2-01c: Exact KNN order & tie-breaking parity + negative-query leakage check
 * feeding matchNesLutMask Uint32Array bitset into batchCosineTopKMasked.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const addonCandidates = process.env.ATLAS_ADDON_PATH
  ? [resolve(ROOT, process.env.ATLAS_ADDON_PATH)]
  : [
  resolve(ROOT, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge/cpp/build-x64-fallback/Release/tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge/build/Release/tensorrt_bridge.node'),
  ];
const addonPath = addonCandidates.find((p) => existsSync(p));
if (!addonPath) throw new Error('TENSORRT_BRIDGE_NODE_NOT_FOUND');
const addon = require(addonPath);

function scalarMaskedTopK(query, corpus, n, dim, k, mask) {
  let qNormSq = 0;
  for (let d = 0; d < dim; d++) qNormSq += query[d] * query[d];
  const qNorm = Math.sqrt(qNormSq);
  const hits = [];
  for (let i = 0; i < n; i++) {
    if (((mask[i >>> 5] >>> (i & 31)) & 1) === 0) continue;
    let dot = 0;
    let rNormSq = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) {
      const rv = corpus[base + d];
      dot += query[d] * rv;
      rNormSq += rv * rv;
    }
    const denom = qNorm * Math.sqrt(rNormSq);
    hits.push({ idx: i, score: denom > 0 ? Math.fround(dot / denom) : 0 });
  }
  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));
  return hits.slice(0, k);
}

// Frozen 10-symbol cohort (dim=4); indices 2 & 5 are exact ties to verify lowest-index tie-breaking.
const n = 10;
const dim = 4;
const k = 3;
const lut = new Uint8Array([0x01, 0x02, 0x01, 0x03, 0x01, 0x01, 0x04, 0x01, 0x02, 0x01]);
const allowed = new Uint8Array([0x01, 0x03]);
const activeMask = addon.matchNesLutMask(lut, allowed, 0);

const corpus = new Float32Array([
  0.90, 0.10, 0.00, 0.00, // 0 (active)
  0.99, 0.01, 0.00, 0.00, // 1 (masked OUT by 0x02)
  0.80, 0.20, 0.00, 0.00, // 2 (active, tie with 5)
  0.70, 0.30, 0.00, 0.00, // 3 (active)
  0.10, 0.90, 0.00, 0.00, // 4 (active)
  0.80, 0.20, 0.00, 0.00, // 5 (active, tie with 2 -> 2 must win)
  0.95, 0.05, 0.00, 0.00, // 6 (masked OUT by 0x04)
  0.60, 0.40, 0.00, 0.00, // 7 (active)
  0.98, 0.02, 0.00, 0.00, // 8 (masked OUT by 0x02)
  0.50, 0.50, 0.00, 0.00, // 9 (active)
]);

const positiveQueries = Array.from({ length: 10 }, (_, qi) =>
  new Float32Array([1.0 - qi * 0.04, qi * 0.04, 0.0, 0.0])
);
const negativeQueries = Array.from({ length: 5 }, () => new Float32Array([0.0, 0.0, 1.0, 0.0]));
const cosineFloor = 0.55;

const outIdx = new Int32Array(k);
const outScores = new Float32Array(k);

for (let qi = 0; qi < positiveQueries.length; qi++) {
  const q = positiveQueries[qi];
  const expected = scalarMaskedTopK(q, corpus, n, dim, k, activeMask);
  const actual = addon.batchCosineTopKMasked(q, corpus, n, dim, k, activeMask, outIdx, outScores);
  if (actual.indices !== outIdx || actual.scores !== outScores) {
    throw new Error(`CALLER_OUTPUT_BUFFER_NOT_REUSED_Q${qi}`);
  }
  if (actual.count !== expected.length || actual.evaluatedCount !== 7) {
    throw new Error(`KNN_COUNT_MISMATCH_Q${qi}`);
  }
  for (let j = 0; j < expected.length; j++) {
    if (actual.indices[j] !== expected[j].idx || Math.abs(actual.scores[j] - expected[j].score) > 1e-6) {
      throw new Error(`KNN_PARITY_MISMATCH_Q${qi}_RANK${j}`);
    }
  }
}

const fallbackExpected = scalarMaskedTopK(positiveQueries[0], corpus, n, dim, k, activeMask);
if (fallbackExpected[1]?.idx !== 2 || fallbackExpected[2]?.idx !== 5) {
  throw new Error('KNN_SCALAR_ORACLE_TIE_FIXTURE_INVALID');
}
const fallbackOutput = addon.batchCosineTopKMasked(positiveQueries[0], corpus, n, dim, k, activeMask);
if (fallbackOutput.count !== fallbackExpected.length
    || fallbackOutput.indices.some((idx, i) => idx !== fallbackExpected[i]?.idx)
    || fallbackOutput.scores.some((score, i) => Math.abs(score - fallbackExpected[i]?.score) > 1e-6)) {
  throw new Error('KNN_FALLBACK_OUTPUT_PARITY_MISMATCH');
}

let shortMaskRefused = false;
try {
  addon.batchCosineTopKMasked(positiveQueries[0], corpus, n, dim, k, new Uint32Array(0));
} catch (error) {
  shortMaskRefused = String(error?.message ?? error).includes('invalid batchCosineTopKMasked dimensions or mask length');
}
if (!shortMaskRefused) throw new Error('KNN_SHORT_MASK_NOT_REFUSED');

// Exercise the O(k) vector-backed heap branch (k > 64) against the CPU oracle.
const largeN = 96;
const largeDim = 4;
const largeK = 65;
const largeQuery = new Float32Array([1, 0, 0, 0]);
const largeCorpus = new Float32Array(largeN * largeDim);
const largeMask = new Uint32Array(Math.ceil(largeN / 32));
for (let i = 0; i < largeN; i++) {
  largeCorpus[i * largeDim] = 1 - (i / 200);
  largeCorpus[i * largeDim + 1] = i / 200;
  largeMask[i >>> 5] |= (1 << (i & 31));
}
const largeExpected = scalarMaskedTopK(largeQuery, largeCorpus, largeN, largeDim, largeK, largeMask);
const largeActual = addon.batchCosineTopKMasked(largeQuery, largeCorpus, largeN, largeDim, largeK, largeMask);
if (largeActual.count !== largeExpected.length
    || largeActual.indices.some((idx, i) => idx !== largeExpected[i]?.idx)
    || largeActual.scores.some((score, i) => Math.abs(score - largeExpected[i]?.score) > 1e-6)) {
  throw new Error('KNN_LARGE_K_HEAP_PARITY_MISMATCH');
}

function assertNonFiniteRefused(query, candidateCorpus, label) {
  let refused = false;
  try {
    addon.batchCosineTopKMasked(query, candidateCorpus, 1, 2, 1, new Uint32Array([1]));
  } catch (error) {
    refused = String(error?.message ?? error).includes('query and active corpus values must be finite');
  }
  if (!refused) throw new Error(`KNN_NONFINITE_${label}_NOT_REFUSED`);
}
assertNonFiniteRefused(new Float32Array([Number.NaN, 0]), new Float32Array([1, 0]), 'QUERY');
assertNonFiniteRefused(new Float32Array([1, 0]), new Float32Array([1, Number.NaN]), 'CORPUS');

let negativeLeaks = 0;
for (const nq of negativeQueries) {
  const res = addon.batchCosineTopKMasked(nq, corpus, n, dim, k, activeMask, outIdx, outScores);
  if (res.scores[0] >= cosineFloor) negativeLeaks++;
}
if (negativeLeaks !== 0) {
  throw new Error(`NEGATIVE_QUERY_LEAKAGE:${negativeLeaks}`);
}

console.log(JSON.stringify({
  status: 'KNN_ORDER_PARITY_PROVEN',
  scope: 'synthetic 10-row CPU fixture plus 96-row k=65 heap-path fixture; not SearchRuntime integration',
  positiveQueriesChecked: positiveQueries.length,
  negativeQueriesChecked: negativeQueries.length,
  negativeLeaks,
  cosineFloor,
  tieBreakVerified: true,
  callerOutputBuffersReused: true,
  fallbackOutputParity: true,
  largeKVectorHeapParity: true,
  adversarialChecks: { shortMaskRefused, nonFiniteQueryRefused: true, nonFiniteActiveRowRefused: true },
}, null, 2));
