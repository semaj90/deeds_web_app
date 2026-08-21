#!/usr/bin/env node
/**
 * EG-GGUF-0..3 read-only executor proof.
 *
 * No downloads. No model conversion. No Qdrant/Postgres/Valkey writes.
 * The operator must point EMBED_MODEL_PATH at the local Q8_0 GGUF and
 * LLAMA_SERVER_PATH at the exact llama-server binary under test.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const REPORT = path.resolve(ROOT, 'docs/reports/embeddinggemma-q8-executor-proof.json');
const SERVER_URL = (process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const MODEL_PATH = process.env.EMBED_MODEL_PATH || '';
const LLAMA_PATH = process.env.LLAMA_SERVER_PATH || '';
const EXPECTED_UPSTREAM_SHA256 = process.env.EMBED_EXPECTED_SHA256 || null;
const REPEATS = Math.max(2, Number(process.env.EMBED_REPEAT_PROOF_COUNT || '5'));
const NATIVE_DIM = 768;

function sha256Text(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
function l2(values) {
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return Number.NaN;
    sum += value * value;
  }
  return Math.sqrt(sum);
}
function cosine(a, b) {
  if (a.length !== b.length) return Number.NaN;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return dot / Math.sqrt(aa * bb);
}
function format(mode, text, title = 'none') {
  if (mode === 'retrieval_query') return `task: search result | query: ${text}`;
  if (mode === 'code_retrieval_query') return `task: code retrieval | query: ${text}`;
  if (mode === 'classification_query') return `task: classification | query: ${text}`;
  if (mode === 'retrieval_document') return `title: ${title || 'none'} | text: ${text}`;
  throw new Error(`unknown mode ${mode}`);
}
async function embed(formattedText) {
  const response = await fetch(`${SERVER_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: formattedText }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`EMBED_HTTP_${response.status}:${JSON.stringify(body).slice(0, 500)}`);
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('EMBED_RESPONSE_VECTOR_MISSING');
  return vector.map(Number);
}
function versionOf(exe) {
  try { return execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim(); }
  catch (error) { return `ERROR:${error instanceof Error ? error.message : String(error)}`; }
}

const report = {
  schema: 'atlas.embeddinggemma-executor-receipt.v1',
  generatedAt: new Date().toISOString(),
  modelId: 'google/embeddinggemma-300m',
  artifactPath: MODEL_PATH || null,
  artifactChecksum: null,
  artifactSizeBytes: null,
  upstreamChecksumExpected: EXPECTED_UPSTREAM_SHA256,
  upstreamChecksumMatched: null,
  executor: 'llama.cpp',
  executorPath: LLAMA_PATH || null,
  executorRevision: null,
  backend: 'CUDA_EXPECTED_NOT_PROVEN_BY_HTTP',
  quantization: 'Q8_0_EXPECTED_FROM_OPERATOR_PATH_NOT_INFERRED',
  nativeDimension: NATIVE_DIM,
  pooling: 'MEAN_EXPECTED_FROM_LAUNCH_CONTRACT',
  normalization: 'L2_EXPECTED_FROM_LAUNCH_CONTRACT',
  maxContextTokensPolicy: 2048,
  ubatchPolicy: 'UBATCH_MUST_FIT_ENTIRE_POOLED_INPUT',
  promptRevision: 'embeddinggemma-prompt-v1',
  repeatedRequestStable: false,
  coldWarmStable: null,
  normErrorMax: null,
  repeatedCosineMin: null,
  prompts: [],
  projectedRepresentations: ['semantic_512', 'semantic_mrl_256', 'semantic_mrl_128'],
  canonicalRepresentation: 'semantic_512',
  canonicalDefaultChanged: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
  downloadsPerformed: false,
  canonicalWritesAllowed: false,
  status: 'BLOCKED',
  blockers: [],
};

if (!MODEL_PATH) report.blockers.push('EMBED_MODEL_PATH_REQUIRED');
if (!LLAMA_PATH) report.blockers.push('LLAMA_SERVER_PATH_REQUIRED');
if (MODEL_PATH) {
  try {
    await access(MODEL_PATH);
    const s = await stat(MODEL_PATH);
    report.artifactSizeBytes = s.size;
    report.artifactChecksum = await sha256File(MODEL_PATH);
    report.upstreamChecksumMatched = EXPECTED_UPSTREAM_SHA256 ? report.artifactChecksum === EXPECTED_UPSTREAM_SHA256.toLowerCase() : null;
  } catch (error) { report.blockers.push(`MODEL_ARTIFACT_UNREADABLE:${error instanceof Error ? error.message : String(error)}`); }
}
if (LLAMA_PATH) {
  try { await access(LLAMA_PATH); report.executorRevision = versionOf(LLAMA_PATH); }
  catch (error) { report.blockers.push(`LLAMA_SERVER_UNREADABLE:${error instanceof Error ? error.message : String(error)}`); }
}

if (report.blockers.length === 0) {
  try {
    const cases = [
      ['retrieval_query', 'How does Parent Atlas resolve canonical packet identity?', 'none'],
      ['code_retrieval_query', 'Find GraphifyStructuralMaterializer source revision logic', 'none'],
      ['classification_query', 'debug a stale Qdrant projection lineage failure', 'none'],
      ['retrieval_document', 'Graphify structural evidence preserves source spans and revision lineage.', 'Parent Atlas structural evidence'],
    ];
    for (const [mode, text, title] of cases) {
      const formatted = format(mode, text, title);
      const vector = await embed(formatted);
      const norm = l2(vector);
      report.prompts.push({ mode, formattedTextSha256: sha256Text(formatted), dimension: vector.length, finite: vector.every(Number.isFinite), l2Norm: norm });
      if (vector.length !== NATIVE_DIM) report.blockers.push(`NATIVE_DIMENSION_MISMATCH:${mode}:${vector.length}`);
      if (!vector.every(Number.isFinite)) report.blockers.push(`NONFINITE_VECTOR:${mode}`);
      if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.01) report.blockers.push(`NORM_OUT_OF_POLICY:${mode}:${norm}`);
    }

    const repeatedText = format('code_retrieval_query', 'Find GraphifyStructuralMaterializer source revision logic');
    const repeated = [];
    for (let i = 0; i < REPEATS; i++) repeated.push(await embed(repeatedText));
    const baseline = repeated[0];
    const cosines = repeated.slice(1).map((vector) => cosine(baseline, vector));
    const normErrors = repeated.map((vector) => Math.abs(l2(vector) - 1));
    report.repeatedCosineMin = Math.min(...cosines);
    report.normErrorMax = Math.max(...normErrors);
    report.repeatedRequestStable = cosines.every((value) => Number.isFinite(value) && value >= 0.999999);
    if (!report.repeatedRequestStable) report.blockers.push(`REPEATED_REQUEST_INSTABILITY:${report.repeatedCosineMin}`);
  } catch (error) {
    report.blockers.push(`LIVE_EXECUTOR_PROOF_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
}

report.status = report.blockers.length === 0 ? 'PROVEN_EXECUTOR_READ_ONLY' : 'BLOCKED';
await mkdir(path.dirname(REPORT), { recursive: true });
await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, blockers: report.blockers, reportPath: REPORT }, null, 2));
if (report.status !== 'PROVEN_EXECUTOR_READ_ONLY') process.exitCode = 2;
