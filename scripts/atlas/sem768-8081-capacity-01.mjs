#!/usr/bin/env node
/**
 * SEM768-8081-CAPACITY-01
 *
 * Sweeps concurrency (1, 2, 4, 8, 12, 16, 20) against the SAME frozen 2,000-row
 * sample used by SEM768-EXECUTOR-BENCH-01 (tmp/sem768-bench-2000.json), same
 * :8081 GGUF/CUDA server, same model, same 15s per-request timeout, same
 * input order, same fail-closed vector validation. Goal: find the highest
 * concurrency with ZERO failures — not maximum throughput.
 *
 * Records per level: success/failure counts, throughput/sec, p50/p95/p99,
 * error-type breakdown (timeout vs connection-refused vs HTTP error vs
 * invalid-vector), and GPU VRAM used/free at that level's start and end.
 *
 * Read-only w.r.t. Postgres/Qdrant. No writes. No dependency changes.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SAMPLE_PATH = resolve(ROOT, 'tmp/sem768-bench-2000.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/sem768-8081-capacity-01.json');
const EMBED_URL = process.env.EMBED_SERVER_URL ?? 'http://127.0.0.1:8081';
const TIMEOUT_MS = 15000;
const CONCURRENCY_LEVELS = [1, 2, 4, 8, 12, 16, 20];
const EXPECTED_DIM = 768;

function getVram() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader,nounits', { encoding: 'utf8' });
    const [used, free] = out.trim().split(',').map((s) => Number(s.trim()));
    return { usedMb: used, freeMb: free };
  } catch {
    return { usedMb: null, freeMb: null };
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 100) / 100;
}

function classifyError(err) {
  const msg = String(err?.message ?? err ?? '');
  if (err?.name === 'AbortError' || /aborted|timeout/i.test(msg)) return 'TIMEOUT';
  if (/ECONNREFUSED|ECONNRESET|EPIPE|fetch failed/i.test(msg)) return 'CONNECTION';
  if (/^HTTP_\d+/.test(msg)) return 'HTTP_ERROR';
  return 'OTHER';
}

function isValidVector(vec) {
  if (!Array.isArray(vec) || vec.length !== EXPECTED_DIM) return false;
  if (!vec.every((v) => Number.isFinite(v))) return false;
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  return norm > 1e-6 && Number.isFinite(norm);
}

async function embedOne(text, timeoutMs) {
  const res = await fetch(`${EMBED_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma', input: text }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  const vec = data.data?.[0]?.embedding ?? null;
  if (!isValidVector(vec)) throw new Error('INVALID_VECTOR');
  return vec;
}

async function runLevel(rows, concurrency, timeoutMs) {
  const vramBefore = getVram();
  const latencies = [];
  const errors = { TIMEOUT: 0, CONNECTION: 0, HTTP_ERROR: 0, INVALID_VECTOR: 0, OTHER: 0 };
  let success = 0;
  let failure = 0;

  const start = performance.now();
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (row) => {
        const t0 = performance.now();
        try {
          await embedOne(row.summary, timeoutMs);
          success++;
        } catch (err) {
          failure++;
          const msg = String(err?.message ?? err);
          const kind = msg === 'INVALID_VECTOR' ? 'INVALID_VECTOR' : classifyError(err);
          errors[kind] = (errors[kind] ?? 0) + 1;
        }
        latencies.push(performance.now() - t0);
      }),
    );
  }
  const elapsedMs = performance.now() - start;
  const vramAfter = getVram();
  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    concurrency,
    timeoutMs,
    rows: rows.length,
    success,
    failure,
    successRatePct: Math.round((success / rows.length) * 10000) / 100,
    elapsedMs: Math.round(elapsedMs),
    throughputPerSec: Math.round((success / elapsedMs) * 1000 * 100) / 100,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    errorBreakdown: errors,
    vramBefore,
    vramAfter,
  };
}

async function main() {
  const rows = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8'));
  console.log(`[SEM768-8081-CAPACITY-01] ${rows.length} frozen rows, sweeping concurrency ${CONCURRENCY_LEVELS.join(',')} at ${TIMEOUT_MS}ms timeout`);

  const levels = [];
  for (const c of CONCURRENCY_LEVELS) {
    console.log(`[SEM768-8081-CAPACITY-01] concurrency=${c}...`);
    const level = await runLevel(rows, c, TIMEOUT_MS);
    console.log(
      `[SEM768-8081-CAPACITY-01] concurrency=${c}: success=${level.success}/${level.rows} (${level.successRatePct}%) throughput=${level.throughputPerSec}/s p50=${level.p50Ms}ms p95=${level.p95Ms}ms errors=${JSON.stringify(level.errorBreakdown)}`,
    );
    levels.push(level);
  }

  const highestZeroFailureConcurrency = levels.filter((l) => l.failure === 0).reduce((max, l) => Math.max(max, l.concurrency), 0);

  const report = {
    schema: 'atlas.sem768-8081-capacity-01.v1',
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    sampleSource: 'codebase_chunk_index.summary ORDER BY id LIMIT 2000 (same frozen sample as SEM768-EXECUTOR-BENCH-01)',
    embedUrl: EMBED_URL,
    timeoutMs: TIMEOUT_MS,
    levels,
    highestZeroFailureConcurrency,
    recommendation: highestZeroFailureConcurrency > 0
      ? `Freeze bulk backfill concurrency at ${highestZeroFailureConcurrency} (highest level with 0/${rows.length} failures)`
      : 'No concurrency level achieved 0 failures at this timeout — investigate before backfill',
    writesPerformed: false,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[SEM768-8081-CAPACITY-01] Report: ${REPORT_PATH}`);
  console.table(levels.map((l) => ({
    concurrency: l.concurrency, success: l.success, failure: l.failure,
    'rate%': l.successRatePct, 'req/s': l.throughputPerSec,
    p50: l.p50Ms, p95: l.p95Ms, p99: l.p99Ms,
    timeout: l.errorBreakdown.TIMEOUT, conn: l.errorBreakdown.CONNECTION,
    http: l.errorBreakdown.HTTP_ERROR, invalidVec: l.errorBreakdown.INVALID_VECTOR,
  })));
  console.log(`[SEM768-8081-CAPACITY-01] Highest zero-failure concurrency: ${highestZeroFailureConcurrency}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
