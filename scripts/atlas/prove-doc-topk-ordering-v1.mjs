#!/usr/bin/env node
/**
 * DOC-TOPK-01: read-only ordering proof for chunk-grain semantic top-k.
 *   lane A  CPU float64 oracle (independent of the addon)
 *   lane B  tensorrt_bridge.node batchCosineSimilarity scores -> CPU selection (executor under test)
 *   lane C  simdJsonParse vs JSON.parse deep-equality on real sealed JSON descriptors
 * Vectors are read from codebase_chunk_index.content_embedding (halfvec 768) inside one
 * REPEATABLE READ READ ONLY transaction for chunks with a single PROVEN lineage+binding at the pinned
 * workspace revision. Nothing is written except the exclusive-create receipt. Parity is not correctness:
 * this only proves the executor reproduces the oracle ordering; it promotes nothing.
 *
 *   node scripts/atlas/prove-doc-topk-ordering-v1.mjs --workspace-revision sha256:<...> [--n 1520] [--k 16] [--queries 32]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const WS = arg('--workspace-revision'); if (!WS) { console.error('--workspace-revision required (pinned; never "latest")'); process.exit(64); }
const N = Number(arg('--n', 1520)), K = Number(arg('--k', 16)), Q = Number(arg('--queries', 32));
const require = createRequire(import.meta.url);
let addon = null, addonError = null;
try { addon = require(path.join(REPO_ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node')); } catch (e) { addonError = e.message; }

const receipt = { schema: 'atlas.doc-topk-ordering-proof.v1', generatedAt: new Date().toISOString(), level: 'LIVE_READ_ONLY', canonicalAuthority: false, writesPerformed: 0,
  workspaceRevision: WS, params: { n: N, k: K, queries: Q }, addon: { loaded: !!addon, error: addonError, cuda: null, simdBackend: null }, lanes: {}, status: 'FAILED', failure: null };

// ---- fetch vectors (READ ONLY) ----
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const c = await pool.connect(); let rows;
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await c.query(`
    SELECT ck.id::text AS id, ck.content_embedding::text AS v
      FROM public.atlas_packet_chunk_lineage l
      JOIN public.codebase_chunk_index ck ON ck.id = l.chunk_row_id
     WHERE l.revision_status = 'PROVEN' AND ck.content_embedding IS NOT NULL
       AND (SELECT count(*) FROM public.atlas_workspace_source_bindings b
             WHERE b.repo_id = 'deeds-web-app' AND b.workspace_revision = $1
               AND b.canonical_source_ref = l.source_ref AND b.source_revision = l.source_revision) = 1
     ORDER BY ck.id LIMIT $2`, [WS, N])).rows;
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }
if (rows.length < Math.max(K + 1, 2)) { receipt.failure = `TOO_FEW_ROWS:${rows.length}`; finish(2); }
const D = 768, n = rows.length;
const vecs = rows.map((r) => Float64Array.from(JSON.parse(r.v)));
if (vecs.some((v) => v.length !== D || v.some((x) => !Number.isFinite(x)))) { receipt.failure = 'BAD_VECTOR_SHAPE'; finish(2); }
receipt.rowsRead = n; receipt.corpusChecksum = 'sha256:' + createHash('sha256').update(rows.map((r) => r.id).join('\n')).digest('hex');
const norm = (v) => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); };
const unit = vecs.map((v) => { const m = norm(v) || 1; return v.map((x) => x / m); });

// deterministic query set: evenly spaced corpus members
const qIdx = Array.from({ length: Math.min(Q, n) }, (_, i) => Math.floor((i * n) / Math.min(Q, n)));
const dot = (a, b) => { let s = 0; for (let i = 0; i < D; i++) s += a[i] * b[i]; return s; };
const topk = (scores, k) => Array.from(scores.keys()).sort((i, j) => scores[j] - scores[i] || i - j).slice(0, k);

// ---- lane A oracle ----
const oracle = qIdx.map((qi) => { const s = new Float64Array(n); for (let j = 0; j < n; j++) s[j] = dot(unit[qi], unit[j]); return { scores: s, top: topk(s, K) }; });
receipt.lanes.oracle = { status: 'PASS', note: 'float64 cosine, index tiebreak' };

// ---- lane B executor ----
if (addon && typeof addon.batchCosineSimilarity === 'function') {
  try { receipt.addon.cuda = typeof addon.checkCudaAvailable === 'function' ? addon.checkCudaAvailable() : null; } catch (e) { receipt.addon.cuda = `ERR:${e.message}`; }
  try { receipt.addon.simdBackend = typeof addon.simdJsonBackend === 'function' ? addon.simdJsonBackend() : null; } catch { /* optional */ }
  const corpus = new Float32Array(n * D); unit.forEach((v, j) => corpus.set(v, j * D));
  let exact = 0, setEq = 0, maxDelta = 0, rc0 = 0;
  for (let qn = 0; qn < qIdx.length; qn++) {
    const query = Float32Array.from(unit[qIdx[qn]]); const scores = new Float32Array(n);
    const rc = addon.batchCosineSimilarity(query, D, corpus, n, scores, n); if (rc === 0) rc0++;
    const top = topk(scores, K); const o = oracle[qn].top;
    if (top.every((v, i) => v === o[i])) exact++;
    if ([...top].sort().join() === [...o].sort().join()) setEq++;
    for (let j = 0; j < n; j++) maxDelta = Math.max(maxDelta, Math.abs(scores[j] - oracle[qn].scores[j]));
  }
  receipt.lanes.addonBatchCosine = { queries: qIdx.length, returnCodeZero: rc0, exactOrderMatch: exact, sameSetDifferentOrder: setEq - exact, maxAbsScoreDelta: maxDelta, tolerance: 1e-4,
    status: rc0 === qIdx.length && maxDelta <= 1e-4 && exact === qIdx.length ? 'PASS' : (setEq === qIdx.length && maxDelta <= 1e-4 ? 'PASS_SET_ONLY_TIE_ORDER_DIFFERS' : 'FAIL') };
} else receipt.lanes.addonBatchCosine = { status: 'NOT_EXERCISED', reason: addonError ?? 'batchCosineSimilarity missing' };

// ---- lane C descriptor parse parity ----
const files = [];
const propDir = path.join(REPO_ROOT, '.tmp/atlas/ornith-summary-proposals-v1');
for (const d of fs.existsSync(propDir) ? fs.readdirSync(propDir) : []) { const p = path.join(propDir, d, 'chunk-summary-proposals-00001.ndjson'); if (fs.existsSync(p)) files.push(p); }
const docs = [];
for (const p of files.slice(0, 3)) for (const line of fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)) docs.push(line);
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
if (addon && typeof addon.simdJsonParse === 'function' && docs.length) {
  let same = 0, differ = 0, threw = 0, tJs = 0n, tSimd = 0n;
  for (const s of docs) {
    const a0 = process.hrtime.bigint(); const js = JSON.parse(s); const a1 = process.hrtime.bigint();
    // the addon returns a validated JSON STRING (not an object); the full path is simd validate + JSON.parse
    let sj; try { const out = addon.simdJsonParse(s); if (typeof out !== 'string') { threw++; continue; } sj = JSON.parse(out); } catch { threw++; continue; } const a2 = process.hrtime.bigint();
    tJs += a1 - a0; tSimd += a2 - a1; if (stable(js) === stable(sj)) same++; else differ++;
  }
  receipt.lanes.simdjsonParse = { documents: docs.length, identical: same, different: differ, threw, avgBytes: Math.round(docs.reduce((a, s) => a + s.length, 0) / docs.length),
    jsonParseMsTotal: Number(tJs) / 1e6, simdMsTotal: Number(tSimd) / 1e6, status: same === docs.length ? 'PASS' : 'FAIL',
    note: 'addon returns a validated JSON string; timings are the FULL path (simd + second JSON.parse) vs JSON.parse alone; parity only' };
} else receipt.lanes.simdjsonParse = { status: 'NOT_EXERCISED', reason: docs.length ? 'simdJsonParse missing' : 'no sealed descriptors found' };

const lanes = Object.values(receipt.lanes).map((l) => l.status);
receipt.status = lanes.every((s) => s === 'PASS') ? 'LIVE_READ_ONLY_PARITY_PROVEN' : lanes.some((s) => s === 'FAIL') ? 'FAILED' : 'PARTIAL';
finish(receipt.status === 'FAILED' ? 1 : 0);

function finish(code) {
  const out = path.join(REPO_ROOT, 'docs', 'reports', `doc-topk-ordering-proof-v1-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: receipt.status, rows: receipt.rowsRead, addon: receipt.addon, lanes: receipt.lanes, failure: receipt.failure, receipt: path.relative(REPO_ROOT, out) }, null, 2));
  process.exit(code);
}
