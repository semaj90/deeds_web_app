#!/usr/bin/env node
/**
 * Throughput probe for scaling ORDINAL-VECTOR-01-CANARY / ACE-V4-COMP-01-CANARY
 * from 8 rows to the full 16,151-row CandidateOrdinalMapV1 corpus.
 *
 * Measures real per-request embedding latency against the live :8081 executor
 * for a spread sample (not just the first N -- file size varies a lot across
 * the corpus), at both sequential (concurrency=1) and a modest concurrent
 * fan-out, so a full-corpus time estimate is measured, not guessed.
 *
 * Read-only: only calls the already-running embedding executor and reads
 * real source files. Writes a local receipt only.
 *
 * Usage: node scripts/atlas/ordinal-vector-throughput-probe-v1.mjs [--sample=30] [--concurrency=4]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

for (const envFile of ['.env', '.env.local']) {
  const envPath = path.join(FRONTEND_ROOT, envFile);
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

const MAP_ARTIFACT = path.join(REPO_ROOT, '.tmp/atlas/cei24-candidate-ordinal-map-v1/20260926T161327.479Z/candidate-ordinal-map-v1.json');
const EMBEDDING_URL = process.env.EMBEDDING_STRICT_BASE_URL ?? 'http://127.0.0.1:8081';
const EMBEDDING_MODEL = process.env.EMBEDDING_SERVER_MODEL ?? 'embeddinggemma';
const MAX_EMBED_CHARS = 4000;

const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? Number(sampleArg.split('=')[1]) : 30;
const concArg = process.argv.find((a) => a.startsWith('--concurrency='));
const CONCURRENCY = concArg ? Number(concArg.split('=')[1]) : 4;

async function embedTimed(text) {
  const t0 = performance.now();
  const res = await fetch(`${EMBEDDING_URL}/v1/embeddings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  const ok = res.ok;
  if (ok) await res.json(); // consume body to include full round-trip cost
  return { ms: performance.now() - t0, ok };
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

async function main() {
  const map = JSON.parse(readFileSync(MAP_ARTIFACT, 'utf8'));
  const total = map.rowCount;
  // Spread sample evenly across the corpus (not just the first N) to capture
  // real file-size variance, not just whatever sorts first alphabetically.
  const stride = Math.max(1, Math.floor(total / SAMPLE_SIZE));
  const sampleCandidates = [];
  for (let i = 0; i < total && sampleCandidates.length < SAMPLE_SIZE; i += stride) {
    sampleCandidates.push(map.candidates[i]);
  }

  const inputs = [];
  for (const c of sampleCandidates) {
    const abs = path.join(REPO_ROOT, c.sourceRef);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    const text = buf.toString('utf8');
    inputs.push({ ordinal: c.candidateOrdinal, sourceRef: c.sourceRef, byteLength: buf.length, embedInput: text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text });
  }

  // --- Sequential (concurrency=1) ---
  const seqTimings = [];
  const seqStart = performance.now();
  for (const input of inputs) {
    const { ms, ok } = await embedTimed(input.embedInput);
    seqTimings.push({ ...input, ms, ok });
  }
  const seqWallMs = performance.now() - seqStart;

  // --- Concurrent fan-out ---
  const concTimings = [];
  const concStart = performance.now();
  let cursor = 0;
  async function worker() {
    while (cursor < inputs.length) {
      const input = inputs[cursor++];
      const { ms, ok } = await embedTimed(input.embedInput);
      concTimings.push({ ...input, ms, ok });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const concWallMs = performance.now() - concStart;

  const seqMsSorted = seqTimings.map((t) => t.ms).sort((a, b) => a - b);
  const concMsSorted = concTimings.map((t) => t.ms).sort((a, b) => a - b);

  const seqFailures = seqTimings.filter((t) => !t.ok).length;
  const concFailures = concTimings.filter((t) => !t.ok).length;

  const seqPerRequestAvgMs = seqWallMs / inputs.length;
  const concPerRequestAvgMs = concWallMs / inputs.length; // wall-clock per request, accounting for fan-out

  const receipt = {
    schema: 'atlas.ordinal-vector-throughput-probe.v1',
    generatedAt: new Date().toISOString(),
    embeddingExecutor: { url: EMBEDDING_URL, model: EMBEDDING_MODEL },
    corpus: { totalRows: total, sampledRows: inputs.length, stride },
    sequential: {
      wallMs: Math.round(seqWallMs),
      perRequestAvgMs: Math.round(seqPerRequestAvgMs),
      p50Ms: Math.round(percentile(seqMsSorted, 0.5)),
      p90Ms: Math.round(percentile(seqMsSorted, 0.9)),
      maxMs: Math.round(seqMsSorted[seqMsSorted.length - 1] ?? 0),
      failures: seqFailures,
      projectedFullCorpusMinutes: Math.round((seqPerRequestAvgMs * total) / 60000 * 10) / 10,
    },
    concurrent: {
      concurrency: CONCURRENCY,
      wallMs: Math.round(concWallMs),
      perRequestWallAvgMs: Math.round(concPerRequestAvgMs),
      p50Ms: Math.round(percentile(concMsSorted, 0.5)),
      p90Ms: Math.round(percentile(concMsSorted, 0.9)),
      maxMs: Math.round(concMsSorted[concMsSorted.length - 1] ?? 0),
      failures: concFailures,
      speedupVsSequential: Math.round((seqPerRequestAvgMs / concPerRequestAvgMs) * 100) / 100,
      projectedFullCorpusMinutes: Math.round((concPerRequestAvgMs * total) / 60000 * 10) / 10,
    },
    fileByteLengthStats: {
      minBytes: Math.min(...inputs.map((i) => i.byteLength)),
      maxBytes: Math.max(...inputs.map((i) => i.byteLength)),
      avgBytes: Math.round(inputs.reduce((s, i) => s + i.byteLength, 0) / inputs.length),
    },
    authority: { databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 },
    status: seqFailures === 0 && concFailures === 0 ? 'THROUGHPUT_PROBE_CLEAN' : 'THROUGHPUT_PROBE_HAD_FAILURES',
  };

  const outPath = path.join(REPO_ROOT, 'docs', 'reports', `ordinal-vector-throughput-probe-v1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, _fullReceipt: outPath }, null, 2));
}

main().catch((err) => { console.error('FATAL', err); process.exitCode = 1; });
