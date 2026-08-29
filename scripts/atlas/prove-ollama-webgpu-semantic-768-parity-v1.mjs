#!/usr/bin/env node

/** Read-only Ollama/WebGPU semantic_768 parity proof for the frozen 15-row map. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const env = loadRepoEnv(process.env);
const isolated = resolve(root, 'services', 'embedding-onnx-webgpu');
const requireIsolated = createRequire(resolve(isolated, 'package.json'));
const ort = requireIsolated('onnxruntime-node');
const transformers = requireIsolated('@huggingface/transformers');
const mapPath = resolve(env.ATLAS_CANDIDATE_MAP ?? resolve(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = resolve(env.ATLAS_EMBEDDING_PARITY_REPORT ?? resolve(root, 'docs/reports/ollama-webgpu-semantic-768-parity-v1.json'));
const modelPath = resolve(root, 'sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx');
const model = String(env.EMBEDDINGGEMMA_MODEL ?? 'embeddinggemma:latest');
const ollamaUrl = String(env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const DIMENSIONS = 768;

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const cosine = (a, b) => {
  let dot = 0; let an = 0; let bn = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; an += a[i] ** 2; bn += b[i] ** 2; }
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
};
const maxAbsDelta = (a, b) => a.reduce((max, value, i) => Math.max(max, Math.abs(value - b[i])), 0);

function poolLastHidden(output, attentionMask) {
  if (output.dims.length !== 3 || Number(output.dims[2]) !== DIMENSIONS) {
    throw new Error(`WEBGPU_OUTPUT_SHAPE_UNSUPPORTED:${output.dims.join('x')}`);
  }
  const vector = new Float32Array(DIMENSIONS);
  let count = 0;
  for (let token = 0; token < Number(output.dims[1]); token += 1) {
    if (attentionMask[token] !== 1) continue;
    count += 1;
    for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) vector[dimension] += output.data[token * DIMENSIONS + dimension];
  }
  if (!count) throw new Error('WEBGPU_NO_VALID_TOKENS');
  let norm = 0;
  for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) { vector[dimension] /= count; norm += vector[dimension] ** 2; }
  norm = Math.sqrt(norm);
  for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) vector[dimension] /= norm;
  return Array.from(vector);
}

async function embedWebGpu(session, tokenizer, text) {
  const encoded = await tokenizer(text, { return_tensors: 'np', truncation: true, max_length: 2048 });
  const ids = Array.from(encoded.input_ids.data, Number);
  const mask = Array.from(encoded.attention_mask.data, Number);
  if (ids.length > 512) throw new Error(`WEBGPU_LOCAL_EXPORT_CONTEXT_LIMIT_512:${ids.length}`);
  const result = await session.run({
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from(mask, BigInt), [1, mask.length]),
  });
  const name = session.outputNames.find((value) => /sentence|embedding/i.test(value)) ?? session.outputNames[0];
  return { vector: poolLastHidden(result[name], mask), tokenCount: ids.length };
}

async function embedOllama(text) {
  const response = await fetch(`${ollamaUrl}/api/embed`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: [text] }), signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`OLLAMA_HTTP_${response.status}`);
  const body = await response.json();
  const vector = body.embeddings?.[0] ?? body.embedding;
  if (!Array.isArray(vector) || vector.length !== DIMENSIONS) throw new Error('OLLAMA_OUTPUT_NOT_SEMANTIC_768');
  return vector.map(Number);
}

async function main() {
  const candidateMap = JSON.parse(await readFile(mapPath, 'utf8'));
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });
  const report = {
    schema: 'atlas.ollama-webgpu-semantic-768-parity.v1', generatedAt: new Date().toISOString(), readOnly: true,
    candidateSnapshotRevision: candidateMap.candidateSnapshotRevision, ordinalMapChecksum: candidateMap.ordinalMapChecksum ?? null,
    model, ollamaUrl, candidates: [], writes: { postgres: false, qdrant: false, valkey: false }, status: 'BLOCKED', errors: [],
  };
  try {
    const refs = candidateMap.candidates.slice(0, 15);
    const rows = await pool.query(
      `SELECT DISTINCT ON (source_ref) source_ref, content FROM public.codebase_chunk_index WHERE source_ref = ANY($1::text[]) ORDER BY source_ref, id`,
      [refs.map((candidate) => candidate.sourceRef)],
    );
    const contentByRef = new Map(rows.rows.map((row) => [row.source_ref, String(row.content ?? '')]));
    transformers.env.localModelPath = resolve(root, 'sveltekit-frontend/static');
    const tokenizer = await transformers.AutoTokenizer.from_pretrained('embeddinggemma_300m_onnx', { local_files_only: true });
    const session = await ort.InferenceSession.create(modelPath, { executionProviders: [{ name: 'webgpu', preferredLayout: 'NCHW' }] });
    for (const candidate of refs) {
      const sourceText = contentByRef.get(candidate.sourceRef);
      if (!sourceText) throw new Error(`CANONICAL_SOURCE_TEXT_MISSING:${candidate.sourceRef}`);
      const renderedInput = `title: none | text: ${sourceText}`;
      const [ollama, webgpu] = await Promise.all([embedOllama(renderedInput), embedWebGpu(session, tokenizer, renderedInput)]);
      report.candidates.push({
        candidateOrdinal: candidate.candidateOrdinal, sourceRef: candidate.sourceRef,
        renderedInputChecksum: sha256(renderedInput), tokenCount: webgpu.tokenCount,
        ollamaCosineWebGpu: cosine(ollama, webgpu.vector), maxAbsDelta: maxAbsDelta(ollama, webgpu.vector),
        ollamaDimensions: ollama.length, webgpuDimensions: webgpu.vector.length,
      });
    }
    const scores = report.candidates.map((candidate) => candidate.ollamaCosineWebGpu);
    report.summary = { count: report.candidates.length, minCosine: Math.min(...scores), meanCosine: scores.reduce((a, b) => a + b, 0) / scores.length, maxCosine: Math.max(...scores), outputContract: 'LAST_HIDDEN_STATE_MEAN_POOL_L2' };
    report.status = 'PARITY_MEASURED_NOT_PROMOTED';
  } catch (error) { report.errors.push(String(error?.message ?? error)); }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await pool.end();
  console.log(JSON.stringify({ status: report.status, summary: report.summary ?? null, errors: report.errors, reportPath }, null, 2));
  if (report.status === 'BLOCKED') process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
