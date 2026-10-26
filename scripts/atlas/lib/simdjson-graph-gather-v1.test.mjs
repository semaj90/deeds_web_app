import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphGatherFixture, cpuGraphGatherOracle, proveSimdjsonGraphGather, summarizeTensorArray } from './simdjson-graph-gather-v1.mjs';

function fixtureAddon() {
  const input = buildGraphGatherFixture();
  const oracle = cpuGraphGatherOracle(input);
  return {
    simdJsonParse: (json) => JSON.stringify(JSON.parse(json)),
    simdJsonValidate: () => true,
    simdJsonExtractNumbers: (json) => Float64Array.from(JSON.parse(json).query),
    simdJsonBackend: () => 'FIXTURE_NOT_NATIVE',
    simdJsonValidateAstSpans: (spans) => spans[0] === 0,
    simdJsonToCSR: () => ({ numNodes: 4, numEdges: 3, rowPtr: oracle.rowPtr, colIndices: oracle.colIndices }),
    graphBFS: () => Int32Array.from(oracle.ordinals),
    getBackendInfo: () => ({ cuda_available: 1, cuda_device_index: 0, cuda_free_bytes: 4 * 1024 ** 3 }),
    graphCandidateGatherGPU: () => ({
      telemetry: { backend: 'cuda_libtorch' },
      gatheredEmbeddings: Float32Array.from(oracle.ordinals.flatMap((ordinal) => Array.from(input.embeddings.subarray(ordinal * input.dim, (ordinal + 1) * input.dim)))),
      candidateOrdinals: Int32Array.from(oracle.topK.map(({ ordinal }) => ordinal)),
      topKIndices: Int32Array.from(oracle.topK.map(({ ordinal }) => oracle.ordinals.indexOf(ordinal))),
      scores: Float32Array.from(oracle.topK.map(({ score }) => score)),
    }),
  };
}

test('array metrics use population variance, explicit shape, FP32 bytes and per-row norms', () => {
  const metrics = summarizeTensorArray(new Float32Array([1, 2, 3, 0]), 2, 2);
  assert.deepEqual(metrics.shape, [2, 2]);
  assert.equal(metrics.byteLength, 16);
  assert.equal(metrics.mean, 1.5);
  assert.equal(metrics.populationVariance, 1.25);
  assert.equal(metrics.zeroFraction, 0.25);
  assert.deepEqual(metrics.rowL2Norms, [Math.sqrt(5), 3]);
});

test('metrics reject malformed shapes, empty and nonfinite arrays', () => {
  assert.throws(() => summarizeTensorArray(new Float32Array(), 0, 2), /INVALID_ARRAY_METRIC_SHAPE/);
  assert.throws(() => summarizeTensorArray(new Float32Array([1]), 1, 2), /INVALID_ARRAY_METRIC_SHAPE/);
  assert.throws(() => summarizeTensorArray(new Float32Array([NaN]), 1, 1), /NONFINITE_FEATURE/);
});

test('oracle preserves deterministic BFS and exact cosine Top-K', () => {
  const oracle = cpuGraphGatherOracle(buildGraphGatherFixture());
  assert.deepEqual(oracle.ordinals, [0, 1, 2, 3]);
  assert.deepEqual(oracle.topK.map(({ ordinal }) => ordinal), [0, 1, 2]);
});

test('oracle rejects invalid JSON, graph edges, tensor dimensions and zero query', () => {
  const input = buildGraphGatherFixture();
  assert.throws(() => cpuGraphGatherOracle({ ...input, graphJson: '{' }));
  assert.throws(() => cpuGraphGatherOracle({ ...input, graphJson: '{"numNodes":4,"edges":[[0,4]]}' }), /GRAPH_EDGE_OUT_OF_BOUNDS/);
  assert.throws(() => cpuGraphGatherOracle({ ...input, dim: 64 }), /INVALID_TENSOR_BOUNDS/);
  assert.throws(() => cpuGraphGatherOracle({ ...input, query: new Float32Array(input.dim) }), /ZERO_QUERY_NORM/);
});

test('missing native exports remain blocked, not silently implemented by a JS fallback', () => {
  assert.equal(proveSimdjsonGraphGather({ addon: {}, input: buildGraphGatherFixture() }).status, 'BLOCKED_NATIVE_EXPORTS');
});

test('CPU fixture metrics never request the GPU', () => {
  const addon = fixtureAddon();
  addon.graphCandidateGatherGPU = () => { throw new Error('UNEXPECTED_GPU_DISPATCH'); };
  const result = proveSimdjsonGraphGather({ addon, input: buildGraphGatherFixture() });
  assert.equal(result.status, 'CPU_NATIVE_PARITY_PASSED');
  assert.equal(result.gpu.status, 'NOT_REQUESTED');
  assert.deepEqual(result.arrayMetrics.embeddings.shape, [4, 768]);
  assert.equal(result.canonicalAuthority, false);
});

test('corrupted native CSR and UTF-8 span results fail parity', () => {
  const addon = fixtureAddon();
  addon.simdJsonToCSR = () => ({ numNodes: 4, numEdges: 3, rowPtr: new Int32Array(5), colIndices: new Int32Array(3) });
  assert.throws(() => proveSimdjsonGraphGather({ addon, input: buildGraphGatherFixture() }), /CSR_ROWS_PARITY_MISMATCH/);
  const spanAddon = fixtureAddon();
  spanAddon.simdJsonValidateAstSpans = () => true;
  assert.throws(() => proveSimdjsonGraphGather({ addon: spanAddon, input: buildGraphGatherFixture() }), /UTF8_SPAN_CHECK_FAILED/);
});

test('GPU dispatch requires both external and native memory headroom', () => {
  const addon = fixtureAddon();
  addon.graphCandidateGatherGPU = () => { throw new Error('UNEXPECTED_GPU_DISPATCH'); };
  const input = buildGraphGatherFixture();
  assert.equal(proveSimdjsonGraphGather({ addon, input, gpu: true, freeBytes: 0 }).gpu.status, 'SKIPPED_INSUFFICIENT_HEADROOM');
  addon.getBackendInfo = () => ({ cuda_available: 0 });
  assert.equal(proveSimdjsonGraphGather({ addon, input, gpu: true, freeBytes: 4 * 1024 ** 3 }).gpu.status, 'SKIPPED_RUNTIME_NOT_READY');
});

test('CUDA gather parity requires actual backend label, aligned ordinals and numerical scores', () => {
  const input = buildGraphGatherFixture();
  const addon = fixtureAddon();
  const result = proveSimdjsonGraphGather({ addon, input, gpu: true, freeBytes: 4 * 1024 ** 3 });
  assert.equal(result.status, 'CPU_CUDA_FIXTURE_PARITY_PASSED');
  assert.deepEqual(result.gpu.gatheredArrayMetrics.shape, [4, 768]);
  addon.graphCandidateGatherGPU = () => ({ telemetry: { backend: 'cpu_fallback' } });
  assert.throws(() => proveSimdjsonGraphGather({ addon, input, gpu: true, freeBytes: 4 * 1024 ** 3 }), /CUDA_EXECUTION_NOT_CONFIRMED/);
});
