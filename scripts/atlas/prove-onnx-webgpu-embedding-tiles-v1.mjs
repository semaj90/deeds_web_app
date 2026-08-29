/**
 * Read-only WebGPU execution proof for the bounded candidate tile plan.
 * This creates no PostgreSQL, Qdrant, cache, or embedding writes.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..', '..');
const frontend = resolve(root, 'sveltekit-frontend');
const modelPath = resolve(frontend, 'static', 'embeddinggemma_300m_onnx', 'model.onnx');
const tokenizerPath = resolve(frontend, 'static', 'embeddinggemma_300m_onnx', 'tokenizer.json');
const planPath = resolve(root, 'docs', 'reports', 'embedding-tokenizer-candidate-tiles-v1.json');
const reportPath = resolve(root, 'docs', 'reports', 'onnx-webgpu-embedding-tiles-v1.json');
const runtimePackageDir = process.env.ORT_NODE_PACKAGE_DIR
  ? resolve(process.env.ORT_NODE_PACKAGE_DIR)
  : resolve(root, 'services', 'embedding-onnx-webgpu', 'node_modules', 'onnxruntime-node');
const tokenizerRequire = createRequire(resolve(root, 'services', 'embedding-onnx-webgpu', 'package.json'));

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(value, 'utf8'));
}

function finiteNormalized(vector) {
  let normSquared = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return { finite: false, norm: null, normalized: false };
    normSquared += value * value;
  }
  const norm = Math.sqrt(normSquared);
  return { finite: true, norm, normalized: Math.abs(norm - 1) <= 1e-3 };
}

function meanPool(output, attentionMask) {
  const dims = output.dims.map(Number);
  const data = output.data;
  if (dims.length === 2 && dims[1] === 768) {
    return Float32Array.from(data);
  }
  if (dims.length !== 3 || dims[2] !== 768) {
    throw new Error(`WEBGPU_TILE_OUTPUT_SHAPE_UNSUPPORTED:${dims.join('x')}`);
  }
  const pooled = new Float32Array(768);
  let count = 0;
  for (let token = 0; token < dims[1]; token += 1) {
    if (attentionMask[token] !== 1) continue;
    count += 1;
    for (let dimension = 0; dimension < 768; dimension += 1) {
      pooled[dimension] += data[token * 768 + dimension];
    }
  }
  if (!count) throw new Error('WEBGPU_TILE_NO_VALID_TOKENS');
  let normSquared = 0;
  for (let dimension = 0; dimension < 768; dimension += 1) {
    pooled[dimension] /= count;
    normSquared += pooled[dimension] * pooled[dimension];
  }
  const norm = Math.sqrt(normSquared);
  if (!(norm > 0)) throw new Error('WEBGPU_TILE_ZERO_NORM');
  for (let dimension = 0; dimension < 768; dimension += 1) pooled[dimension] /= norm;
  return pooled;
}

function tensorInput(values, ort, type, length) {
  const padded = new BigInt64Array(length);
  values.slice(0, length).forEach((value, index) => { padded[index] = BigInt(value); });
  return new ort.Tensor(type, padded, [1, length]);
}

const report = {
  schema: 'atlas.onnx-webgpu-embedding-tiles.v1',
  readOnly: true,
  requestedProvider: 'webgpu',
  cpuFallbackAllowed: false,
  tileInputMode: 'RE_TOKENIZED_TEXT_SLICE',
  canonicalRepresentation: 'semantic_768',
  derivedProjection: 'EmbeddingTileV1',
  modelPath,
  modelChecksum: existsSync(modelPath) ? sha256Bytes(readFileSync(modelPath)) : null,
  tokenizerChecksum: existsSync(tokenizerPath) ? sha256Bytes(readFileSync(tokenizerPath)) : null,
  planPath,
  candidateCount: 0,
  tileCount: 0,
  session: { created: false, actualProvider: null, inputNames: [], outputNames: [] },
  tiles: [],
  status: 'BLOCKED',
  errors: [],
};

try {
  if (!existsSync(planPath)) throw new Error('CANDIDATE_TILE_PLAN_MISSING');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  if (plan.status !== 'CANDIDATE_TILE_TOKENIZER_PARITY_PROVEN') throw new Error(`CANDIDATE_TILE_PLAN_NOT_PROVEN:${plan.status}`);
  const plannedTiles = plan.candidates.flatMap((candidate) =>
    candidate.tileInputs.map((text, index) => ({ candidate, text, range: candidate.tileRanges[index] })));
  report.candidateCount = plan.candidateCount;
  report.tileCount = plannedTiles.length;

  const runtimePackage = JSON.parse(readFileSync(resolve(runtimePackageDir, 'package.json'), 'utf8'));
  const ort = require(runtimePackageDir);
  if (!/^1\.29\./.test(String(runtimePackage.version ?? ''))) {
    throw new Error(`WEBGPU_RUNTIME_VERSION_UNSUPPORTED:${String(runtimePackage.version)}`);
  }
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }],
    graphOptimizationLevel: 'all',
  });
  report.session = {
    created: true,
    actualProvider: 'webgpu',
    inputNames: session.inputNames,
    outputNames: session.outputNames,
  };

  const transformers = tokenizerRequire('@huggingface/transformers');
  transformers.env.localModelPath = resolve(frontend, 'static');
  const tokenizer = await transformers.AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', { local_files_only: true });
  const outputName = session.outputNames.find((name) => /sentence|embedding/i.test(name)) ?? session.outputNames[0];
  for (const item of plannedTiles) {
    const encoded = await tokenizer(item.text, {
      return_tensors: 'np',
      truncation: true,
      max_length: 512,
      padding: 'max_length',
    });
    const ids = Array.from(encoded.input_ids.data, Number);
    const mask = Array.from(encoded.attention_mask.data, Number);
    const feeds = {
      input_ids: tensorInput(ids, ort, 'int64', 512),
      attention_mask: tensorInput(mask, ort, 'int64', 512),
    };
    const outputs = await session.run(feeds);
    const vector = meanPool(outputs[outputName], mask);
    const quality = finiteNormalized(vector);
    if (!quality.finite || !quality.normalized) throw new Error(`WEBGPU_TILE_VECTOR_INVALID:${item.candidate.candidateOrdinal}:${item.range.tileIndex}`);
    report.tiles.push({
      candidateOrdinal: item.candidate.candidateOrdinal,
      sourceRef: item.candidate.sourceRef,
      tileIndex: item.range.tileIndex,
      tokenStart: item.range.tokenStart,
      tokenEnd: item.range.tokenEnd,
      tokenCount: item.range.tokenCount,
      byteStart: item.range.byteStart,
      byteEnd: item.range.byteEnd,
      renderedInputChecksum: sha256Text(item.text),
      tokenCountAfterRetokenization: ids.reduce((sum, value, index) => sum + (mask[index] === 1 ? 1 : 0), 0),
      vectorChecksum: sha256Bytes(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)),
      dimensions: vector.length,
      finite: quality.finite,
      l2Norm: quality.norm,
      normalized: quality.normalized,
      canonicalAuthority: false,
    });
  }
  report.status = 'WEBGPU_EMBEDDING_TILES_EXECUTION_PROVEN';
} catch (error) {
  report.errors.push(String(error?.message ?? error));
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, candidateCount: report.candidateCount, tileCount: report.tileCount, executedTiles: report.tiles.length, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
