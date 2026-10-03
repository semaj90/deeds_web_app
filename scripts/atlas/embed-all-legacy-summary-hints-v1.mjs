#!/usr/bin/env node
/**
 * SUMMARY-DENSE-01 (artifact-only): embeds ALL usable legacy summary hints (census classes HINT_LINEAGE_BOUND + HINT_UNQUALIFIED)
 * via :8097 in batches of 32. Vectors go to a raw F32LE file (row i = vectors.f32[i*768..]); a JSONL index carries identity/digests
 * (control plane); a manifest carries checksums. Read-only Postgres (REPEATABLE READ READ ONLY). canonicalAuthority:false.
 * Per-text failures are recorded (never dropped silently) and excluded from the vector file. Resumable is NOT supported: write-once dir.
 * Usage: node scripts/atlas/embed-all-legacy-summary-hints-v1.mjs [--census=<ndjson>] [--limit=N] [--endpoint=...]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const censusPath = path.resolve(REPO_ROOT, args.get('census') ?? '.tmp/atlas/legacy-summary-census-v1/census-20260926T060809Z.ndjson');
const endpoint = args.get('endpoint') ?? 'http://127.0.0.1:8097/embed';
const limit = args.get('limit') ? Number(args.get('limit')) : Infinity;
const CLASSES = new Set(['LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED']);
const NL = String.fromCharCode(10), DIM = 768, BATCH = 32;
const sha = (s) => `sha256:${crypto.createHash('sha256').update(s, 'utf8').digest('hex')}`;

const census = [];
for (const line of fs.readFileSync(censusPath, 'utf8').split(NL)) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (CLASSES.has(r.class) && r.quarantined === false && r.detectorClean === true) census.push(r);
  if (census.length >= limit) break;
}
census.sort((a, b) => (a.chunkRowId < b.chunkRowId ? -1 : 1));

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const dir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-hint-embedding-full-v1', stamp);
fs.mkdirSync(dir, { recursive: true });
const vecFd = fs.openSync(path.join(dir, 'vectors.f32'), 'wx');
const idx = fs.createWriteStream(path.join(dir, 'index.ndjson'), { flags: 'wx' });
const vecHash = crypto.createHash('sha256'), idxHash = crypto.createHash('sha256');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

async function embedRaw(texts) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts }), signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  return (await res.json()).embeddings;
}
const failures = { textMissing: [], digestMismatch: [], embed: [], badVector: [] };
let row = 0, done = 0;
const t0 = Date.now();
for (let i = 0; i < census.length; i += BATCH) {
  const slice = census.slice(i, i + BATCH);
  const texts = new Map((await client.query('SELECT id::text AS id, summary FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])', [slice.map((s) => s.chunkRowId)])).rows.map((r) => [r.id, r.summary]));
  const ok = [];
  for (const s of slice) {
    const t = texts.get(s.chunkRowId);
    if (!t) { failures.textMissing.push(s.chunkRowId); continue; }
    if (sha(t) !== s.summaryDigest) { failures.digestMismatch.push(s.chunkRowId); continue; }
    ok.push({ s, t });
  }
  let vecs = new Array(ok.length).fill(null);
  try { vecs = await embedRaw(ok.map((o) => o.t)); } catch {
    for (let j = 0; j < ok.length; j++) { try { vecs[j] = (await embedRaw([ok[j].t]))[0]; } catch (e) { failures.embed.push({ chunkRowId: ok[j].s.chunkRowId, chars: ok[j].t.length, reason: String(e.message) }); } }
  }
  for (let j = 0; j < ok.length; j++) {
    const v = vecs[j];
    if (!v) continue;
    const f = Float32Array.from(v);
    let n = 0, finite = true;
    for (const x of f) { if (!Number.isFinite(x)) finite = false; n += x * x; }
    if (f.length !== DIM || !finite || Math.abs(Math.sqrt(n) - 1) > 1e-3) { failures.badVector.push(ok[j].s.chunkRowId); continue; }
    const buf = Buffer.from(f.buffer, f.byteOffset, f.byteLength);
    fs.writeSync(vecFd, buf); vecHash.update(buf);
    const line = JSON.stringify({ schema: 'atlas.summary-hint-vector-index.v1', row: row++, chunkRowId: ok[j].s.chunkRowId, chunkId: ok[j].s.chunkId, hintClass: ok[j].s.class, summaryDigest: ok[j].s.summaryDigest }) + NL;
    idx.write(line); idxHash.update(line); done++;
  }
  if ((i / BATCH) % 25 === 0) console.log(`progress ${Math.round(((i + slice.length) / census.length) * 100)}% embedded=${done} elapsedS=${Math.round((Date.now() - t0) / 1000)}`);
}
await client.query('ROLLBACK'); client.release(); await pool.end();
await new Promise((r) => idx.end(r)); fs.closeSync(vecFd);

const failCount = Object.values(failures).reduce((a, x) => a + x.length, 0);
const manifest = {
  schema: 'atlas.summary-hint-vector-set.v1', canonicalAuthority: false, status: failCount === 0 && done === census.length ? 'ARTIFACT_ONLY_COMPLETE' : 'PARTIAL_WITH_RECORDED_FAILURES',
  census: path.relative(REPO_ROOT, censusPath).split(path.sep).join('/'), selectedRows: census.length, embeddedRows: done, dim: DIM, layout: 'F32LE row-major, row i at byte i*768*4',
  byClass: census.reduce((m, c) => { m[c.class] = (m[c.class] ?? 0) + 1; return m; }, {}), failures: { textMissing: failures.textMissing.length, digestMismatch: failures.digestMismatch.length, embed: failures.embed.length, badVector: failures.badVector.length },
  failureDetail: failures, files: { vectors: { path: 'vectors.f32', bytes: done * DIM * 4, sha256: `sha256:${vecHash.digest('hex')}` }, index: { path: 'index.ndjson', rows: done, sha256: `sha256:${idxHash.digest('hex')}` } },
  endpoint, elapsedSeconds: Math.round((Date.now() - t0) / 1000), databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, llmCalls: 0, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ dir: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), ...manifest, failureDetail: undefined }, null, 1));
