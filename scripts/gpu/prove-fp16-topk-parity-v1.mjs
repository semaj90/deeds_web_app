#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const addonPath = process.argv[2];
if (!addonPath || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/gpu/prove-fp16-topk-parity-v1.mjs <absolute-addon-path>');
}
const require = createRequire(import.meta.url);
const addon = require(path.resolve(addonPath));
const n = 64;
const dim = 768;
const k = 10;
const query = new Float32Array(dim);
query[0] = 1;
const corpus = new Float32Array(n * dim);
for (let row = 0; row < n; row += 1) {
  const cosine = 0.15 + (row * 0.01);
  const offset = row * dim;
  corpus[offset] = cosine;
  corpus[offset + 1] = Math.sqrt(1 - cosine * cosine);
}

const backendInfo = addon.getBackendInfo();
assert.equal(backendInfo.per_export_backend?.batchCosineSimilarity?.backend, 'libtorch_cuda');
assert.equal(backendInfo.per_export_backend?.batchCosineSimilarity_fp16?.backend, 'libtorch_cuda');

function topK(scores, limit) {
  return Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a] || a - b).slice(0, limit);
}

const fp32Scores = new Float32Array(n);
addon.resetExecutionCounters();
assert.equal(addon.batchCosineSimilarity(query, dim, corpus, n, fp32Scores, n), 0);
const fp32Counters = addon.getExecutionCounters();
assert.equal(fp32Counters.cuda_execution, 1);
assert.equal(fp32Counters.cpu_fallback, 0);

addon.resetExecutionCounters();
const fp16Scores = addon.batchCosineSimilarity_fp16(query, corpus, n, dim);
const fp16Counters = addon.getExecutionCounters();
assert.equal(fp16Counters.cuda_execution, 1);
assert.equal(fp16Counters.cpu_fallback, 0);
assert.equal(fp16Scores.length, n);

let maxAbsoluteScoreError = 0;
for (let i = 0; i < n; i += 1) {
  assert.ok(Number.isFinite(fp32Scores[i]) && Number.isFinite(fp16Scores[i]), `non-finite score at ${i}`);
  maxAbsoluteScoreError = Math.max(maxAbsoluteScoreError, Math.abs(fp32Scores[i] - fp16Scores[i]));
}
const fp32Ranking = topK(fp32Scores, n);
const fp16Ranking = topK(fp16Scores, n);
const fp32TopK = fp32Ranking.slice(0, k);
const fp16TopK = fp16Ranking.slice(0, k);
assert.deepEqual(fp16TopK, fp32TopK, 'FP16 and FP32 top-k order must agree');
const cutoffMargin = fp32Scores[fp32Ranking[k - 1]] - fp32Scores[fp32Ranking[k]];
assert.ok(cutoffMargin > 2 * maxAbsoluteScoreError, 'fixture cutoff must remain safely outside score error');

console.log(JSON.stringify({
  schema: 'atlas.fp16-topk-parity-proof.v1',
  status: 'CUDA_PARITY_PROVEN',
  backend: 'libtorch_cuda',
  rows: n,
  dimensions: dim,
  k,
  topKOverlap: fp32TopK.filter((index) => fp16TopK.includes(index)).length,
  exactTopKOrderMatch: true,
  maxAbsoluteScoreError,
  cutoffMargin,
  finiteScores: true,
  fp32ExecutionCounters: fp32Counters,
  fp16ExecutionCounters: fp16Counters,
  datastoreWrites: false,
  modelCalls: false,
}, null, 2));
