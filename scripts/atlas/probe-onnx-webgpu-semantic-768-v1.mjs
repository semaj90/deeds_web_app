/**
 * Read-only WebGPU capability probe for the local EmbeddingGemma ONNX artifact.
 * This does not write PostgreSQL, Qdrant, or embedding rows.
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
const modelInfoPath = resolve(frontend, 'static', 'embeddinggemma_300m_onnx', 'model_info.json');
const modelConfigPath = resolve(frontend, 'static', 'embeddinggemma_300m_onnx', 'config.json');
const runtimePackageDir = process.env.ORT_NODE_PACKAGE_DIR
  ? resolve(process.env.ORT_NODE_PACKAGE_DIR)
  : resolve(frontend, 'node_modules', 'onnxruntime-node');
const runtimePackagePath = resolve(runtimePackageDir, 'package.json');
const tokenizerRequire = createRequire(resolve(root, 'services', 'embedding-onnx-webgpu', 'package.json'));
const reportPath = resolve(root, 'docs', 'reports', 'onnx-webgpu-semantic-768-readiness-v1.json');

function sha256File(path) {
  if (!existsSync(path)) return null;
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function digestTokenTensor(tokenizerRevision, inputIds, attentionMask) {
  const hash = createHash('sha256');
  const ids = Buffer.alloc(inputIds.length * 8);
  const mask = Buffer.alloc(attentionMask.length * 8);
  inputIds.forEach((value, index) => ids.writeBigInt64LE(BigInt(value), index * 8));
  attentionMask.forEach((value, index) => mask.writeBigInt64LE(BigInt(value), index * 8));
  hash.update(tokenizerRevision);
  hash.update(`|ids:${inputIds.length}:[`);
  hash.update(ids);
  hash.update(`]|mask:${attentionMask.length}:[`);
  hash.update(mask);
  hash.update(']');
  return `sha256:${hash.digest('hex')}`;
}

function digestVector(vector) {
  return `sha256:${createHash('sha256').update(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)).digest('hex')}`;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

const modelInfo = readJson(modelInfoPath);
const modelConfig = readJson(modelConfigPath);

const report = {
  schema: 'atlas.onnx-webgpu-semantic-768-readiness.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  requestedProvider: 'webgpu',
  cpuFallbackAllowed: false,
  representationId: 'semantic_768',
  dimensions: 768,
  modelPath,
  modelChecksum: sha256File(modelPath),
  tokenizerChecksum: sha256File(tokenizerPath),
  sequenceContract: {
    advertisedMaxInputTokens: Number(modelConfig?.max_position_embeddings ?? modelInfo?.model_max_length ?? 2048),
    localExportMaxInputTokens: Number(modelInfo?.max_sequence_length ?? 512),
    slidingWindowTokens: Number(modelConfig?.sliding_window ?? 512),
    status: Number(modelInfo?.max_sequence_length ?? 512) < Number(modelConfig?.max_position_embeddings ?? 2048)
      ? 'LOCAL_EXPORT_LIMITED'
      : 'MATCH',
  },
  semanticEquivalence: {
    status: 'NOT_PROVEN',
    reason: 'LOCAL_EXPORT_SEQUENCE_OR_OUTPUT_CONTRACT_REQUIRES_SEPARATE_PARITY_PROOF',
  },
  runtimePackageDir,
  runtime: {},
  session: { created: false, actualProvider: null, inputNames: [], outputNames: [] },
  inference: { executed: false, dimensions: null, finite: false, normalized: false, outputName: null, outputContract: null },
  tokenFixtures: [],
  status: 'BLOCKED',
  errors: [],
};

try {
  const runtimePackage = JSON.parse(readFileSync(runtimePackagePath, 'utf8'));
  const ort = require(runtimePackageDir);
  report.runtime = {
    package: 'onnxruntime-node',
    version: runtimePackage.version ?? null,
    platform: process.platform,
    arch: process.arch,
  };

  if (!report.modelChecksum || !report.tokenizerChecksum) {
    throw new Error('EMBEDDINGGEMMA_ONNX_OR_TOKENIZER_MISSING');
  }

  if (!/^1\.29\./.test(String(report.runtime.version ?? ''))) {
    throw new Error(`WEBGPU_RUNTIME_VERSION_UNSUPPORTED:${String(report.runtime.version)}`);
  }

  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }],
    graphOptimizationLevel: 'all',
    enableProfiling: true,
    profileFilePrefix: resolve(root, 'docs', 'reports', 'onnx-webgpu-profile'),
  });

  report.session = {
    created: true,
    actualProvider: 'webgpu',
    inputNames: session.inputNames,
    outputNames: session.outputNames,
  };

  const transformers = tokenizerRequire('@huggingface/transformers');
  transformers.env.localModelPath = resolve(frontend, 'static');
  const tokenizer = await transformers.AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', {
    local_files_only: true,
  });
  const tokenizerRevision = String(report.tokenizerChecksum);
  const fixtures = [
    ['RETRIEVAL_QUERY', 'task: search result | query: WebGPU semantic retrieval probe'],
    ['CODE_RETRIEVAL_QUERY', 'task: code retrieval | query: locate the embedding runtime'],
    ['RETRIEVAL_DOCUMENT', 'title: none | text: WebGPU semantic retrieval probe'],
  ];
  for (const [role, renderedInput] of fixtures) {
    const fixture = await tokenizer(renderedInput, {
      return_tensors: 'np',
      truncation: true,
      max_length: 2048,
    });
    const ids = Array.from(fixture.input_ids.data, Number);
    const mask = Array.from(fixture.attention_mask.data, Number);
    report.tokenFixtures.push({
      role,
      renderedInput,
      renderedInputChecksum: `sha256:${createHash('sha256').update(renderedInput).digest('hex')}`,
      tokenTensorChecksum: digestTokenTensor(tokenizerRevision, ids, mask),
      inputIdsShape: [1, ids.length],
      attentionMaskShape: [1, mask.length],
      tokenCount: ids.length,
    });
  }
  const encoded = await tokenizer(fixtures[0][1], {
    return_tensors: 'np',
    truncation: true,
    max_length: 2048,
  });
  const inputIds = Array.from(encoded.input_ids.data, Number);
  const attentionMask = Array.from(encoded.attention_mask.data, Number);
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds, BigInt), [1, inputIds.length]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from(attentionMask, BigInt), [1, attentionMask.length]),
  };
  const outputName = session.outputNames.find((name) => /sentence|embedding/i.test(name)) ?? session.outputNames[0];
  async function runVector() {
    const outputs = await session.run(feeds);
    const output = outputs[outputName];
    if (!output) throw new Error('WEBGPU_EMBEDDING_OUTPUT_MISSING');
    const dims = output.dims;
    const data = output.data;
    if (dims.length !== 3 || Number(dims[2]) !== 768) {
      throw new Error(`WEBGPU_EMBEDDING_OUTPUT_SHAPE_UNSUPPORTED:${dims.join('x')}`);
    }
    const pooled = new Float32Array(768);
    let count = 0;
    for (let token = 0; token < Number(dims[1]); token += 1) {
      if (attentionMask[token] !== 1) continue;
      count += 1;
      for (let dimension = 0; dimension < 768; dimension += 1) pooled[dimension] += data[token * 768 + dimension];
    }
    if (!count) throw new Error('WEBGPU_EMBEDDING_NO_VALID_TOKENS');
    let normSquared = 0;
    for (let dimension = 0; dimension < 768; dimension += 1) {
      pooled[dimension] /= count;
      if (!Number.isFinite(pooled[dimension])) throw new Error('WEBGPU_EMBEDDING_NONFINITE');
      normSquared += pooled[dimension] * pooled[dimension];
    }
    const norm = Math.sqrt(normSquared);
    if (!(norm > 0)) throw new Error('WEBGPU_EMBEDDING_ZERO_NORM');
    for (let dimension = 0; dimension < 768; dimension += 1) pooled[dimension] /= norm;
    return pooled;
  }
  const replayVectors = [await runVector(), await runVector(), await runVector()];
  const replayChecksums = replayVectors.map(digestVector);
  let maxAbsDelta = 0;
  for (let index = 1; index < replayVectors.length; index += 1) {
    for (let dimension = 0; dimension < 768; dimension += 1) {
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(replayVectors[0][dimension] - replayVectors[index][dimension]));
    }
  }
  const pooled = replayVectors[0];
  report.inference = {
    executed: true,
    dimensions: 768,
    finite: true,
    normalized: Math.abs(Math.hypot(...pooled) - 1) <= 1e-3,
    outputName,
    outputContract: 'LAST_HIDDEN_STATE_MEAN_POOL_L2',
    poolingOwner: 'ATLAS_RUNTIME',
    replayCount: replayVectors.length,
    replayChecksums,
    replayStable: replayChecksums.every((checksum) => checksum === replayChecksums[0]),
    replayMaxAbsDelta: maxAbsDelta,
  };
  if (!report.inference.normalized) throw new Error('WEBGPU_EMBEDDING_NOT_NORMALIZED');
  report.status = 'WEBGPU_RUNTIME_AND_TOKEN_STATE_INFERENCE_PROVEN';
} catch (error) {
  report.errors.push(String(error?.message ?? error));
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, runtime: report.runtime, session: report.session, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
