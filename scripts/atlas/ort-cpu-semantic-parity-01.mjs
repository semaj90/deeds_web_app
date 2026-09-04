#!/usr/bin/env node
/**
 * ORT-CPU-SEMANTIC-PARITY-01 (read-only against the DB, real inference calls
 * against two already-proven-running executors)
 *
 * Not "does ONNX execute" (proven in ORT-CPU-RUNTIME-01) — "does ONNX's
 * OUTPUT agree with the proven :8081 GGUF/CUDA executor's output" for the
 * same real inputs. Same 32 texts through both executors, per-row cosine
 * similarity, plus a same-corpus nearest-neighbor rank-agreement check
 * (Recall@10-style proxy — 32 items is too small for a meaningful separate
 * query/corpus split, so each text's own top-K neighbors within the set are
 * compared across executors instead).
 *
 * IMPORTANT KNOWN ASYMMETRY (found live, not assumed away): the local ONNX
 * export (static/embeddinggemma_300m_onnx/model_info.json) declares
 * max_sequence_length=512 and is QInt8-quantized. The :8081 GGUF executor
 * handles up to 2048 tokens at higher precision. This fixture only uses
 * short texts (well under 512 tokens) so the capacity gap does not confound
 * this specific comparison, but the QInt8-vs-GGUF-quant precision gap is a
 * REAL, EXPECTED source of nonzero cosine delta — this script reports the
 * delta, it does not assume any nonzero value is a bug.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = resolve(ROOT, 'sveltekit-frontend');
dotenv.config({ path: resolve(FRONTEND, '.env'), quiet: true });
dotenv.config({ path: resolve(FRONTEND, '.env.local'), override: true, quiet: true });
const REPORT = resolve(ROOT, 'docs/reports/ort-cpu-semantic-parity-01.json');
const SAMPLE_SIZE = 32;
const EMBED_8081_URL = process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8081/v1/embeddings';

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed8081(text) {
  const res = await fetch(EMBED_8081_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma', input: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`8081 HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

function topKIndices(vecIndex, matrix, k) {
  const scores = matrix[vecIndex].map((v, i) => [i, v]).filter(([i]) => i !== vecIndex);
  scores.sort((a, b) => b[1] - a[1]);
  return new Set(scores.slice(0, k).map(([i]) => i));
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, summary FROM codebase_chunk_index
     WHERE summary IS NOT NULL AND btrim(summary) <> '' AND length(summary) < 800
     ORDER BY id LIMIT $1`,
    [SAMPLE_SIZE],
  );
  await pool.end();

  const modelPath = resolve(FRONTEND, 'static/embeddinggemma_300m_onnx/model.onnx');
  const tokenizerPath = resolve(FRONTEND, 'static/embeddinggemma_300m_onnx/tokenizer.json');
  const modelChecksum = sha256File(modelPath);
  const tokenizerChecksum = sha256File(tokenizerPath);

  // Import the real in-process onnx-embed.ts path (onnxruntime-node 1.29.0,
  // proven crash-free in ORT-CPU-RUNTIME-01) — dynamic import so this script
  // works when invoked from the repo root.
  const onnxEmbedUrl = pathToFileURL(resolve(FRONTEND, 'src/lib/server/embedding/onnx-embed.ts')).href;
  const { tryEmbedOnnx } = await import(onnxEmbedUrl).catch((err) => {
    throw new Error(
      `Failed to import onnx-embed.ts (must be run via 'npx tsx' from sveltekit-frontend/ so .ts resolves): ${err.message}`,
    );
  });

  const perRow = [];
  const vectors8081 = [];
  const vectorsOnnx = [];

  for (const row of rows) {
    const [v8081, vOnnx] = await Promise.all([
      embed8081(row.summary).catch((err) => ({ error: String(err) })),
      tryEmbedOnnx(row.summary),
    ]);

    const v8081Valid = Array.isArray(v8081) && v8081.length === 768 && v8081.every(Number.isFinite);
    const vOnnxValid = Array.isArray(vOnnx) && vOnnx.length === 768 && vOnnx.every(Number.isFinite);

    const entry = {
      id: row.id,
      textLength: row.summary.length,
      v8081Valid,
      vOnnxValid,
      v8081Error: v8081Valid ? null : (v8081 && v8081.error) || 'invalid',
      vOnnxError: vOnnxValid ? null : 'null_or_invalid',
      cosine: v8081Valid && vOnnxValid ? cosine(v8081, vOnnx) : null,
    };
    perRow.push(entry);
    vectors8081.push(v8081Valid ? v8081 : new Array(768).fill(0));
    vectorsOnnx.push(vOnnxValid ? vOnnx : new Array(768).fill(0));
  }

  const validRows = perRow.filter((r) => r.cosine !== null);
  const cosines = validRows.map((r) => r.cosine).sort((a, b) => a - b);
  const mean = cosines.length ? cosines.reduce((s, v) => s + v, 0) / cosines.length : null;
  const p05 = cosines.length ? cosines[Math.floor(0.05 * (cosines.length - 1))] : null;
  const min = cosines.length ? cosines[0] : null;
  const max = cosines.length ? cosines[cosines.length - 1] : null;

  // Same-corpus nearest-neighbor rank agreement: for each row, is its top-10
  // neighbor SET the same under both executors' similarity matrices?
  const n = rows.length;
  const matrix8081 = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cosine(vectors8081[i], vectors8081[j])));
  const matrixOnnx = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cosine(vectorsOnnx[i], vectorsOnnx[j])));
  const k = Math.min(10, n - 1);
  let overlapSum = 0;
  for (let i = 0; i < n; i++) {
    const a = topKIndices(i, matrix8081, k);
    const b = topKIndices(i, matrixOnnx, k);
    let overlap = 0;
    for (const idx of a) if (b.has(idx)) overlap++;
    overlapSum += overlap / k;
  }
  const topKOverlapMean = n > 0 ? overlapSum / n : null;

  const report = {
    schema: 'atlas.ort-cpu-semantic-parity-01.report',
    gate: 'ORT-CPU-SEMANTIC-PARITY-01',
    generatedAt: new Date().toISOString(),
    sampleSize: rows.length,
    executors: {
      a: { name: '8081_gguf_cuda', urlOrPath: EMBED_8081_URL, precision: 'unquantized (llama.cpp GGUF)' },
      b: {
        name: 'onnx_cpu_1.29.0',
        modelPath,
        modelChecksum: `sha256:${modelChecksum}`,
        tokenizerPath,
        tokenizerChecksum: `sha256:${tokenizerChecksum}`,
        precision: 'QInt8 quantized (per model_info.json)',
        declaredMaxSequenceLength: 512,
      },
    },
    knownAsymmetry:
      'ONNX export is QInt8-quantized with a declared 512-token cap; :8081 GGUF is unquantized with a ' +
      '2048-token cap. All sampled texts are well under 512 tokens so capacity does not confound this run, ' +
      'but quantization is a REAL expected source of nonzero cosine delta, not necessarily a bug.',
    validity: {
      v8081ValidCount: perRow.filter((r) => r.v8081Valid).length,
      vOnnxValidCount: perRow.filter((r) => r.vOnnxValid).length,
      bothValidCount: validRows.length,
      dimensionMismatches: perRow.filter((r) => (r.v8081Valid && r.vOnnxValid) === false && (r.v8081Error === 'invalid' || r.vOnnxError === 'invalid')).length,
    },
    cosineStats: { mean, p05, min, max, n: cosines.length },
    topKOverlapMean,
    topKOverlapK: k,
    perRow,
    conclusion: null, // filled below
  };

  if (validRows.length === 0) {
    report.conclusion = 'FAIL — no row produced valid vectors from both executors; cannot assess parity.';
  } else if (min !== null && min < 0.85) {
    report.conclusion = `NOT_ADMITTED — worst-case cosine ${min.toFixed(4)} is below the 0.85 admission floor; ` +
      'ONNX output does not yet reliably agree with the proven :8081 executor for at least one input.';
  } else if (mean !== null && mean < 0.95) {
    report.conclusion = `MARGINAL — mean cosine ${mean.toFixed(4)} is positive but below the 0.95 high-confidence ` +
      'bar; review per-row outliers before treating ONNX as an admitted SEM768 executor.';
  } else {
    report.conclusion = `PASS — mean cosine ${mean.toFixed(4)}, worst-case ${min.toFixed(4)}, top-${k} overlap ` +
      `${(topKOverlapMean * 100).toFixed(1)}%. ONNX output agrees closely with the proven :8081 executor.`;
  }

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    sampleSize: report.sampleSize,
    validity: report.validity,
    cosineStats: report.cosineStats,
    topKOverlapMean: report.topKOverlapMean,
    conclusion: report.conclusion,
  }, null, 2));
  console.log(`\nFull report: ${REPORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
