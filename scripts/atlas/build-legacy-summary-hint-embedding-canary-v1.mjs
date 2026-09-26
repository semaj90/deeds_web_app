#!/usr/bin/env node
/**
 * LEGACY-SUMMARY-EMB-01: artifact-only embedding canary for legacy chunk summaries (HINT evidence).
 * Reads legacy summary bytes read-only (REPEATABLE READ READ ONLY), embeds via :8097, validates, writes a sealed
 * artifact under .tmp/atlas/legacy-summary-hint-embedding-v1/<ts>/. No DB/Qdrant/Valkey writes; canonicalAuthority:false.
 * Usage: node scripts/atlas/build-legacy-summary-hint-embedding-canary-v1.mjs [--census=<ndjson>] [--per-class=32] [--endpoint=http://127.0.0.1:8097/embed]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const censusPath = path.resolve(REPO_ROOT, args.get('census') ?? '.tmp/atlas/legacy-summary-census-v1/census-20260926T060809Z.ndjson');
const perClass = Number(args.get('per-class') ?? 32);
const endpoint = args.get('endpoint') ?? 'http://127.0.0.1:8097/embed';
const CLASSES = ['LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED'];
const sha = (s) => `sha256:${crypto.createHash('sha256').update(s, 'utf8').digest('hex')}`;
const NL = String.fromCharCode(10);

const byClass = Object.fromEntries(CLASSES.map((c) => [c, []]));
for (const line of fs.readFileSync(censusPath, 'utf8').split(NL)) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (byClass[r.class] && r.quarantined === false && r.detectorClean === true) byClass[r.class].push(r);
}
// deterministic frozen selection: order by sha256(chunkRowId), take first N per class
const pick = (rows) => rows.map((r) => ({ r, k: sha(r.chunkRowId) })).sort((a, b) => (a.k < b.k ? -1 : 1)).slice(0, perClass).map((x) => x.r);
const selected = CLASSES.flatMap((c) => pick(byClass[c]).map((r) => ({ ...r, hintClass: c })));

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const client = await pool.connect();
let rows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await client.query('SELECT id::text AS id, summary FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])', [selected.map((s) => s.chunkRowId)])).rows;
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }
const text = new Map(rows.map((r) => [r.id, r.summary]));

const items = selected.map((s) => ({ ...s, text: text.get(s.chunkRowId) ?? null }));
const missing = items.filter((i) => !i.text).length;
const digestMatches = items.filter((i) => i.text && sha(i.text) === i.summaryDigest).length;

async function embedRaw(texts) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts }), signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  return (await res.json()).embeddings;
}
// batches of 32; a failing batch is retried per text, a failing text is recorded (null + reason), never dropped silently
const failures = [];
async function embed(list) {
  const out = new Array(list.length).fill(null);
  for (let i = 0; i < list.length; i += 32) {
    const slice = list.slice(i, i + 32);
    try { (await embedRaw(slice)).forEach((v, j) => { out[i + j] = v; }); continue; } catch { /* retry per text */ }
    for (let j = 0; j < slice.length; j++) {
      try { out[i + j] = (await embedRaw([slice[j]]))[0]; } catch (e) { failures.push({ index: i + j, chars: slice[j].length, reason: String(e.message) }); }
    }
  }
  return out;
}
const allUsable = items.filter((i) => i.text);
const vecs = await embed(allUsable.map((i) => i.text));
const vecs2 = await embed(allUsable.map((i) => i.text));
const usable = allUsable.filter((_, i) => vecs[i] && vecs2[i]);
const keep = allUsable.map((_, i) => i).filter((i) => vecs[i] && vecs2[i]);
const vk = keep.map((i) => vecs[i]); const vk2 = keep.map((i) => vecs2[i]);
vecs.length = 0; vecs.push(...vk); vecs2.length = 0; vecs2.push(...vk2);
const f32 = (a) => Float32Array.from(a);
const vecDigest = (v) => `sha256:${crypto.createHash('sha256').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex')}`;

let bad = 0, nonUnit = 0, deterministic = 0;
const reps = usable.map((it, i) => {
  const v = f32(vecs[i]);
  let n = 0, finite = true;
  for (const x of v) { if (!Number.isFinite(x)) finite = false; n += x * x; }
  n = Math.sqrt(n);
  if (v.length !== 768 || !finite) bad++;
  if (Math.abs(n - 1) > 1e-3) nonUnit++;
  if (vecs[i].every((x, j) => x === vecs2[i][j])) deterministic++;
  return {
    schema: 'atlas.summary-hint-representation.v1', canonicalAuthority: false, hintClass: it.hintClass,
    chunkRowId: it.chunkRowId, chunkId: it.chunkId, summaryDigest: sha(it.text), censusSummaryDigest: it.summaryDigest,
    dimension: v.length, norm: n, vectorDigest: vecDigest(v), representationId: 'semantic_768',
    executor: 'go-embedding-service:8097', representationRevision: 'legacy-hint-canary-v1', vector: Array.from(v),
  };
});

// Sanity signal only (not a quality claim): mean pairwise cosine within/between classes.
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const vv = reps.map((r) => r.vector);
let sum = 0, cnt = 0, maxc = -1;
for (let i = 0; i < vv.length; i++) for (let j = i + 1; j < vv.length; j++) { const c = dot(vv[i], vv[j]); sum += c; cnt++; if (c > maxc) maxc = c; }

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const dir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-hint-embedding-v1', stamp);
fs.mkdirSync(dir, { recursive: true });
const body = reps.map((r) => JSON.stringify(r)).join(NL) + NL;
fs.writeFileSync(path.join(dir, 'representations-00001.ndjson'), body, { flag: 'wx' });
const perClassCounts = Object.fromEntries(CLASSES.map((c) => [c, reps.filter((r) => r.hintClass === c).length]));
const checks = { selectedExpected: selected.length === perClass * CLASSES.length, allTextFound: missing === 0, noEmbedFailures: failures.length === 0, allDigestsMatchCensus: digestMatches === usable.length, dim768AllFinite: bad === 0, unitNorm: nonUnit === 0, deterministic: deterministic === reps.length };
const manifest = {
  schema: 'atlas.summary-hint-embedding-canary.v1', status: Object.values(checks).every(Boolean) ? 'ARTIFACT_ONLY_PROVEN' : 'NOT_PROVEN',
  canonicalAuthority: false, censusPath: path.relative(REPO_ROOT, censusPath).split(path.sep).join('/'), endpoint, perClass: perClassCounts, checks,
  sanity: { pairs: cnt, meanPairwiseCosine: cnt ? sum / cnt : null, maxPairwiseCosine: maxc },
  shards: [{ path: 'representations-00001.ndjson', rows: reps.length, sha256: sha(body) }],
  databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, llmCalls: 0, embeddingFailures: failures, embeddedRows: reps.length, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ dir: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), ...manifest, shards: undefined }, null, 1));
