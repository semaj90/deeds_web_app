#!/usr/bin/env node

/**
 * Bounded branch-counter smoke for an explicitly selected out-of-tree addon.
 * This exercises only tiny in-memory inputs; it does not test numerical parity
 * or touch any datastore. Pass the addon path as the sole argument.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const addonPath = process.argv[2];
if (!addonPath || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/gpu/probe-native-execution-counters.mjs <absolute-addon-path>');
}
const resolvedAddonPath = path.resolve(addonPath);
const require = createRequire(import.meta.url);
const addon = require(resolvedAddonPath);
const categories = ['cuda_execution', 'cpu_fallback', 'stub_invocation', 'cuda_error_fallback', 'oom_fallback'];

function zeroCounters() {
  const counters = addon.getExecutionCounters();
  for (const category of categories) assert.equal(counters[category], 0, `${category} must be zero after reset`);
}

addon.resetExecutionCounters();
zeroCounters();

const query = new Float32Array([1, 0]);
const corpus = new Float32Array([1, 0, 0, 1]);
const scores = new Float32Array(2);
const backendInfo = addon.getBackendInfo();
const batchBackend = backendInfo.per_export_backend?.batchCosineSimilarity?.backend;
addon.resetExecutionCounters();
addon.batchCosineSimilarity(query, 2, corpus, 2, scores, 2);
assert.deepEqual([...scores], [1, 0]);
const branchCounters = addon.getExecutionCounters();

if (batchBackend === 'libtorch_cuda') {
  assert.equal(branchCounters.cuda_execution, 1, 'actual LibTorch CUDA branch must increment in the implementation');
  assert.equal(branchCounters.cpu_fallback, 0);
} else {
  assert.equal(branchCounters.cpu_fallback, 1, 'CPU implementation/fallback must increment in the implementation');
  assert.equal(branchCounters.cuda_execution, 0);
}

let stubCounters = null;
if (backendInfo.per_export_backend?.pageRankGPU?.backend === 'no_libtorch_stub') {
  addon.resetExecutionCounters();
  assert.throws(() => addon.pageRankGPU(new Float32Array([0, 1, 1, 0]), 2, 0.85, 4));
  stubCounters = addon.getExecutionCounters();
  assert.equal(stubCounters.stub_invocation, 1, 'stub call must increment inside the stub');
  assert.equal(stubCounters.cuda_execution, 0);
}

console.log(JSON.stringify({
  schema: 'atlas.native-execution-counter-smoke.v1',
  addonPath: resolvedAddonPath,
  backend: batchBackend,
  scores: [...scores],
  branchCounters,
  stubCounters,
  errorAndOomFallbacks: 'instrumented in implementation; not force-injected by this bounded smoke',
  parityProven: false,
  datastoreWrites: false,
}, null, 2));
