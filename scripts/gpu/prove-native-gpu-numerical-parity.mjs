#!/usr/bin/env node

/**
 * Tiny deterministic native-compute parity fixtures against independent JS
 * scalar oracles. This is an executor proof only: it does not promote a
 * representation, touch a datastore, or treat CPU/stub execution as GPU.
 * Pass one explicit absolute addon path.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const addonArg = process.argv[2];
if (!addonArg || process.argv.length !== 3 || !path.isAbsolute(addonArg)) {
  throw new Error('Usage: node scripts/gpu/prove-native-gpu-numerical-parity.mjs <absolute-addon-path>');
}
const addonPath = path.resolve(addonArg);
const addonBytes = readFileSync(addonPath);
const addon = createRequire(import.meta.url)(addonPath);
const backendInfo = addon.getBackendInfo();
const tolerance = 2e-5;
const passed = [];
const results = [];

function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function norm(a) { return Math.sqrt(dot(a, a)); }
function cosine(a, b) {
  return dot(a, b) / (norm(a) * norm(b) + 1e-12);
}
function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((value) => value / sum);
}
function assertClose(actual, expected, label, tol = tolerance) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  let maxAbsError = 0;
  for (let i = 0; i < expected.length; i += 1) {
    const error = Math.abs(actual[i] - expected[i]);
    maxAbsError = Math.max(maxAbsError, error);
    assert.ok(Number.isFinite(actual[i]), `${label}[${i}] is finite`);
    assert.ok(error <= tol, `${label}[${i}] ${actual[i]} != ${expected[i]} (abs error ${error})`);
  }
  return maxAbsError;
}
function operation(name, invoke, oracle, { tolerance: opTolerance = tolerance, requiredCuda = false } = {}) {
  const exportBackend = backendInfo.per_export_backend?.[name] ?? null;
  addon.resetExecutionCounters?.();
  const actual = invoke();
  const counters = addon.getExecutionCounters?.() ?? null;
  const maxAbsError = assertClose(Array.from(actual), oracle, name, opTolerance);
  if (counters?.stub_invocation) assert.equal(counters.stub_invocation, 0, `${name}: no stub invocation`);
  if (requiredCuda) assert.ok((counters?.cuda_execution ?? 0) > 0, `${name}: expected an actual CUDA branch`);
  const result = {
    operation: name,
    status: requiredCuda && !(counters?.cuda_execution > 0) ? 'PARITY_CPU_ONLY' : 'PARITY_PROVEN',
    backend: exportBackend?.backend ?? null,
    reason: exportBackend?.reason ?? null,
    maxAbsError,
    tolerance: opTolerance,
    executionCounters: counters,
  };
  results.push(result);
  passed.push(name);
  return result;
}
function expectStatus(name, invoke, expectedStatus) {
  const exportBackend = backendInfo.per_export_backend?.[name] ?? null;
  let thrown = false;
  try { invoke(); } catch { thrown = true; }
  assert.equal(thrown, true, `${name}: expected fail-closed unavailable export`);
  results.push({ operation: name, status: expectedStatus, backend: exportBackend?.backend ?? null,
    reason: exportBackend?.reason ?? null, parityProven: false });
}

// Cosine and pairwise similarity use separate scalar loops as CPU oracle.
{
  const q = [1, 2, -1];
  const rows = [[2, 0, 1], [0, 1, 1], [-1, -2, 1]];
  const flat = rows.flat();
  const out = new Float32Array(rows.length);
  operation('batchCosineSimilarity', () => {
    assert.equal(addon.batchCosineSimilarity(new Float32Array(q), 3, new Float32Array(flat), rows.length, out, rows.length), 0);
    return out;
  }, rows.map((row) => cosine(q, row)), { requiredCuda: true });

  const vectors = [[1, 0], [0, 1], [1, 1]];
  const flatVectors = new Float32Array(vectors.flat());
  const expected = vectors.flatMap((left) => vectors.map((right) => cosine(left, right)));
  operation('graphSimilarity', () => addon.graphSimilarity(flatVectors, 3, 2), expected);
  const halfOut = new Float32Array(9);
  const halfRc = addon.graphSimilarityHalf(flatVectors, 3, 2, halfOut, halfOut.length);
  assert.equal(halfRc, 0);
  operation('graphSimilarityHalf', () => halfOut, expected);
}

operation('softmaxGPU', () => addon.softmaxGPU(new Float32Array([-2, 0.5, 3]), 3), softmax([-2, 0.5, 3]), { requiredCuda: true });
operation('topKIndicesGPU', () => addon.topKIndicesGPU(new Float32Array([0.2, 4, -1, 2]), 4, 3), [1, 3, 0]);

{
  const q = [1, 2];
  const keys = [[1, 0], [0, 2], [2, 1]];
  const scores = keys.map((key) => dot(q, key) / Math.sqrt(q.length));
  operation('attentionScoreGPU', () => addon.attentionScoreGPU(new Float32Array(q), 2, new Float32Array(keys.flat()), keys.length), softmax(scores), { requiredCuda: true });
}

{
  const generated = [[1, 0], [1, 1], [-1, 2]];
  const reference = [[1, 0], [0, 1], [1, -1]];
  operation('rewardScoreGPU', () => addon.rewardScoreGPU(new Float32Array(generated.flat()), new Float32Array(reference.flat()), 3, 2),
    generated.map((row, i) => cosine(row, reference[i])), { requiredCuda: true });
}

{
  // Directed 3-cycle has no dangling rows and uniform stationary distribution.
  const adjacency = new Float32Array([0, 1, 0, 0, 0, 1, 1, 0, 0]);
  operation('pageRankGPU', () => addon.pageRankGPU(adjacency, 3, 0.85, 12), [1 / 3, 1 / 3, 1 / 3], { tolerance: 3e-5, requiredCuda: true });
}

{
  const points = [[0, 0], [0, 1], [10, 10], [10, 11]];
  addon.resetExecutionCounters?.();
  const fit = addon.kmeansWithCentroids(new Float32Array(points.flat()), 4, 2, 2, 8);
  const assignments = Array.from(fit.assignments);
  const centroids = Array.from(fit.centroids);
  assert.deepEqual(assignments, [0, 0, 1, 1]);
  assertClose(centroids, [0, 0.5, 10, 10.5], 'kmeansWithCentroids.centroids');
  const counters = addon.getExecutionCounters?.() ?? null;
  assert.ok((counters?.cuda_execution ?? 0) > 0, 'kmeansWithCentroids: expected CUDA branch');
  results.push({ operation: 'kmeansWithCentroids', status: 'PARITY_PROVEN',
    backend: backendInfo.per_export_backend?.kmeansWithCentroids?.backend ?? null,
    assignments, centroids, reseeded: fit.reseeded, executionCounters: counters, maxAbsError: 0, tolerance });
  passed.push('kmeansWithCentroids');
}

{
  const data = [[2, 4], [5, 1]];
  const mean = [1, 2];
  const components = [[1, 0], [0, 1]];
  const expected = data.flatMap((row) => row.map((value, i) => value - mean[i]));
  operation('pcaProject', () => addon.pcaProject(new Float32Array(data.flat()), 2, 2,
    new Float32Array(mean), new Float32Array(components.flat()), 2), expected);
}

{
  const input = [[1, 2], [-1, 0.5]];
  const weights = [[1, 0], [0, 1]]; // [hidden=2, inputDim=2]
  const bias = [0.1, -0.2];
  const encodedExpected = input.flatMap((row) => weights.map((w, j) => Math.tanh(dot(row, w) + bias[j])));
  operation('autoencoderEncode', () => addon.autoencoderEncode(new Float32Array(input.flat()), 2, 2,
    new Float32Array(weights.flat()), new Float32Array(bias), 2), encodedExpected, { requiredCuda: true });
  const encoded = addon.autoencoderEncode(new Float32Array(input.flat()), 2, 2,
    new Float32Array(weights.flat()), new Float32Array(bias), 2);
  const decoderWeights = [[1, 0], [0, 1]]; // [outputDim=2, hidden=2]
  const decoderBias = [0.05, 0.15];
  const decodeExpected = [
    Math.tanh(encodedExpected[0] + decoderBias[0]), Math.tanh(encodedExpected[1] + decoderBias[1]),
    Math.tanh(encodedExpected[2] + decoderBias[0]), Math.tanh(encodedExpected[3] + decoderBias[1]),
  ];
  operation('autoencoderDecode', () => addon.autoencoderDecode(encoded, 2, 2,
    new Float32Array(decoderWeights.flat()), new Float32Array(decoderBias), 2), decodeExpected, { requiredCuda: true });
}

{
  const weights = [1, 3];
  const embeddings = [[1, 0], [0, 1]];
  const weighted = [0.25, 0.75];
  const expected = weighted.map((value) => value / norm(weighted));
  const actual = addon.computeCaseEmbedding(new Float32Array(weights), new Float32Array(embeddings.flat()), 2, 2);
  const actualArray = Array.from(actual);
  const err = assertClose(actualArray, expected, 'computeCaseEmbedding', 3e-5);
  results.push({ operation: 'computeCaseEmbedding', status: 'PARITY_PROVEN',
    backend: backendInfo.per_export_backend?.computeCaseEmbedding?.backend ?? null,
    maxAbsError: err, tolerance: 3e-5, semanticNote: 'oracle follows LibTorch weighted-mean L2 normalization; no-LibTorch scalar fallback is known to omit normalization' });
  passed.push('computeCaseEmbedding');
}

{
  // n=1 makes the implementation's rand()%n sample deterministic (always row 0).
  const data = new Float32Array([0.25, -0.5]);
  addon.resetExecutionCounters?.();
  const trained = addon.trainSOM(data, 1, 2, 1, 1, 1, 0.1, 0.01, 1, 1);
  assertClose(Array.from(trained.weights), Array.from(data), 'trainSOM.weights');
  assert.deepEqual(Array.from(trained.bmu), [0]);
  const counters = addon.getExecutionCounters?.() ?? null;
  assert.ok((counters?.cuda_execution ?? 0) > 0, 'trainSOM: expected CUDA branch');
  results.push({ operation: 'trainSOM', status: 'PARITY_PROVEN',
    backend: backendInfo.per_export_backend?.trainSOM?.backend ?? null,
    executionCounters: counters, maxAbsError: 0, tolerance,
    fixture: 'n=1, one neuron, one iteration; sampling is deterministic by modulo' });
  passed.push('trainSOM');
}

const failureCount = results.filter((result) => result.status === 'FAILED' || result.status === 'NOT_IMPLEMENTED').length;
const cudaBranchConfirmedCount = results.filter((result) => (result.executionCounters?.cuda_execution ?? 0) > 0).length;
const report = {
  schema: 'atlas.native-gpu-numerical-parity.v1',
  addonPath,
  addonSha256: createHash('sha256').update(addonBytes).digest('hex'),
  addonMtime: statSync(addonPath).mtime.toISOString(),
  buildVariant: backendInfo.build_type ?? backendInfo.build_variant ?? null,
  backendInfo,
  fixture: 'small deterministic in-memory inputs; independent JavaScript scalar CPU oracles',
  tolerance,
  results,
  passedCount: passed.length,
  cudaBranchConfirmedCount,
  cpuOwnedNumericalParityCount: results.filter((result) => result.backend === 'cpu_fallback').length,
  failedCount: failureCount,
  fixtureParityProven: failureCount === 0 && results.length >= 12,
  fullWorkloadParityProven: false,
  limitations: [
    'Parity is operation/fixture scoped, not workload-wide or representation authority.',
    'graphSimilarity and graphSimilarityHalf share the CPU implementation; they do not establish a CUDA graph-similarity kernel.',
    'computeCaseEmbedding has normalized LibTorch and unnormalized scalar fallback semantics; no-LibTorch parity is not claimed.',
    'No dangling-node PageRank case, tie-order top-k case, error/OOM fallback, store access, or persistent write was exercised.',
  ],
  datastoreWrites: false,
  modelCalls: 0,
};
console.log(JSON.stringify(report, null, 2));
