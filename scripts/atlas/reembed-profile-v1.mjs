#!/usr/bin/env node
/**
 * TP-1/TP-2 profiling for the canonical re-embed (REPR-MANIFEST-01 recipe `eg-task-prefix-v1`). Operates ONLY on the 1,000-row canary slice
 * (`.tmp/atlas/reembed-canary-ids-v1.txt`), whose rows already carry the canonical vector, so nothing new is introduced.
 *
 *   phase 1  embed benchmark   - POST /api/embed with `input` arrays of 1/8/16/32/64 prompts (NO database writes); parity vs the stored vector.
 *   phase 2  write benchmark   - only with --write AND phase-1 parity gate (mean cosine >= 0.999): rewrites canary rows with freshly computed vectors,
 *                                (A) one UPDATE + commit per row (current writer behaviour) vs (B) one UNNEST UPDATE per transaction batch.
 *
 * A snapshot of the slice's current vectors is saved before any write (`.tmp/atlas/reembed-canary-snapshot-v1.jsonl`, gitignored).
 * CAVEAT: phase 2 rewrites a vector that is (to halfvec rounding) unchanged, so it can understate the HNSW insert cost of a first-time NULL fill.
 * Run from the repo root: node scripts/atlas/reembed-profile-v1.mjs [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const WRITE = process.argv.includes('--write');
const TAG = 'embeddinggemma:latest:eg-task-prefix-v1';
const MODEL = 'embeddinggemma:latest';
const ids = fs.readFileSync(path.join(REPO_ROOT, '.tmp/atlas/reembed-canary-ids-v1.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
if (ids.length !== 1000) throw new Error(`canary ids expected 1000, got ${ids.length}`);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2, statement_timeout: 120000 });
const { rows } = await pool.query(
  `select id::text id, relative_path, content, content_embedding::text stored from codebase_chunk_index where id = any($1::uuid[]) and embedding_model = $2 order by id`, [ids, TAG]);
if (rows.length !== 1000) throw new Error(`expected 1000 canonical canary rows, got ${rows.length}`);

const snapPath = path.join(REPO_ROOT, '.tmp/atlas/reembed-canary-snapshot-v1.jsonl');
if (!fs.existsSync(snapPath)) fs.writeFileSync(snapPath, rows.map((r) => JSON.stringify({ id: r.id, content_embedding: r.stored })).join('\n') + '\n');
const snapSha = crypto.createHash('sha256').update(fs.readFileSync(snapPath)).digest('hex');

const prompt = (r) => `title: ${(r.relative_path || '').trim() || 'none'} | text: ${r.content.trim()}`;
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const stored = new Map(rows.map((r) => [r.id, JSON.parse(r.stored)]));

async function embedBatch(batch) {
  const res = await fetch('http://127.0.0.1:11434/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: batch.map(prompt) }) });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const { embeddings } = await res.json();
  if (!Array.isArray(embeddings) || embeddings.length !== batch.length) throw new Error('EMBED_COUNT_MISMATCH');
  for (const e of embeddings) if (e.length !== 768 || e.some((v) => !Number.isFinite(v))) throw new Error('EMBED_INVALID_VECTOR');
  return embeddings;
}

const report = { schema: 'atlas.reembed-profile.v1', generatedAt: new Date().toISOString(), slice: 'canary 1000 rows (already canonical)', snapshotSha256: snapSha, caveats: [] };
const SUBSET = rows.slice(0, 192);
report.embedBench = [];
let bestRate = 0, bestSize = 1;
await embedBatch(SUBSET.slice(0, 4)); // warm-up (model load, not counted)
for (const size of [1, 8, 16, 32, 64]) {
  const t0 = performance.now(); const vecs = [];
  for (let i = 0; i < SUBSET.length; i += size) vecs.push(...(await embedBatch(SUBSET.slice(i, i + size))));
  const sec = (performance.now() - t0) / 1000;
  const cs = vecs.map((v, i) => cos(v, stored.get(SUBSET[i].id))); cs.sort((a, b) => a - b);
  const rate = SUBSET.length / sec;
  report.embedBench.push({ batchSize: size, rows: SUBSET.length, seconds: +sec.toFixed(2), rowsPerSecond: +rate.toFixed(1), cosineMean: +(cs.reduce((s, x) => s + x, 0) / cs.length).toFixed(5), cosineMin: +cs[0].toFixed(5) });
  console.log(JSON.stringify(report.embedBench.at(-1)));
  if (rate > bestRate && cs[0] >= 0.999) { bestRate = rate; bestSize = size; }
}
report.bestBatchSize = bestSize;
const gateOk = report.embedBench.every((b) => b.cosineMin >= 0.99) && report.embedBench.find((b) => b.batchSize === bestSize)?.cosineMean >= 0.999;
report.parityGate = gateOk ? 'PASS' : 'FAIL';

if (WRITE && gateOk) {
  const slice = rows.slice(0, 400); const vecs = [];
  for (let i = 0; i < slice.length; i += bestSize) vecs.push(...(await embedBatch(slice.slice(i, i + bestSize))));
  const lit = (v) => `[${v.join(',')}]`;
  const A = slice.slice(0, 200), B = slice.slice(200, 400);
  let t = performance.now();
  for (let i = 0; i < A.length; i++) await pool.query(`update codebase_chunk_index set content_embedding = $1::halfvec, embedding_model = $2, updated_at = now() where id = $3`, [lit(vecs[i]), TAG, A[i].id]);
  const secA = (performance.now() - t) / 1000;
  t = performance.now();
  for (let i = 0; i < B.length; i += 50) {
    const chunk = B.slice(i, i + 50); const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`update codebase_chunk_index c set content_embedding = v.e::halfvec, embedding_model = $3, updated_at = now() from unnest($1::uuid[], $2::text[]) as v(id, e) where c.id = v.id`,
        [chunk.map((r) => r.id), vecs.slice(200 + i, 200 + i + chunk.length).map(lit), TAG]);
      await client.query('commit');
    } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
  }
  const secB = (performance.now() - t) / 1000;
  report.writeBench = { perRowAutocommit: { rows: A.length, seconds: +secA.toFixed(2), rowsPerSecond: +(A.length / secA).toFixed(1) }, batched50UnnestTxn: { rows: B.length, seconds: +secB.toFixed(2), rowsPerSecond: +(B.length / secB).toFixed(1) } };
  report.caveats.push('writes rewrote already-canonical rows; unchanged-value updates may be HOT and understate HNSW insert cost of a first-time NULL fill');
  console.log(JSON.stringify(report.writeBench));
} else if (WRITE) { report.caveats.push('write phase SKIPPED: parity gate failed'); }

await pool.end();
report.checksum = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/reembed-profile-v1.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ bestBatchSize: bestSize, parityGate: report.parityGate }));
