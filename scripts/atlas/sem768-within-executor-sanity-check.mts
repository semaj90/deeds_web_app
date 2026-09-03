#!/usr/bin/env node
/**
 * SEM768 within-executor semantic sanity check.
 *
 * Born from ORT-CPU-SEMANTIC-PARITY-01 (docs/reports/ort-cpu-semantic-parity-01.json):
 * comparing two embedding executors directly against each other (cross-executor
 * cosine) can't distinguish "both executors are broken in different ways" from
 * "one is healthy and one is broken" — a near-zero cross-executor cosine is
 * consistent with either. This script tests each executor IN ISOLATION instead:
 * embed known-similar and known-dissimilar text pairs through ONE executor at a
 * time, and check whether that executor's own cosine scores separate similar
 * from dissimilar content. A healthy executor shows a real gap; a broken one
 * (e.g. an under-calibrated quantized export producing anisotropic/collapsed
 * embeddings) does not.
 *
 * This is how the ORT-CPU-SEMANTIC-PARITY-01 investigation actually located
 * the fault: :8081 (GGUF/CUDA) showed a ~0.30 discrimination gap (healthy);
 * the local QInt8 ONNX export showed only a ~0.04 gap, with everything
 * compressed into a narrow 0.88-0.94 cosine band regardless of content
 * (anisotropic collapse — a known failure mode of naive post-training
 * quantization on mean-pooled transformer embeddings without calibration).
 *
 * Keep this as a reusable regression check: rerun it whenever a new embedding
 * executor/export is added, or after re-exporting/re-quantizing an existing
 * one, to catch this failure mode before it reaches SEM768-EXECUTOR-BENCH.
 *
 * Zero database writes. Real embedding calls against whichever executors are
 * configured below and currently running.
 *
 * Usage (must run via tsx from sveltekit-frontend/ so onnx-embed.ts resolves):
 *   cd sveltekit-frontend && npx tsx ../scripts/atlas/sem768-within-executor-sanity-check.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = resolve(ROOT, 'sveltekit-frontend');
const REPORT = resolve(ROOT, 'docs/reports/sem768-within-executor-sanity-check.json');

const EMBED_8081_URL = process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8081/v1/embeddings';

// Discrimination gap below this is flagged as UNHEALTHY. Chosen from the
// ORT-CPU-SEMANTIC-PARITY-01 result: 0.30 (healthy :8081) vs 0.04 (broken
// ONNX QInt8) — 0.15 sits cleanly between the two observed real values.
const HEALTHY_GAP_THRESHOLD = 0.15;

// 2 clearly related pairs + 2 clearly unrelated pairs. Real short phrases,
// deliberately simple so a healthy executor's separation is unambiguous.
const CASES = [
  { a: 'user login and password authentication', b: 'session validation and auth tokens', expected: 'SIMILAR' },
  { a: 'Postgres database query and SQL joins', b: 'relational database indexing and transactions', expected: 'SIMILAR' },
  { a: 'user login and password authentication', b: 'chocolate cake recipe with frosting', expected: 'DISSIMILAR' },
  { a: 'Postgres database query and SQL joins', b: 'weather forecast for tomorrow afternoon', expected: 'DISSIMILAR' },
] as const;

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed8081(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(EMBED_8081_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma', input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data[0].embedding;
  } catch {
    return null;
  }
}

type ExecutorResult = {
  name: string;
  available: boolean;
  similarPairCosines: number[];
  dissimilarPairCosines: number[];
  discriminationGap: number | null;
  verdict: 'HEALTHY' | 'UNHEALTHY' | 'UNAVAILABLE';
};

async function runExecutor(
  name: string,
  embed: (text: string) => Promise<number[] | null>,
): Promise<ExecutorResult> {
  const similar: number[] = [];
  const dissimilar: number[] = [];
  let anyFailure = false;

  for (const c of CASES) {
    const [va, vb] = await Promise.all([embed(c.a), embed(c.b)]);
    if (!va || !vb) { anyFailure = true; continue; }
    const cos = cosine(va, vb);
    if (c.expected === 'SIMILAR') similar.push(cos); else dissimilar.push(cos);
  }

  if (anyFailure || similar.length === 0 || dissimilar.length === 0) {
    return { name, available: false, similarPairCosines: similar, dissimilarPairCosines: dissimilar, discriminationGap: null, verdict: 'UNAVAILABLE' };
  }

  const meanSimilar = similar.reduce((s, v) => s + v, 0) / similar.length;
  const meanDissimilar = dissimilar.reduce((s, v) => s + v, 0) / dissimilar.length;
  const gap = meanSimilar - meanDissimilar;

  return {
    name,
    available: true,
    similarPairCosines: similar,
    dissimilarPairCosines: dissimilar,
    discriminationGap: gap,
    verdict: gap >= HEALTHY_GAP_THRESHOLD ? 'HEALTHY' : 'UNHEALTHY',
  };
}

async function main() {
  const results: ExecutorResult[] = [];

  results.push(await runExecutor('8081_gguf_cuda', embed8081));

  try {
    const onnxEmbedUrl = pathToFileURL(resolve(FRONTEND, 'src/lib/server/embedding/onnx-embed.ts')).href;
    const { tryEmbedOnnx } = await import(onnxEmbedUrl);
    results.push(await runExecutor('onnx_cpu', (text: string) => tryEmbedOnnx(text)));
  } catch (err) {
    results.push({
      name: 'onnx_cpu',
      available: false,
      similarPairCosines: [],
      dissimilarPairCosines: [],
      discriminationGap: null,
      verdict: 'UNAVAILABLE',
    });
    console.error(`onnx_cpu executor unavailable: ${(err as Error).message}`);
  }

  for (const r of results) {
    console.log(`\n=== ${r.name} ===`);
    if (!r.available) { console.log('UNAVAILABLE'); continue; }
    console.log(`SIMILAR    cosines=${r.similarPairCosines.map((v) => v.toFixed(4)).join(', ')}`);
    console.log(`DISSIMILAR cosines=${r.dissimilarPairCosines.map((v) => v.toFixed(4)).join(', ')}`);
    console.log(`discriminationGap=${r.discriminationGap?.toFixed(4)}  verdict=${r.verdict}`);
  }

  const report = {
    schema: 'atlas.sem768-within-executor-sanity-check.report',
    generatedAt: new Date().toISOString(),
    databaseWrites: false,
    healthyGapThreshold: HEALTHY_GAP_THRESHOLD,
    cases: CASES,
    results,
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${REPORT}`);

  const anyUnhealthy = results.some((r) => r.verdict === 'UNHEALTHY');
  process.exit(anyUnhealthy ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
