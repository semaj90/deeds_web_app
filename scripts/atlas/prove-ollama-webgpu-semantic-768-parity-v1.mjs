#!/usr/bin/env node

/** Read-only Ollama/WebGPU semantic_768 parity proof for the frozen 15-row map.
 *
 * TODO (stage-10 review, 2026-09-15): last run (2026-08-29) status was BLOCKED with a
 * genuinely diagnosed technical failure, NOT just an upstream-lineage wait: cosine similarity
 * between Ollama's embeddinggemma output and the WebGPU-computed embedding for the SAME
 * rendered input was ~0.016 (candidate 0) / -0.053 (candidate 1) -- essentially uncorrelated,
 * with maxAbsDelta ~0.65-0.72 on unit vectors. Both report 768 dimensions, so this is not a
 * dimension mismatch -- the WebGPU inference path is producing a materially different
 * embedding than the canonical model, independent of any lineage/graph-owner blocker.
 * Recommend: before re-running this proof, verify the WebGPU path is using the exact same
 * model weights/tokenizer/normalization as Ollama's embeddinggemma:latest -- this looks like a
 * real implementation bug (wrong model, missing normalization, or a broken WebGPU inference
 * graph), not a data-readiness gap.
 *
 * FOLLOW-UP DIAGNOSTIC (2026-09-15, same day): dug further into the local ONNX model directory
 * (static/embeddinggemma_300m_onnx/) rather than guessing. Both inputs ARE identical (line 110:
 * the exact same `renderedInput` string is sent to both embedOllama() and embedWebGpu()), so the
 * divergence is in HOW each path embeds that one string, not a prompt-template mismatch. Found
 * 2 real inconsistencies in the model's own metadata, neither individually confirmed as THE
 * cause of a near-zero cosine (a genuine quantization or config-mismatch would usually degrade
 * quality, not produce ~random output), but both real and worth checking before deeper debugging:
 *   1. `model_info.json` says `"quantized": true, "quantization_type": "QInt8"`, but
 *      `config.json` says `"dtype": "float32"` -- inconsistent metadata about whether this is
 *      really an INT8-quantized ONNX export or not.
 *   2. `model_info.json` says `"max_sequence_length": 512`, but `tokenizer_config.json` says
 *      `"model_max_length": 2048` (matching this script's own `max_length: 2048` tokenizer
 *      call) -- if the ONNX graph was actually exported/trained for 512, using 2048 wouldn't
 *      itself flip cosine to ~0 for these short test strings, but it's a real, unexplained
 *      mismatch. `tokenizer_config.json` confirms `add_bos_token: true, add_eos_token: true`,
 *      so BOS/EOS omission is NOT the cause (ruled out, not assumed).
 * Real next step for whoever picks this up: instrument embedWebGpu() to dump the raw ONNX
 * output tensor for one short, fixed string and manually inspect it (does it look like
 * meaningful embedding structure, or garbage/all-zeros/all-same-value?) -- that would
 * distinguish "wrong model weights loaded" from "correct model, wrong pooling/output parsing"
 * far faster than reasoning about metadata alone.
 */
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
  // FIX (2026-09-15): tokenizer_config.json's model_max_length (2048) is the tokenizer's own
  // generic default, NOT this specific ONNX export's real capacity. Live re-run confirmed the
  // graph has a fixed-size positional/attention buffer sized for 512 -- a 628-token input threw
  // `Add node ... right operand cannot broadcast on dim 3 LeftShape:{1,3,628,628}
  // RightShape:{1,1,628,512}`. model_info.json's `max_sequence_length: 512` was a real
  // constraint, not just inconsistent metadata (see the earlier TODO entry above).
  const encoded = await tokenizer(text, { return_tensors: 'np', truncation: true, max_length: 512 });
  const ids = Array.from(encoded.input_ids.data, Number);
  const mask = Array.from(encoded.attention_mask.data, Number);
  if (ids.length > 2048) throw new Error(`WEBGPU_MODEL_CONTEXT_LIMIT_2048:${ids.length}`);
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
    // FIX (2026-09-15): the bare model name failed to resolve tokenizer_config.json in this
    // environment (`TypeError: Cannot read properties of undefined (reading 'tokenizer_class')`,
    // reproduced from both repo root and services/embedding-onnx-webgpu as cwd) -- confirmed via
    // scripts/atlas/diagnose-webgpu-onnx-raw-output-v1.mjs that an absolute path resolves cleanly
    // and produces correct BOS(2)/EOS(1) tokens plus structured (non-garbage) raw model output.
    // This was very likely silently producing wrong/fallback tokenization for every embedding
    // this proof script computed, which would fully explain the near-zero cosine parity result.
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(resolve(root, 'sveltekit-frontend/static/embeddinggemma_300m_onnx'), { local_files_only: true });
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
