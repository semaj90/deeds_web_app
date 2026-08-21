#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const DIM = 768;
const N = 256;
const K10 = 10;
const K50 = 50;
const MAX_ABS_ERROR_LIMIT = 0.005;
const MEAN_ABS_ERROR_LIMIT = 0.001;
const RECALL10_LIMIT = 0.95;
const RECALL50_LIMIT = 0.98;
const outPath = path.resolve('.tmp/gpu-fp16-cosine-parity.json');
mkdirSync(path.dirname(outPath), { recursive: true });

function candidatePaths() {
  return [
    process.env.TENSORRT_BRIDGE_NODE_PATH?.trim(),
    path.resolve('simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    path.resolve('../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    path.resolve('../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  ].filter(Boolean);
}

function prng(seed = 0xA71A5) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function normalizedVector(random) {
  const out = new Float32Array(DIM);
  let norm2 = 0;
  for (let i = 0; i < DIM; i++) {
    const value = random();
    out[i] = value;
    norm2 += value * value;
  }
  const inv = 1 / Math.sqrt(norm2 || 1);
  for (let i = 0; i < DIM; i++) out[i] *= inv;
  return out;
}

function topK(scores, k) {
  return Array.from(scores, (score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, k)
    .map((item) => item.index);
}

function recall(reference, candidate) {
  const chosen = new Set(candidate);
  let hits = 0;
  for (const id of reference) if (chosen.has(id)) hits++;
  return hits / reference.length;
}

const addonPath = candidatePaths().find((candidate) => existsSync(candidate));
const report = {
  schema: 'atlas.gpu-fp16-cosine-parity.v1',
  timestamp: new Date().toISOString(),
  addonPath: addonPath ?? null,
  dimension: DIM,
  candidates: N,
  seed: '0xA71A5',
  thresholds: {
    maxAbsError: MAX_ABS_ERROR_LIMIT,
    meanAbsError: MEAN_ABS_ERROR_LIMIT,
    recallAt10: RECALL10_LIMIT,
    recallAt50: RECALL50_LIMIT,
  },
  metrics: null,
  cudaAvailableCode: null,
  status: 'NOT_RUN',
  productionPromotion: 'NOT_AUTHORIZED',
  reason: null,
};

try {
  if (!addonPath) throw new Error('NATIVE_ADDON_NOT_FOUND');
  const addon = require(addonPath);
  if (typeof addon.batchCosineSimilarity !== 'function') throw new Error('FP32_COSINE_EXPORT_MISSING');
  if (typeof addon.batchCosineSimilarity_fp16 !== 'function') throw new Error('FP16_COSINE_EXPORT_MISSING');
  if (typeof addon.checkCudaAvailable !== 'function') throw new Error('CHECK_CUDA_EXPORT_MISSING');

  const cudaCode = addon.checkCudaAvailable();
  report.cudaAvailableCode = cudaCode;
  if (!(Number.isInteger(cudaCode) && cudaCode > 0)) throw new Error(`CUDA_NOT_AVAILABLE:${cudaCode}`);

  const random = prng();
  const query = normalizedVector(random);
  const corpus = new Float32Array(N * DIM);
  for (let row = 0; row < N; row++) corpus.set(normalizedVector(random), row * DIM);
  // Force a known top hit without making all candidates trivially identical.
  corpus.set(query, 0);

  const fp32 = new Float32Array(N);
  const fp32Rc = addon.batchCosineSimilarity(query, DIM, corpus, N, fp32, N);
  if (fp32Rc !== 0) throw new Error(`FP32_COSINE_FAILED:${fp32Rc}`);
  const fp16 = addon.batchCosineSimilarity_fp16(query, corpus, N, DIM);
  if (!(fp16 instanceof Float32Array) || fp16.length !== N) throw new Error('FP16_COSINE_SHAPE_INVALID');

  let maxAbsError = 0;
  let sumAbsError = 0;
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(fp32[i]) || !Number.isFinite(fp16[i])) throw new Error(`NON_FINITE_SCORE:${i}`);
    const error = Math.abs(fp32[i] - fp16[i]);
    if (error > maxAbsError) maxAbsError = error;
    sumAbsError += error;
  }
  const meanAbsError = sumAbsError / N;
  const fp32Top10 = topK(fp32, K10);
  const fp16Top10 = topK(fp16, K10);
  const fp32Top50 = topK(fp32, K50);
  const fp16Top50 = topK(fp16, K50);
  const recallAt10 = recall(fp32Top10, fp16Top10);
  const recallAt50 = recall(fp32Top50, fp16Top50);
  const top1Agreement = fp32Top10[0] === fp16Top10[0];

  report.metrics = {
    maxAbsError,
    meanAbsError,
    recallAt10,
    recallAt50,
    top1Agreement,
    fp32Top1: fp32Top10[0],
    fp16Top1: fp16Top10[0],
  };

  const passed = maxAbsError <= MAX_ABS_ERROR_LIMIT
    && meanAbsError <= MEAN_ABS_ERROR_LIMIT
    && recallAt10 >= RECALL10_LIMIT
    && recallAt50 >= RECALL50_LIMIT
    && top1Agreement;
  report.status = passed ? 'FP16_NUMERIC_PARITY_PROVEN' : 'FP16_NUMERIC_PARITY_FAILED';
  if (!passed) report.reason = 'PREDECLARED_PARITY_THRESHOLDS_NOT_MET';
} catch (error) {
  report.status = 'FP16_NUMERIC_PARITY_NOT_PROVEN';
  report.reason = error instanceof Error ? error.message : String(error);
}

writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'FP16_NUMERIC_PARITY_PROVEN') process.exitCode = 1;
