#!/usr/bin/env -S npx tsx
/**
 * SEM768-EXECUTOR-BENCH-01
 *
 * Benchmarks three embedding executors against the SAME frozen 2,000-row
 * sample (tmp/sem768-bench-2000.json, real codebase_chunk_index.summary
 * text, ORDER BY id LIMIT 2000 — deterministic):
 *   1. 8081  — dedicated GGUF/CUDA embed server (OpenAI-compatible /v1/embeddings)
 *   2. onnx  — real in-process ONNX Runtime + AutoTokenizer (the actual Tier-0
 *              path generateEmbeddings() uses — NOT the codepoint-fallback
 *              onnx_directml path from the /api/embed route)
 *   3. ollama — direct Ollama /api/embeddings
 *
 * MUST run from sveltekit-frontend/ (npx tsx ../scripts/atlas/sem768-executor-bench-01.mts)
 * so the $lib/server/embedding/onnx-embed.js import resolves — see CLAUDE.md's
 * "NPX Execution Context & Module Alias Resolution" section.
 *
 * Read-only. No database writes, no Qdrant writes. Produces
 * docs/reports/sem768-executor-bench-01.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SAMPLE_PATH = resolve(ROOT, 'tmp/sem768-bench-2000.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/sem768-executor-bench-01.json');
const BATCH_SIZE = 20;
const EXPECTED_DIM = 768;

interface Row { id: string; summary: string }
interface ExecutorMetrics {
  executor: string;
  purpose: string;
  available: boolean;
  unavailableReason: string | null;
  rows: number;
  batchSize: number;
  elapsedMs: number;
  embeddingsPerSecond: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  dimensionFailures: number;
  zeroVectors: number;
  nonFiniteVectors: number;
  normFailures: number;
  modelRevision: string | null;
  representationRevision: string;
  outputChecksum: string | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function validateVector(vec: number[] | null): { zero: boolean; nonFinite: boolean; badDim: boolean; badNorm: boolean } {
  if (!vec || !Array.isArray(vec)) return { zero: true, nonFinite: true, badDim: true, badNorm: true };
  const badDim = vec.length !== EXPECTED_DIM;
  const nonFinite = vec.some((v) => !Number.isFinite(v));
  const zero = vec.every((v) => v === 0);
  let norm = 0;
  if (!nonFinite) {
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
  }
  const badNorm = !nonFinite && (norm < 1e-6 || !Number.isFinite(norm));
  return { zero, nonFinite, badDim, badNorm };
}

async function benchGguf8081(rows: Row[]): Promise<ExecutorMetrics> {
  const url = process.env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081';
  const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
  if (!health) {
    return emptyMetrics('8081-gguf-cuda', 'PRIMARY_BULK_EMBEDDING — GPU-resident GGUF/CUDA server', rows.length, `${url}/health unreachable`);
  }

  const latencies: number[] = [];
  const embeddings: (number[] | null)[] = [];
  const start = performance.now();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${url}/v1/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'embeddinggemma', input: row.summary }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        embeddings.push(data.data?.[0]?.embedding ?? null);
      } catch {
        embeddings.push(null);
      }
      latencies.push(performance.now() - t0);
    }));
  }
  const elapsedMs = performance.now() - start;
  return finalizeMetrics('8081-gguf-cuda', 'PRIMARY_BULK_EMBEDDING — GPU-resident GGUF/CUDA server', rows.length, elapsedMs, latencies, embeddings, 'embeddinggemma-300m-f16.gguf');
}

/**
 * Runs the ONNX lane in an isolated child process. Necessary because
 * onnxruntime-node's InferenceSession.create() was found live 2026-09-02 to
 * crash the host process at the native level (exit 127, no catchable JS
 * error, reproducible with CPU-only execution provider — NOT a VRAM/CUDA
 * contention issue). onnxruntime-node@1.14.0 (2023) vs this host's
 * Node v22.17.1 is the likely cause (native addon ABI predates this Node
 * major by ~1.5 years) but that's unconfirmed — isolating it here means one
 * crashed lane doesn't take down the whole benchmark either way.
 */
async function benchOnnxCpu(rows: Row[]): Promise<ExecutorMetrics> {
  const { spawn } = await import('node:child_process');
  const probeScript = resolve(dirname(fileURLToPath(import.meta.url)), 'sem768-onnx-probe-child.mjs');

  const start = performance.now();
  const result = await new Promise<{ ok: boolean; embeddings?: (number[] | null)[]; error?: string; latencies?: number[] }>((res) => {
    const child = spawn(process.execPath, [probeScript], {
      cwd: resolve(ROOT, 'sveltekit-frontend'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code, signal) => {
      if (code !== 0) {
        res({ ok: false, error: `child exited code=${code} signal=${signal} stderr=${stderr.slice(-500)}` });
        return;
      }
      try {
        res(JSON.parse(stdout));
      } catch {
        res({ ok: false, error: `unparseable child stdout: ${stdout.slice(-500)} stderr=${stderr.slice(-500)}` });
      }
    });
    child.stdin.write(JSON.stringify({ texts: rows.map((r) => r.summary) }));
    child.stdin.end();
  });
  const elapsedMs = performance.now() - start;

  if (!result.ok) {
    return emptyMetrics('onnx-cpu', 'CONCURRENT_CHALLENGER / GPU-occupied fallback — in-process ONNX Runtime', rows.length, result.error ?? 'unknown child process failure');
  }

  const embeddings = result.embeddings ?? [];
  const latencies = result.latencies ?? embeddings.map(() => elapsedMs / Math.max(1, embeddings.length));
  return finalizeMetrics('onnx-cpu', 'CONCURRENT_CHALLENGER / GPU-occupied fallback — in-process ONNX Runtime', rows.length, elapsedMs, latencies, embeddings, 'embeddinggemma-300m-onnx');
}

async function benchOllama(rows: Row[]): Promise<ExecutorMetrics> {
  const url = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const health = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
  if (!health) {
    return emptyMetrics('ollama', 'COMPATIBILITY_FALLBACK — Ollama-managed embeddinggemma', rows.length, `${url}/api/tags unreachable`);
  }

  const latencies: number[] = [];
  const embeddings: (number[] | null)[] = [];
  const start = performance.now();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${url}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: row.summary }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        embeddings.push(data.embedding ?? null);
      } catch {
        embeddings.push(null);
      }
      latencies.push(performance.now() - t0);
    }));
  }
  const elapsedMs = performance.now() - start;
  return finalizeMetrics('ollama', 'COMPATIBILITY_FALLBACK — Ollama-managed embeddinggemma', rows.length, elapsedMs, latencies, embeddings, 'embeddinggemma:latest');
}

function emptyMetrics(executor: string, purpose: string, rows: number, reason: string): ExecutorMetrics {
  return {
    executor, purpose, available: false, unavailableReason: reason,
    rows, batchSize: BATCH_SIZE, elapsedMs: 0, embeddingsPerSecond: 0,
    p50LatencyMs: 0, p95LatencyMs: 0,
    dimensionFailures: rows, zeroVectors: 0, nonFiniteVectors: 0, normFailures: 0,
    modelRevision: null, representationRevision: 'semantic_768', outputChecksum: null,
  };
}

function finalizeMetrics(
  executor: string, purpose: string, rows: number, elapsedMs: number,
  latencies: number[], embeddings: (number[] | null)[], modelRevision: string,
): ExecutorMetrics {
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  let dimensionFailures = 0, zeroVectors = 0, nonFiniteVectors = 0, normFailures = 0;
  for (const vec of embeddings) {
    const v = validateVector(vec);
    if (v.badDim) dimensionFailures++;
    if (v.zero) zeroVectors++;
    if (v.nonFinite) nonFiniteVectors++;
    if (v.badNorm) normFailures++;
  }
  const successCount = embeddings.filter((e) => e && Array.isArray(e) && e.length === EXPECTED_DIM).length;
  return {
    executor, purpose, available: successCount > 0, unavailableReason: successCount === 0 ? 'zero successful embeddings' : null,
    rows, batchSize: BATCH_SIZE, elapsedMs: Math.round(elapsedMs),
    embeddingsPerSecond: elapsedMs > 0 ? Math.round((successCount / elapsedMs) * 1000 * 100) / 100 : 0,
    p50LatencyMs: Math.round(percentile(sortedLatencies, 50) * 100) / 100,
    p95LatencyMs: Math.round(percentile(sortedLatencies, 95) * 100) / 100,
    dimensionFailures, zeroVectors, nonFiniteVectors, normFailures,
    modelRevision, representationRevision: 'semantic_768',
    outputChecksum: sha256(embeddings.map((e) => (e ? e.slice(0, 4) : null))), // first-4-dims fingerprint, not full vectors
  };
}

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
  console.log(`[SEM768-EXECUTOR-BENCH-01] ${rows.length} frozen rows loaded from ${SAMPLE_PATH}`);

  const results: ExecutorMetrics[] = [];
  for (const [name, fn] of [
    ['8081-gguf-cuda', benchGguf8081],
    ['onnx-cpu', benchOnnxCpu],
    ['ollama', benchOllama],
  ] as const) {
    console.log(`[SEM768-EXECUTOR-BENCH-01] Running ${name}...`);
    const t0 = performance.now();
    const metrics = await fn(rows);
    console.log(`[SEM768-EXECUTOR-BENCH-01] ${name}: available=${metrics.available} elapsed=${Math.round(performance.now() - t0)}ms embeddings/sec=${metrics.embeddingsPerSecond}`);
    results.push(metrics);
  }

  const report = {
    schema: 'atlas.sem768-executor-bench.v1',
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    sampleSource: 'codebase_chunk_index.summary ORDER BY id LIMIT 2000',
    executors: results,
    writesPerformed: false,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[SEM768-EXECUTOR-BENCH-01] Report written to ${REPORT_PATH}`);
  console.table(results.map((r) => ({
    executor: r.executor, available: r.available, 'emb/sec': r.embeddingsPerSecond,
    p50ms: r.p50LatencyMs, p95ms: r.p95LatencyMs, zeroVectors: r.zeroVectors,
    dimFailures: r.dimensionFailures, reason: r.unavailableReason ?? '',
  })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
