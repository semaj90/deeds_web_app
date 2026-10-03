#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const addonPath = process.argv[2];
if (!addonPath || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/gpu/prove-batch-cosine-topk-v1.mjs <absolute-addon-path>');
}

const resolvedAddonPath = path.resolve(addonPath);
const require = createRequire(import.meta.url);
const addon = require(resolvedAddonPath);
assert.equal(typeof addon.batchCosineTopK, 'function', 'new combined executor must be exported');

const query = new Float32Array([1, 0]);
const corpus = new Float32Array([0, 1, 1, 0, 0.8, 0.6, -1, 0]);
const backendInfo = addon.getBackendInfo();
const declaredBackend = backendInfo.per_export_backend?.batchCosineTopK?.backend;
assert.ok(['libtorch_cuda', 'cpu_fallback'].includes(declaredBackend), `unexpected backend: ${declaredBackend}`);

addon.resetExecutionCounters();
const result = addon.batchCosineTopK(query, corpus, 4, 2, 2);
assert.deepEqual(Array.from(result.indices), [1, 2]);
assert.equal(result.indices.constructor, Int32Array);
assert.equal(result.scores.constructor, Float32Array);
assert.ok(Math.abs(result.scores[0] - 1) <= 1e-6);
assert.ok(Math.abs(result.scores[1] - 0.8) <= 1e-6);
assert.equal(result.backend, declaredBackend === 'libtorch_cuda' ? 'cuda_cublas' : 'cpu');

const counters = addon.getExecutionCounters();
if (result.backend === 'cuda_cublas') {
  assert.equal(counters.cuda_execution, 1, 'CUDA branch must be counted inside the executor');
  assert.equal(counters.cpu_fallback, 0);
} else {
  assert.equal(counters.cpu_fallback, 1, 'CPU branch must be counted inside the executor');
  assert.equal(counters.cuda_execution, 0);
}

assert.throws(() => addon.batchCosineTopK(new Float64Array([1, 0]), corpus, 4, 2, 2));
assert.throws(() => addon.batchCosineTopK(query, corpus, 4, 2, 5));
assert.throws(() => addon.batchCosineTopK(new Float32Array([Number.NaN, 0]), corpus, 4, 2, 2));

console.log(JSON.stringify({
  schema: 'atlas.batch-cosine-topk-proof.v1',
  status: result.backend === 'cuda_cublas' ? 'CUDA_PARITY_PROVEN' : 'CPU_PARITY_PROVEN',
  backend: result.backend,
  indices: Array.from(result.indices),
  scores: Array.from(result.scores),
  executionCounters: counters,
  invalidInputsRejected: true,
  candidateSet: 'four local vectors only',
  datastoreWrites: false,
  modelCalls: false,
}, null, 2));
