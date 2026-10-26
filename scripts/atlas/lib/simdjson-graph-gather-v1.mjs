import { createHash } from 'node:crypto';

const REQUIRED_EXPORTS = ['simdJsonParse', 'simdJsonValidate', 'simdJsonExtractNumbers',
  'simdJsonBackend', 'simdJsonValidateAstSpans', 'simdJsonToCSR', 'graphBFS'];
const MiB = 1024 * 1024;
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function summarizeTensorArray(values, rows, columns) {
  if (!(values instanceof Float32Array) || !Number.isSafeInteger(rows) || rows < 1 || rows > 4096
    || !Number.isSafeInteger(columns) || columns < 1 || columns > 768
    || values.length !== rows * columns || values.byteLength > 16 * MiB) throw new Error('INVALID_ARRAY_METRIC_SHAPE');
  let minimum = Infinity;
  let maximum = -Infinity;
  let mean = 0;
  let squaredDeviation = 0;
  let zeroCount = 0;
  const rowL2Norms = [];
  for (let row = 0; row < rows; row++) {
    let normSquared = 0;
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const value = values[index];
      if (!Number.isFinite(value)) throw new Error('NONFINITE_FEATURE');
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      const delta = value - mean;
      mean += delta / (index + 1);
      squaredDeviation += delta * (value - mean);
      normSquared += value * value;
      if (value === 0) zeroCount++;
    }
    rowL2Norms.push(Math.sqrt(normSquared));
  }
  return { computation: 'CPU_FLOAT64_ACCUMULATION', dtype: 'float32', shape: [rows, columns],
    elementCount: values.length, byteLength: values.byteLength, minimum, maximum, mean,
    populationVariance: squaredDeviation / values.length, zeroCount,
    zeroFraction: zeroCount / values.length, rowL2Norms };
}

export function cpuGraphGatherOracle({ graphJson, embeddings, query, dim, topK = 3, maxCandidates = 128 }) {
  if (typeof graphJson !== 'string' || Buffer.byteLength(graphJson) > 256 * 1024) throw new Error('GRAPH_JSON_BUDGET');
  const graph = JSON.parse(graphJson);
  if (!graph || !Number.isSafeInteger(graph.numNodes) || graph.numNodes < 1 || graph.numNodes > 4096
    || !Array.isArray(graph.edges) || graph.edges.length > 65536) throw new Error('INVALID_GRAPH_SHAPE');
  if (!Number.isSafeInteger(dim) || dim < 1 || dim > 768
    || !(embeddings instanceof Float32Array) || embeddings.length !== graph.numNodes * dim
    || embeddings.byteLength > 16 * MiB || !(query instanceof Float32Array) || query.length !== dim
    || !Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 128
    || !Number.isSafeInteger(topK) || topK < 1 || topK > maxCandidates) throw new Error('INVALID_TENSOR_BOUNDS');
  for (const values of [embeddings, query]) {
    for (const value of values) if (!Number.isFinite(value)) throw new Error('NONFINITE_FEATURE');
  }
  const adjacency = Array.from({ length: graph.numNodes }, () => []);
  for (const edge of graph.edges) {
    if (!Array.isArray(edge) || edge.length !== 2
      || edge.some((ordinal) => !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= graph.numNodes)) {
      throw new Error('GRAPH_EDGE_OUT_OF_BOUNDS');
    }
    adjacency[edge[0]].push(edge[1]);
  }
  const rowPtr = new Int32Array(graph.numNodes + 1);
  const colIndices = new Int32Array(graph.edges.length);
  let cursor = 0;
  adjacency.forEach((neighbors, ordinal) => {
    rowPtr[ordinal] = cursor;
    colIndices.set(neighbors, cursor);
    cursor += neighbors.length;
  });
  rowPtr[graph.numNodes] = cursor;
  const ordinals = [0];
  const seen = new Set(ordinals);
  for (let head = 0; head < ordinals.length && ordinals.length < maxCandidates; head++) {
    for (const neighbor of [...new Set(adjacency[ordinals[head]])].sort((left, right) => left - right)) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      ordinals.push(neighbor);
      if (ordinals.length === maxCandidates) break;
    }
  }
  const queryNorm = Math.hypot(...query);
  if (queryNorm === 0) throw new Error('ZERO_QUERY_NORM');
  const scored = ordinals.map((ordinal) => {
    let dot = 0;
    let normSquared = 0;
    for (let column = 0; column < dim; column++) {
      const value = embeddings[ordinal * dim + column];
      dot += value * query[column];
      normSquared += value * value;
    }
    if (normSquared === 0) throw new Error('ZERO_CANDIDATE_NORM');
    return { ordinal, score: dot / (Math.sqrt(normSquared) * queryNorm) };
  });
  scored.sort((left, right) => right.score - left.score || left.ordinal - right.ordinal);
  return { graph, rowPtr, colIndices, ordinals, topK: scored.slice(0, topK) };
}

function assertArrayParity(actual, expected, label, tolerance = 0) {
  if (!ArrayBuffer.isView(actual) || actual.length !== expected.length) throw new Error(`${label}_SHAPE_MISMATCH`);
  for (let index = 0; index < expected.length; index++) {
    if (!Number.isFinite(actual[index]) || Math.abs(actual[index] - expected[index]) > tolerance) {
      throw new Error(`${label}_PARITY_MISMATCH`);
    }
  }
}

export function proveSimdjsonGraphGather({ addon, input, gpu = false, freeBytes = null, deviceIndex = 0 }) {
  const oracle = cpuGraphGatherOracle(input);
  const missing = REQUIRED_EXPORTS.filter((name) => typeof addon?.[name] !== 'function');
  if (missing.length) return { status: 'BLOCKED_NATIVE_EXPORTS', missing, canonicalAuthority: false, promotionAuthorized: false };
  if (!addon.simdJsonValidate(input.graphJson)) throw new Error('NATIVE_JSON_VALIDATION_FAILED');
  if (JSON.stringify(JSON.parse(addon.simdJsonParse(input.graphJson))) !== JSON.stringify(oracle.graph)) {
    throw new Error('JSON_ROUNDTRIP_MISMATCH');
  }
  const csr = addon.simdJsonToCSR(input.graphJson);
  if (csr.numNodes !== oracle.graph.numNodes || csr.numEdges !== oracle.graph.edges.length
    || !(csr.rowPtr instanceof Int32Array) || !(csr.colIndices instanceof Int32Array)) throw new Error('CSR_CONTRACT_MISMATCH');
  assertArrayParity(csr.rowPtr, oracle.rowPtr, 'CSR_ROWS');
  assertArrayParity(csr.colIndices, oracle.colIndices, 'CSR_COLUMNS');
  const discovered = addon.graphBFS(csr.rowPtr, csr.colIndices, 0, input.maxCandidates ?? 128);
  assertArrayParity(discovered, oracle.ordinals, 'BFS');
  const extracted = addon.simdJsonExtractNumbers(JSON.stringify({ query: Array.from(input.query) }), '/query');
  if (!(extracted instanceof Float64Array)) throw new Error('NUMERIC_EXTRACTION_TYPE_MISMATCH');
  assertArrayParity(extracted, input.query, 'QUERY_EXTRACTION');
  const sourceBytes = new Uint8Array(Buffer.from('λgraph', 'utf8'));
  if (addon.simdJsonValidateAstSpans(new Uint32Array([0, sourceBytes.length]), sourceBytes) !== true
    || addon.simdJsonValidateAstSpans(new Uint32Array([1, 2]), sourceBytes) !== false) throw new Error('UTF8_SPAN_CHECK_FAILED');
  const reserveBytes = 2 * 1024 * MiB;
  const estimatedWorkingBytes = input.embeddings.byteLength * 4 + input.query.byteLength * 4 + 256 * MiB;
  const result = {
    schema: 'atlas.simdjson-graph-gather.v1', status: 'CPU_NATIVE_PARITY_PASSED',
    inputKind: 'NUMERICAL_FIXTURE', canonicalAuthority: false, promotionAuthorized: false,
    sourceWritesPerformed: false, datastoreWritesPerformed: false,
    inputChecksums: {
      parameters: digest(JSON.stringify({ dim: input.dim, topK: input.topK ?? 3, maxCandidates: input.maxCandidates ?? 128 })),
      graph: digest(input.graphJson), embeddings: digest(new Uint8Array(input.embeddings.buffer, input.embeddings.byteOffset, input.embeddings.byteLength)),
      query: digest(new Uint8Array(input.query.buffer, input.query.byteOffset, input.query.byteLength)),
    },
    parserBackend: addon.simdJsonBackend(),
    arrayMetrics: { embeddings: summarizeTensorArray(input.embeddings, oracle.graph.numNodes, input.dim),
      query: summarizeTensorArray(input.query, 1, input.dim) },
    cpu: { csrParity: true, bfsParity: true, queryExtractionParity: true, utf8BoundaryFixtureParity: true,
      candidateOrdinals: Array.from(discovered), topK: oracle.topK },
    gpu: { status: 'NOT_REQUESTED', preflightFreeBytes: freeBytes, reserveBytes, estimatedWorkingBytes },
    evidenceAdmission: 'NOT_EXERCISED',
  };
  if (!gpu) return result;
  if (!Number.isFinite(freeBytes) || freeBytes < reserveBytes + estimatedWorkingBytes) {
    result.gpu.status = 'SKIPPED_INSUFFICIENT_HEADROOM';
    return result;
  }
  if (typeof addon.getBackendInfo !== 'function' || typeof addon.graphCandidateGatherGPU !== 'function') {
    result.gpu.status = 'BLOCKED_GPU_EXPORTS';
    return result;
  }
  const before = addon.getBackendInfo();
  if (before.cuda_available !== 1 || before.cuda_device_index !== deviceIndex
    || !Number.isFinite(before.cuda_free_bytes) || before.cuda_free_bytes < reserveBytes + estimatedWorkingBytes) {
    result.gpu.status = 'SKIPPED_RUNTIME_NOT_READY';
    return result;
  }
  const gathered = addon.graphCandidateGatherGPU({
    candidateIndices: Int32Array.from(discovered), embeddings: input.embeddings,
    numNodes: oracle.graph.numNodes, dim: input.dim, query: input.query, topK: oracle.topK.length,
  });
  if (gathered.telemetry?.backend !== 'cuda_libtorch') throw new Error('CUDA_EXECUTION_NOT_CONFIRMED');
  const expectedRows = Float32Array.from(oracle.ordinals.flatMap((ordinal) =>
    Array.from(input.embeddings.subarray(ordinal * input.dim, (ordinal + 1) * input.dim))));
  assertArrayParity(gathered.gatheredEmbeddings, expectedRows, 'GATHER', 1e-6);
  assertArrayParity(gathered.candidateOrdinals, oracle.topK.map((entry) => entry.ordinal), 'TOPK_ORDINALS');
  assertArrayParity(gathered.topKIndices, oracle.topK.map((entry) => oracle.ordinals.indexOf(entry.ordinal)), 'TOPK_LOCAL_INDICES');
  assertArrayParity(gathered.scores, oracle.topK.map((entry) => entry.score), 'COSINE', 1e-5);
  const after = addon.getBackendInfo();
  if (!Number.isFinite(after.cuda_free_bytes) || after.cuda_free_bytes < reserveBytes) throw new Error('GPU_HEADROOM_BELOW_RESERVE');
  result.status = 'CPU_CUDA_FIXTURE_PARITY_PASSED';
  result.gpu = { ...result.gpu, status: 'PARITY_PASSED', telemetry: gathered.telemetry,
    gatheredArrayMetrics: summarizeTensorArray(gathered.gatheredEmbeddings, discovered.length, input.dim),
    freeBytesBefore: before.cuda_free_bytes, freeBytesAfter: after.cuda_free_bytes,
    transfers: 'Supplied full embedding matrix, candidate indices and query; no persistent residency proof',
    timingScope: 'SINGLE_FIXTURE_CALL_NOT_STEADY_STATE_BENCHMARK',
    tensorRtInferenceExercised: false };
  return result;
}

export function buildGraphGatherFixture() {
  const dim = 768;
  const embeddings = new Float32Array(4 * dim);
  embeddings[0] = 1;
  embeddings[dim] = 0.8;
  embeddings[dim + 1] = 0.6;
  embeddings[2 * dim + 1] = 1;
  embeddings[3 * dim] = -1;
  const query = new Float32Array(dim);
  query[0] = 1;
  return { graphJson: JSON.stringify({ numNodes: 4, edges: [[0, 2], [0, 1], [1, 3]] }),
    embeddings, query, dim, topK: 3, maxCandidates: 4 };
}
