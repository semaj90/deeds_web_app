/**
 * P2.5 — per-vector minmax-uint8 quantization recall evaluation.
 *
 * Quantizer contract (from quantize.ts):
 *   1. Find per-vector min/max.
 *   2. Map each component to uint8 [0, 255].
 *   3. Store (bytes, min, max) beside the vector.
 *   4. Dequantize back to float32 for similarity search.
 *
 * This is NOT Qdrant INT8 signed scalar quantization (collection-level
 * calibration with quantile clipping). It is per-vector minmax uint8
 * with full dequantization before scoring. Record the distinction in
 * every artifact so runs remain comparable across commits.
 *
 * Environment flags:
 *   ATLAS_EVAL_ARTIFACTS=1  — write JSON artifact to disk
 *   ATLAS_EVAL_PERSIST=1    — write artifact + evaluation_runs/evaluation_results
 *                             (implies ATLAS_EVAL_ARTIFACTS=1)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { quantizeFloat32ToUint8, dequantizeUint8ToFloat32 } from './quantize.js';

// ---------------------------------------------------------------------------
// Report schema
// ---------------------------------------------------------------------------

export interface QuantizationRecallEvalReport {
  schemaVersion: 'atlas-quantization-recall-v1';
  runId: string;
  createdAt: string;
  gitCommit: string | null;
  seed: number;
  corpus: {
    vectorCount: number;
    queryCount: number;
    dimension: number;
    corpusHash: string;
    querySetHash: string;
  };
  quantizer: {
    implementation: 'per-vector-minmax-uint8';
    sourceModule: 'src/lib/server/vector/quantize.ts';
    storageType: 'uint8';
    comparisonType: 'dequantized-float32';
  };
  configuration: {
    k: number;
    acceptableRecallAt10: number;
    tailGuardMinRecall: number;
    tailGuardMaxFailFraction: number;
    minimumQueries: number;
  };
  aggregate: {
    recallAt10: number;
    meanOverlapAt10: number;
    exactTop1Agreement: number;
    meanCosineError: number;
    p95CosineError: number;
    maxCosineError: number;
    tailFailFraction: number;
    pass: boolean;
  };
  latency: {
    float32SearchMs: { p50: number; p95: number; p99: number };
    quantizedSearchMs: { p50: number; p95: number; p99: number };
  };
  perQuery: Array<{
    queryId: string;
    recallAt10: number;
    overlapCount: number;
    float32Top10: string[];
    quantizedTop10: string[];
    float32Top1: string;
    quantizedTop1: string;
    latencyFloat32Ms: number;
    latencyQuantizedMs: number;
    cosineErrorMean: number;
  }>;
  gate: {
    status: 'PASS' | 'FAIL';
    reasons: string[];
  };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export const EVAL_GATES = {
  recallAt10: 0.98,
  exactTop1Agreement: 0.95,
  meanCosineError: 0.002,
  p95CosineError: 0.01,
  tailGuardMinRecall: 0.80,
  tailGuardMaxFailFraction: 0.02,
  minimumQueries: 100,
} as const;

// ---------------------------------------------------------------------------
// Deterministic corpus generator (LCG — same as quantization-recall.spec.ts)
// ---------------------------------------------------------------------------

export function generateCorpusEval(n: number, dim: number, seed = 42): Float32Array[] {
  let s = seed;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0x100000000) * 2 - 1;
  };
  return Array.from({ length: n }, () => {
    const v = new Float32Array(dim);
    let norm = 0;
    for (let i = 0; i < dim; i++) { v[i] = lcg(); norm += v[i] * v[i]; }
    const inv = 1 / (Math.sqrt(norm) || 1);
    for (let i = 0; i < dim; i++) v[i] *= inv;
    return v;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cosineSimilarityF32(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1e-10);
}

function topK(scores: number[], k: number): number[] {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(x => x.i);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1);
  return sorted[idx] ?? 0;
}

function sha256hex(data: string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

function corpusHash(vectors: Float32Array[]): string {
  const sample = vectors.slice(0, 10).map(v => Array.from(v.slice(0, 8)).join(','));
  return sha256hex(`n=${vectors.length}:${sample.join('|')}`);
}

function gitCommit(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('node:child_process');
    return (execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }) as Buffer)
      .toString().trim();
  } catch { return null; }
}

function runId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

export function runQuantizationRecallEval(opts: {
  vectorCount?: number;
  queryCount?: number;
  dimension?: number;
  seed?: number;
  k?: number;
}): QuantizationRecallEvalReport {
  const {
    vectorCount = 1000,
    queryCount = 100,
    dimension = 64,
    seed = 42,
    k = 10,
  } = opts;

  const corpus = generateCorpusEval(vectorCount, dimension, seed);
  const queries = generateCorpusEval(queryCount, dimension, seed + 1);

  // Pre-quantize corpus
  const quantizedCorpus = corpus.map(v => quantizeFloat32ToUint8(v));

  const perQuery: QuantizationRecallEvalReport['perQuery'] = [];
  const f32Latencies: number[] = [];
  const qLatencies: number[] = [];
  const cosineErrors: number[] = [];
  const recallValues: number[] = [];

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];

    // Float32 search
    const t0f = performance.now();
    const f32scores = corpus.map(c => cosineSimilarityF32(q, c));
    const f32top = topK(f32scores, k);
    const latencyF32 = performance.now() - t0f;

    // Quantized search (dequantize then score)
    const t0q = performance.now();
    const qscores = quantizedCorpus.map(({ bytes, min, max }) => {
      const dq = dequantizeUint8ToFloat32(bytes, min, max);
      return cosineSimilarityF32(q, dq);
    });
    const qtop = topK(qscores, k);
    const latencyQ = performance.now() - t0q;

    // Recall
    const groundTruth = new Set(f32top);
    const hits = qtop.filter(i => groundTruth.has(i)).length;
    const recall = hits / k;

    // Per-component cosine errors (between original and dequantized)
    let errSum = 0;
    for (const idx of f32top) {
      const dq = dequantizeUint8ToFloat32(
        quantizedCorpus[idx].bytes,
        quantizedCorpus[idx].min,
        quantizedCorpus[idx].max,
      );
      const original = corpus[idx];
      const err = Math.abs(cosineSimilarityF32(q, original) - cosineSimilarityF32(q, dq));
      errSum += err;
      cosineErrors.push(err);
    }

    f32Latencies.push(latencyF32);
    qLatencies.push(latencyQ);
    recallValues.push(recall);

    perQuery.push({
      queryId: `q${qi.toString().padStart(4, '0')}`,
      recallAt10: recall,
      overlapCount: hits,
      float32Top10: f32top.map(i => `c${i}`),
      quantizedTop10: qtop.map(i => `c${i}`),
      float32Top1: `c${f32top[0]}`,
      quantizedTop1: `c${qtop[0]}`,
      latencyFloat32Ms: parseFloat(latencyF32.toFixed(4)),
      latencyQuantizedMs: parseFloat(latencyQ.toFixed(4)),
      cosineErrorMean: parseFloat((errSum / k).toFixed(6)),
    });
  }

  // Aggregate
  const meanRecall = recallValues.reduce((s, r) => s + r, 0) / recallValues.length;
  const meanOverlap = perQuery.reduce((s, r) => s + r.overlapCount, 0) / perQuery.length;
  const top1Agreement = perQuery.filter(r => r.float32Top1 === r.quantizedTop1).length / perQuery.length;

  cosineErrors.sort((a, b) => a - b);
  const meanCosErr = cosineErrors.reduce((s, e) => s + e, 0) / (cosineErrors.length || 1);
  const p95CosErr = percentile(cosineErrors, 0.95);
  const maxCosErr = cosineErrors[cosineErrors.length - 1] ?? 0;

  const tailFails = recallValues.filter(r => r < EVAL_GATES.tailGuardMinRecall).length;
  const tailFailFraction = tailFails / recallValues.length;

  f32Latencies.sort((a, b) => a - b);
  qLatencies.sort((a, b) => a - b);

  // Gate evaluation
  const reasons: string[] = [];
  if (queryCount < EVAL_GATES.minimumQueries)
    reasons.push(`queries=${queryCount} < minimumQueries=${EVAL_GATES.minimumQueries}`);
  if (meanRecall < EVAL_GATES.recallAt10)
    reasons.push(`recall@10=${meanRecall.toFixed(4)} < threshold=${EVAL_GATES.recallAt10}`);
  if (top1Agreement < EVAL_GATES.exactTop1Agreement)
    reasons.push(`top1Agreement=${top1Agreement.toFixed(4)} < ${EVAL_GATES.exactTop1Agreement}`);
  if (meanCosErr > EVAL_GATES.meanCosineError)
    reasons.push(`meanCosineError=${meanCosErr.toFixed(6)} > ${EVAL_GATES.meanCosineError}`);
  if (p95CosErr > EVAL_GATES.p95CosineError)
    reasons.push(`p95CosineError=${p95CosErr.toFixed(6)} > ${EVAL_GATES.p95CosineError}`);
  if (tailFailFraction > EVAL_GATES.tailGuardMaxFailFraction)
    reasons.push(`tailFailFraction=${tailFailFraction.toFixed(4)} > ${EVAL_GATES.tailGuardMaxFailFraction}`);

  const pass = reasons.length === 0;

  return {
    schemaVersion: 'atlas-quantization-recall-v1',
    runId: runId(),
    createdAt: new Date().toISOString(),
    gitCommit: gitCommit(),
    seed,
    corpus: {
      vectorCount,
      queryCount,
      dimension,
      corpusHash: corpusHash(corpus),
      querySetHash: corpusHash(queries),
    },
    quantizer: {
      implementation: 'per-vector-minmax-uint8',
      sourceModule: 'src/lib/server/vector/quantize.ts',
      storageType: 'uint8',
      comparisonType: 'dequantized-float32',
    },
    configuration: {
      k,
      acceptableRecallAt10: EVAL_GATES.recallAt10,
      tailGuardMinRecall: EVAL_GATES.tailGuardMinRecall,
      tailGuardMaxFailFraction: EVAL_GATES.tailGuardMaxFailFraction,
      minimumQueries: EVAL_GATES.minimumQueries,
    },
    aggregate: {
      recallAt10: parseFloat(meanRecall.toFixed(6)),
      meanOverlapAt10: parseFloat(meanOverlap.toFixed(4)),
      exactTop1Agreement: parseFloat(top1Agreement.toFixed(4)),
      meanCosineError: parseFloat(meanCosErr.toFixed(6)),
      p95CosineError: parseFloat(p95CosErr.toFixed(6)),
      maxCosineError: parseFloat(maxCosErr.toFixed(6)),
      tailFailFraction: parseFloat(tailFailFraction.toFixed(4)),
      pass,
    },
    latency: {
      float32SearchMs: {
        p50: parseFloat(percentile(f32Latencies, 0.50).toFixed(4)),
        p95: parseFloat(percentile(f32Latencies, 0.95).toFixed(4)),
        p99: parseFloat(percentile(f32Latencies, 0.99).toFixed(4)),
      },
      quantizedSearchMs: {
        p50: parseFloat(percentile(qLatencies, 0.50).toFixed(4)),
        p95: parseFloat(percentile(qLatencies, 0.95).toFixed(4)),
        p99: parseFloat(percentile(qLatencies, 0.99).toFixed(4)),
      },
    },
    perQuery,
    gate: { status: pass ? 'PASS' : 'FAIL', reasons },
  };
}

// ---------------------------------------------------------------------------
// Artifact writer (ATLAS_EVAL_ARTIFACTS=1 or ATLAS_EVAL_PERSIST=1)
// ---------------------------------------------------------------------------

export function writeEvalArtifact(report: QuantizationRecallEvalReport, rootDir: string): string {
  const dir = join(rootDir, 'artifacts', 'evaluations', 'quantization-recall');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const ts = report.createdAt.replace(/[:.]/g, '').replace('T', 'T').slice(0, 17) + 'Z';
  const filename = `quantization-recall-${ts}.json`;
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return join('artifacts', 'evaluations', 'quantization-recall', filename);
}

// ---------------------------------------------------------------------------
// CI console summary (one block, deterministic)
// ---------------------------------------------------------------------------

export function printEvalSummary(report: QuantizationRecallEvalReport, artifactPath?: string): void {
  const a = report.aggregate;
  const c = report.corpus;
  const lat = report.latency;
  const status = report.gate.status;
  const indicator = status === 'PASS' ? 'PASS' : 'FAIL';

  const lines = [
    `[P2.5 quantization-recall]`,
    `vectors=${c.vectorCount} queries=${c.queryCount} dim=${c.dimension} k=${report.configuration.k}`,
    `quantizer=${report.quantizer.implementation}`,
    `recall@10=${a.recallAt10.toFixed(4)} threshold=${report.configuration.acceptableRecallAt10.toFixed(4)} ${indicator}`,
    `top1_agreement=${a.exactTop1Agreement.toFixed(4)}`,
    `mean_cosine_error=${a.meanCosineError.toFixed(5)} p95=${a.p95CosineError.toFixed(5)}`,
    `tail_fail_fraction=${a.tailFailFraction.toFixed(4)} (guard<${report.configuration.tailGuardMaxFailFraction})`,
    `float32_p95_ms=${lat.float32SearchMs.p95.toFixed(3)} quantized_p95_ms=${lat.quantizedSearchMs.p95.toFixed(3)}`,
  ];

  if (artifactPath) lines.push(`artifact=${artifactPath}`);
  if (report.gate.reasons.length) {
    lines.push(`failures:`);
    for (const r of report.gate.reasons) lines.push(`  - ${r}`);
  }

  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// DB persistence (ATLAS_EVAL_PERSIST=1) — lazy import, no hard dep
// ---------------------------------------------------------------------------

export async function persistEvalToDb(
  report: QuantizationRecallEvalReport,
  artifactPath: string,
): Promise<void> {
  // Lazy import so vitest runs don't require a live DB
  const { db } = await import('../db/client.js');
  const { sql } = await import('drizzle-orm');

  const startedAt = new Date(report.createdAt);
  const completedAt = new Date();

  // Insert evaluation_runs row
  const [run] = await db.execute<{ id: string }>(sql`
    INSERT INTO evaluation_runs (
      run_type, benchmark_name, dataset_version, implementation_version,
      config, status, passed, artifact_path, started_at, completed_at
    ) VALUES (
      'quantization_recall',
      'per-vector-minmax-uint8-vs-float32-top10',
      ${report.corpus.corpusHash},
      ${report.gitCommit},
      ${JSON.stringify({
        k: report.configuration.k,
        seed: report.seed,
        dimension: report.corpus.dimension,
        vectorCount: report.corpus.vectorCount,
        queryCount: report.corpus.queryCount,
        acceptableRecallAt10: report.configuration.acceptableRecallAt10,
        quantizer: report.quantizer.implementation,
      })}::jsonb,
      'completed',
      ${report.aggregate.pass},
      ${artifactPath},
      ${startedAt.toISOString()},
      ${completedAt.toISOString()}
    )
    RETURNING id
  `);

  const runId = (run as unknown as { id: string }).id;

  // Aggregate result row
  await db.execute(sql`
    INSERT INTO evaluation_results (run_id, query_id, result_scope, metrics)
    VALUES (
      ${runId}::uuid,
      NULL,
      'aggregate',
      ${JSON.stringify({
        recall_at_10: report.aggregate.recallAt10,
        mean_overlap_at_10: report.aggregate.meanOverlapAt10,
        exact_top1_agreement: report.aggregate.exactTop1Agreement,
        mean_cosine_error: report.aggregate.meanCosineError,
        p95_cosine_error: report.aggregate.p95CosineError,
        max_cosine_error: report.aggregate.maxCosineError,
        tail_fail_fraction: report.aggregate.tailFailFraction,
        pass: report.aggregate.pass,
        float32_p50_ms: report.latency.float32SearchMs.p50,
        float32_p95_ms: report.latency.float32SearchMs.p95,
        quantized_p50_ms: report.latency.quantizedSearchMs.p50,
        quantized_p95_ms: report.latency.quantizedSearchMs.p95,
      })}::jsonb
    )
  `);

  // Per-query result rows (batch insert)
  for (const pq of report.perQuery) {
    await db.execute(sql`
      INSERT INTO evaluation_results (run_id, query_id, result_scope, metrics)
      VALUES (
        ${runId}::uuid,
        ${pq.queryId},
        'per_query',
        ${JSON.stringify({
          recall_at_10: pq.recallAt10,
          overlap_at_10: pq.overlapCount,
          top1_agreement: pq.float32Top1 === pq.quantizedTop1,
          cosine_error_mean: pq.cosineErrorMean,
          float32_latency_ms: pq.latencyFloat32Ms,
          quantized_latency_ms: pq.latencyQuantizedMs,
        })}::jsonb
      )
    `);
  }
}
