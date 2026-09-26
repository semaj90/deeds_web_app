/**
 * Read-only CPU/WebGPU parity probe for the exact local EmbeddingGemma ONNX artifact.
 * No PostgreSQL, Qdrant, embedding-row, or projection writes are performed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const root = resolve(import.meta.dirname, '..', '..');
const frontend = resolve(root, 'sveltekit-frontend');
const artifactDir = resolve(frontend, 'static', 'embeddinggemma_300m_onnx');
const modelPath = resolve(artifactDir, 'model.onnx');
const tokenizerPath = resolve(artifactDir, 'tokenizer.json');
const ortDir = resolve(frontend, 'node_modules', 'onnxruntime-node');
const tokenizerRequire = createRequire(resolve(root, 'services', 'embedding-onnx-webgpu', 'package.json'));
const reportPath = resolve(
  root,
  process.env.ATLAS_ONNX_CPU_WEBGPU_PARITY_REPORT ?? 'docs/reports/onnx-cpu-webgpu-parity-v1.json',
);

function sha256File(path) {
  return existsSync(path) ? `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}` : null;
}

function digestVector(vector) {
  return `sha256:${createHash('sha256').update(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)).digest('hex')}`;
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

const report = {
  schema: 'atlas.onnx-cpu-webgpu-parity.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalAuthority: false,
  modelPath,
  modelChecksum: sha256File(modelPath),
  tokenizerChecksum: sha256File(tokenizerPath),
  requestedProviders: ['cpu', 'webgpu'],
  representationId: 'semantic_768',
  dimensions: 768,
  input: { renderedInput: 'task: search result | query: WebGPU semantic retrieval parity probe', tokenCount: null },
  providers: {},
  parity: { cosine: null, meanAbsDelta: null, maxAbsDelta: null, vectorChecksums: {}, sameInput: true },
  status: 'BLOCKED',
  errors: [],
};

try {
  if (!report.modelChecksum || !report.tokenizerChecksum) throw new Error('EMBEDDINGGEMMA_ARTIFACT_MISSING');
  const ort = require(ortDir);
  const transformers = tokenizerRequire('@huggingface/transformers');
  transformers.env.localModelPath = resolve(frontend, 'static');
  const tokenizer = await transformers.AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', { local_files_only: true });
  const encoded = await tokenizer(report.input.renderedInput, { return_tensors: 'np', truncation: true, max_length: 512 });
  const ids = Array.from(encoded.input_ids.data, Number);
  const mask = Array.from(encoded.attention_mask.data, Number);
  report.input.tokenCount = ids.length;
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from(mask, BigInt), [1, mask.length]),
  };
  async function run(provider) {
    const session = await ort.InferenceSession.create(modelPath, { executionProviders: [provider] });
    const outputName = session.outputNames[0];
    const output = (await session.run(feeds))[outputName];
    if (!output || output.dims.length !== 3 || Number(output.dims[2]) !== 768) {
      throw new Error(`UNSUPPORTED_OUTPUT:${JSON.stringify(output?.dims ?? null)}`);
    }
    const pooled = new Float32Array(768);
    let count = 0;
    for (let token = 0; token < Number(output.dims[1]); token += 1) {
      if (mask[token] !== 1) continue;
      count += 1;
      for (let dimension = 0; dimension < 768; dimension += 1) pooled[dimension] += output.data[token * 768 + dimension];
    }
    if (!count) throw new Error('NO_VALID_TOKENS');
    let norm = 0;
    for (let dimension = 0; dimension < 768; dimension += 1) {
      pooled[dimension] /= count;
      if (!Number.isFinite(pooled[dimension])) throw new Error('NONFINITE_OUTPUT');
      norm += pooled[dimension] * pooled[dimension];
    }
    norm = Math.sqrt(norm);
    for (let dimension = 0; dimension < 768; dimension += 1) pooled[dimension] /= norm;
    report.providers[provider] = { actualProvider: provider, outputName, dimensions: 768, normalized: Math.abs(Math.hypot(...pooled) - 1) <= 1e-3 };
    return pooled;
  }
  const cpu = await run('cpu');
  const webgpu = await run('webgpu');
  let sum = 0;
  let max = 0;
  for (let i = 0; i < cpu.length; i += 1) {
    const delta = Math.abs(cpu[i] - webgpu[i]);
    sum += delta;
    max = Math.max(max, delta);
  }
  report.parity = {
    cosine: cosine(cpu, webgpu),
    meanAbsDelta: sum / cpu.length,
    maxAbsDelta: max,
    vectorChecksums: { cpu: digestVector(cpu), webgpu: digestVector(webgpu) },
    sameInput: true,
  };
  report.status = 'PARITY_OBSERVED_UNADMITTED';
} catch (error) {
  report.errors.push(String(error?.message ?? error));
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, providers: report.providers, parity: report.parity, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
