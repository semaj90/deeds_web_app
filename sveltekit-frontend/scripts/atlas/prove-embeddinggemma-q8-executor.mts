#!/usr/bin/env tsx

/**
 * EG-GGUF-0..5 — local, read-only EmbeddingGemma Q8_0 executor proof.
 *
 * This script NEVER downloads a model and never writes Postgres, Qdrant or
 * Valkey. With --launch it starts a separate bounded llama-server process using
 * the exact local executable/model supplied by the operator, then terminates it.
 */

import { createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS,
  EMBEDDINGGEMMA_NATIVE_DIMENSION,
  EMBEDDINGGEMMA_PROMPT_REVISION,
  encodeClassificationQuery,
  encodeCodeRetrievalQuery,
  encodeRetrievalDocument,
  encodeRetrievalQuery,
  type EmbeddingGemmaPromptedInputV1,
} from '../../src/lib/server/embedding/embeddinggemma-prompt-contract.js';

const args = process.argv.slice(2);
function value(name: string, fallback: string | null = null): string | null {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}
function flag(name: string): boolean { return args.includes(`--${name}`); }
function intValue(name: string, fallback: number): number {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`INVALID_${name.toUpperCase()}:${parsed}`);
  return parsed;
}

const launch = flag('launch');
const inspectOnly = flag('inspect-only');
const modelPath = path.resolve(value('model', process.env.EMBED_MODEL_PATH ?? '') || '.');
const llamaPath = path.resolve(value('llama', process.env.LLAMA_SERVER_PATH ?? '') || '.');
const port = intValue('port', launch ? 18081 : 8081);
const serverUrl = (value('server-url', `http://127.0.0.1:${port}`) ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');
const expectedSha256 = (value('expected-sha256', process.env.EMBED_EXPECTED_SHA256 ?? null) ?? null)?.toLowerCase() ?? null;
const repeatCount = intValue('repeats', 5);
const reportPath = path.resolve(value('report', 'docs/reports/embeddinggemma-q8-executor-proof.json')!);
const ctx = EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS;
const batch = intValue('batch', ctx);
const ubatch = intValue('ubatch', ctx);

function sha256Text(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
function float32Digest(values: readonly number[]): string {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(Math.fround(value), index * 4));
  return createHash('sha256').update(bytes).digest('hex');
}
function l2(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return Number.NaN;
    sum += value * value;
  }
  return Math.sqrt(sum);
}
function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) return Number.NaN;
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; aa += a[index] * a[index]; bb += b[index] * b[index];
  }
  return dot / Math.sqrt(aa * bb);
}
function mrlProject(native768: readonly number[], dimension: 512 | 256 | 128): number[] {
  if (native768.length !== EMBEDDINGGEMMA_NATIVE_DIMENSION) throw new Error(`NATIVE_DIMENSION_MISMATCH:${native768.length}`);
  const prefix = Array.from({ length: dimension }, (_, index) => Math.fround(native768[index]));
  const norm = l2(prefix);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error(`MRL_INVALID_NORM:${dimension}`);
  return prefix.map((item) => Math.fround(item / norm));
}
function commandOutput(exe: string, commandArgs: string[]): { ok: boolean; output: string } {
  const result = spawnSync(exe, commandArgs, { encoding: 'utf8', windowsHide: true });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

async function jsonRequest(pathname: string, body?: unknown, timeoutMs = 120_000): Promise<any> {
  const response = await fetch(`${serverUrl}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json: any;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(`HTTP_${response.status}:${pathname}:${text.slice(0, 500)}`);
  return json;
}

function vectorsFromOpenAi(body: any): number[][] {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map((row: any) => {
    if (!Array.isArray(row?.embedding)) throw new Error('EMBEDDING_RESPONSE_VECTOR_MISSING');
    return row.embedding.map(Number);
  });
}
async function embed(inputs: string | string[]): Promise<number[][]> {
  // Deliberately DO NOT send `dimensions`; Atlas owns MRL projection.
  return vectorsFromOpenAi(await jsonRequest('/v1/embeddings', { input: inputs }));
}
async function tokenCount(content: string): Promise<number | null> {
  try {
    const body = await jsonRequest('/tokenize', { content }, 30_000);
    const tokens = body?.tokens;
    return Array.isArray(tokens) ? tokens.length : null;
  } catch { return null; }
}
async function buildNearContextDocument(): Promise<{ prompted: EmbeddingGemmaPromptedInputV1; tokenCount: number | null }> {
  const unit = 'Parent Atlas structural evidence preserves source identity, revision lineage, and exact spans. ';
  let low = 1, high = 3000;
  let best = encodeRetrievalDocument(unit.repeat(32), 'Parent Atlas near-context fixture');
  let bestCount = await tokenCount(best.formattedText);
  if (bestCount == null) return { prompted: best, tokenCount: null };
  const target = Math.floor(ctx * 0.88);
  for (let step = 0; step < 14 && low <= high; step += 1) {
    const mid = Math.floor((low + high) / 2);
    const candidate = encodeRetrievalDocument(unit.repeat(mid), 'Parent Atlas near-context fixture');
    const count = await tokenCount(candidate.formattedText);
    if (count == null) break;
    if (count <= target) { best = candidate; bestCount = count; low = mid + 1; }
    else high = mid - 1;
  }
  return { prompted: best, tokenCount: bestCount };
}

async function waitForHealth(child: ChildProcessWithoutNullStreams): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (child.exitCode != null) throw new Error(`LLAMA_SERVER_EXITED:${child.exitCode}`);
    try { await jsonRequest('/health', undefined, 1000); return; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  throw new Error('LLAMA_SERVER_HEALTH_TIMEOUT');
}

const blockers: string[] = [];
let modelSizeBytes: number | null = null;
let modelSha256: string | null = null;
let executorVersion: string | null = null;
let helpText = '';

try {
  await access(modelPath);
  const modelStat = await stat(modelPath);
  if (!modelStat.isFile()) throw new Error('MODEL_PATH_NOT_FILE');
  modelSizeBytes = modelStat.size;
  modelSha256 = await sha256File(modelPath);
} catch (error) { blockers.push(`MODEL_ARTIFACT_UNREADABLE:${error instanceof Error ? error.message : String(error)}`); }

try {
  await access(llamaPath);
  const version = commandOutput(llamaPath, ['--version']);
  executorVersion = version.output || null;
  helpText = commandOutput(llamaPath, ['--help']).output;
  if (!executorVersion) blockers.push('LLAMA_CPP_VERSION_UNAVAILABLE');
} catch (error) { blockers.push(`LLAMA_SERVER_UNREADABLE:${error instanceof Error ? error.message : String(error)}`); }

if (expectedSha256 && modelSha256 && modelSha256 !== expectedSha256) blockers.push('MODEL_SHA256_DOES_NOT_MATCH_OPERATOR_EXPECTATION');
if (ubatch < ctx) blockers.push(`UBATCH_BELOW_CONTEXT_POLICY:${ubatch}<${ctx}`);
if (batch < ubatch) blockers.push(`BATCH_BELOW_UBATCH:${batch}<${ubatch}`);

let child: ChildProcessWithoutNullStreams | null = null;
let launchLog = '';
let launchedWithNormalizeFlag = false;
let liveProof: Record<string, unknown> | null = null;

try {
  if (!inspectOnly && blockers.length === 0) {
    if (launch) {
      launchedWithNormalizeFlag = /--embd-normalize/.test(helpText);
      const launchArgs = [
        '-m', modelPath,
        '--host', '127.0.0.1',
        '--port', String(port),
        '-ngl', '99',
        '--embedding',
        '--pooling', 'mean',
        '-c', String(ctx),
        '-b', String(batch),
        '-ub', String(ubatch),
        '-t', String(Math.max(1, os.cpus().length)),
      ];
      if (launchedWithNormalizeFlag) launchArgs.push('--embd-normalize', '2');
      child = spawn(llamaPath, launchArgs, { cwd: path.dirname(llamaPath), windowsHide: true, stdio: 'pipe' });
      child.stdout.on('data', (chunk) => { launchLog += chunk.toString(); });
      child.stderr.on('data', (chunk) => { launchLog += chunk.toString(); });
      await waitForHealth(child);
    } else {
      await jsonRequest('/health', undefined, 5000);
    }

    const prompts = [
      encodeRetrievalQuery('How does Parent Atlas resolve canonical packet identity?'),
      encodeCodeRetrievalQuery('Find GraphifyStructuralMaterializer source revision logic'),
      encodeClassificationQuery('debug a stale Qdrant projection lineage failure'),
      encodeRetrievalDocument('Graphify structural evidence preserves source spans and revision lineage.', 'Parent Atlas structural evidence'),
    ];
    const promptObservations = [];
    for (const prompted of prompts) {
      const [vector] = await embed(prompted.formattedText);
      const norm = l2(vector);
      promptObservations.push({
        mode: prompted.mode,
        formattedTextSha256: prompted.formattedTextSha256,
        dimension: vector.length,
        finite: vector.every(Number.isFinite),
        l2Norm: norm,
        float32Digest: float32Digest(vector),
      });
      if (vector.length !== EMBEDDINGGEMMA_NATIVE_DIMENSION) blockers.push(`NATIVE_DIMENSION_MISMATCH:${prompted.mode}:${vector.length}`);
      if (!vector.every(Number.isFinite)) blockers.push(`NONFINITE_VECTOR:${prompted.mode}`);
      if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.01) blockers.push(`NORM_OUT_OF_POLICY:${prompted.mode}:${norm}`);
    }

    const repeatedPrompt = encodeCodeRetrievalQuery('Find GraphifyStructuralMaterializer source revision logic');
    const repeats: number[][] = [];
    for (let index = 0; index < repeatCount; index += 1) repeats.push((await embed(repeatedPrompt.formattedText))[0]);
    const baseline = repeats[0];
    const repeatedCosines = repeats.slice(1).map((vector) => cosine(baseline, vector));
    const repeatedDigests = repeats.map(float32Digest);
    const repeatedRequestStable = repeatedCosines.every((score) => Number.isFinite(score) && score >= 0.999999);
    const exactDigestStable = new Set(repeatedDigests).size === 1;
    if (!repeatedRequestStable) blockers.push(`REPEATED_REQUEST_COSINE_INSTABILITY:${Math.min(...repeatedCosines)}`);

    const multiInputs = [encodeRetrievalQuery('first query'), encodeRetrievalQuery('second query')];
    const multiVectors = await embed(multiInputs.map((item) => item.formattedText));
    const multiInputPass = multiVectors.length === 2 && multiVectors.every((vector) => vector.length === EMBEDDINGGEMMA_NATIVE_DIMENSION && vector.every(Number.isFinite));
    if (!multiInputPass) blockers.push('MULTI_INPUT_CONTRACT_FAILED');

    const nearContext = await buildNearContextDocument();
    const [nearContextVector] = await embed(nearContext.prompted.formattedText);
    const nearContextPass = nearContextVector.length === EMBEDDINGGEMMA_NATIVE_DIMENSION && nearContextVector.every(Number.isFinite);
    if (!nearContextPass) blockers.push('NEAR_CONTEXT_EMBED_FAILED');
    if (nearContext.tokenCount == null) blockers.push('NEAR_CONTEXT_TOKEN_COUNT_UNPROVEN');
    else if (nearContext.tokenCount < Math.floor(ctx * 0.70) || nearContext.tokenCount >= ctx) blockers.push(`NEAR_CONTEXT_TOKEN_COUNT_OUT_OF_RANGE:${nearContext.tokenCount}`);

    const nativeForProjection = promptObservations.length ? (await embed(prompts[0].formattedText))[0] : baseline;
    const projected = ([512, 256, 128] as const).map((dimension) => {
      const vector = mrlProject(nativeForProjection, dimension);
      return { dimension, l2Norm: l2(vector), float32Digest: float32Digest(vector) };
    });

    liveProof = {
      serverUrl,
      launchedByProof: launch,
      artifactBindingProven: launch,
      launchPolicy: launch ? { ctx, batch, ubatch, pooling: 'MEAN', normalization: launchedWithNormalizeFlag ? 'L2_SERVER' : 'NOT_ASSERTED_BY_SERVER_FLAG' } : null,
      promptObservations,
      repeatedRequestStable,
      repeatedRequestExactDigestStable: exactDigestStable,
      repeatedCosineMin: repeatedCosines.length ? Math.min(...repeatedCosines) : 1,
      coldWarmStable: launch ? repeatedRequestStable : null,
      multiInputPass,
      nearContext: {
        tokenCount: nearContext.tokenCount,
        formattedTextSha256: nearContext.prompted.formattedTextSha256,
        pass: nearContextPass,
      },
      projectedRepresentations: projected,
    };
  }
} catch (error) {
  blockers.push(`LIVE_EXECUTOR_PROOF_FAILED:${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (child && child.exitCode == null) {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (child.exitCode == null) child.kill('SIGKILL');
  }
}

const cudaObserved = launch ? /cuda|ggml_cuda|NVIDIA/i.test(launchLog) : null;
const q8Observed = launch ? /q8_0/i.test(launchLog) : null;
if (launch && !cudaObserved) blockers.push('CUDA_BACKEND_NOT_OBSERVED_IN_LAUNCH_LOG');
if (launch && !q8Observed) blockers.push('Q8_0_NOT_OBSERVED_IN_LAUNCH_LOG');

const report = {
  schema: 'atlas.embeddinggemma-executor-receipt.v1',
  generatedAt: new Date().toISOString(),
  modelId: 'google/embeddinggemma-300m',
  artifactPath: modelPath,
  artifactChecksum: modelSha256,
  artifactSizeBytes: modelSizeBytes,
  expectedArtifactChecksum: expectedSha256,
  expectedArtifactChecksumMatched: expectedSha256 && modelSha256 ? expectedSha256 === modelSha256 : null,
  executor: 'llama.cpp',
  executorPath: llamaPath,
  executorRevision: executorVersion,
  backend: launch ? (cudaObserved ? 'CUDA_OBSERVED_IN_LAUNCH_LOG' : 'CUDA_NOT_OBSERVED') : 'EXISTING_SERVER_BACKEND_UNATTESTED',
  quantization: launch ? (q8Observed ? 'Q8_0_OBSERVED_IN_LAUNCH_LOG' : 'Q8_0_NOT_OBSERVED') : 'EXISTING_SERVER_QUANTIZATION_UNATTESTED',
  nativeDimension: EMBEDDINGGEMMA_NATIVE_DIMENSION,
  pooling: launch ? 'MEAN_REQUESTED' : 'EXISTING_SERVER_UNATTESTED',
  normalization: launch ? (launchedWithNormalizeFlag ? 'L2_REQUESTED' : 'SERVER_FLAG_UNAVAILABLE') : 'EXISTING_SERVER_UNATTESTED',
  contextTokens: ctx,
  batch,
  ubatch,
  promptRevision: EMBEDDINGGEMMA_PROMPT_REVISION,
  retrievalQueryPromptRevision: EMBEDDINGGEMMA_PROMPT_REVISION,
  codeQueryPromptRevision: EMBEDDINGGEMMA_PROMPT_REVISION,
  documentPromptRevision: EMBEDDINGGEMMA_PROMPT_REVISION,
  classificationPromptRevision: EMBEDDINGGEMMA_PROMPT_REVISION,
  liveProof,
  referenceExecutor: 'sentence-transformers',
  cosineParity: null,
  recallAt10: null,
  recallAt50: null,
  recallAt100: null,
  projectedRepresentations: ['semantic_512', 'semantic_mrl_256', 'semantic_mrl_128'],
  canonicalRepresentation: 'semantic_512',
  canonicalDefaultChanged: false,
  dimensionsParameterSentToLlamaCpp: false,
  downloadsPerformed: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
  canonicalWritesAllowed: false,
  launchLogSha256: launch ? sha256Text(launchLog) : null,
  status: inspectOnly
    ? (blockers.length ? 'BLOCKED_INSPECTION' : 'INSPECTED_ARTIFACT_AND_EXECUTOR')
    : blockers.length
      ? 'BLOCKED'
      : launch
        ? 'PROVEN_NATIVE_EXECUTOR_READ_ONLY'
        : 'PROVEN_NATIVE_HTTP_CONTRACT_ARTIFACT_UNBOUND',
  blockers,
  producerRevision: 'prove-embeddinggemma-q8-executor.v2',
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, blockers, reportPath }, null, 2));
if (String(report.status).startsWith('BLOCKED')) process.exitCode = 2;
