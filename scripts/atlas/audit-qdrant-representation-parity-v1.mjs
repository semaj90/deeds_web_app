#!/usr/bin/env node
/**
 * SEM768-GATE-02: classify which embedding RECIPE the Qdrant 768 collections actually hold.
 * READ-ONLY: scrolls Qdrant, reads Postgres, embeds via local Ollama, writes one small JSON receipt. Never rebuilds anything.
 *
 * For a deterministic sample of points per collection, matched to codebase_chunk_index by uuid (postgres_id, or a uuid-valued chunk_id),
 * compares the Qdrant `content` vector against: stored content_embedding, stored content_embedding_768, and FRESH embeddings of the
 * chunk text under candidate recipes. Best cosine >= THRESHOLD names the recipe; otherwise UNKNOWN (never guessed).
 *
 * Verdict per collection: QDRANT_REPRESENTATION_IDENTIFIED (>=90% of hash-verified matches share one recipe) or
 * QDRANT_REPRESENTATION_MIXED_OR_UNKNOWN.
 *
 * Usage: node scripts/atlas/audit-qdrant-representation-parity-v1.mjs [--sample=300]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
const { Client } = require('pg');
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] ?? d;
const SAMPLE = Number(arg('sample', 300));
const THRESHOLD = 0.995;
const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const COLLECTIONS = ['codebase_chunks_768', 'codebase_chunks_768_v2'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function envVal(k) {
  if (process.env[k]) return process.env[k];
  for (const f of ['.env.local', '.env']) {
    try {
      const m = fs.readFileSync(path.join(repoRoot, 'sveltekit-frontend', f), 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  return undefined;
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y); };
const parseVec = (t) => (t ? JSON.parse(t) : null);
async function embedMany(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts.slice(i, i + 32).map((t) => t.slice(0, 2000)) }) });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    out.push(...(await r.json()).embeddings);
  }
  return out;
}
async function scrollSample(collection, want) {
  const pts = [];
  let offset = null;
  while (pts.length < want * 6) {
    const r = await fetch(`${QDRANT}/collections/${collection}/points/scroll`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 500, offset, with_payload: ['postgres_id', 'chunk_id', 'content_hash', 'source_ref', 'representation_name', 'embedding_model'], with_vector: ['content'] }),
    });
    const j = (await r.json()).result;
    pts.push(...j.points);
    offset = j.next_page_offset;
    if (!offset) break;
  }
  // deterministic pseudo-random subsample (hash of point id), not just the first page
  return pts.map((p) => ({ p, h: crypto.createHash('sha256').update(String(p.id)).digest('hex') })).sort((a, b) => (a.h < b.h ? -1 : 1)).slice(0, want).map((x) => x.p);
}

const RECIPES = {
  raw: (row) => row.content,
  title_none: (row) => `title: none | text: ${row.content}`,
  title_relative_path: (row) => `title: ${row.relative_path} | text: ${row.content}`,
};

const db = new Client({ connectionString: envVal('DATABASE_URL'), statement_timeout: 60000 });
await db.connect();
const receipt = { schema: 'atlas.qdrant-representation-parity.v1', canonicalAuthority: false, mode: 'READ_ONLY', sampleRequested: SAMPLE, threshold: THRESHOLD, collections: {} };

for (const collection of COLLECTIONS) {
  const info = (await (await fetch(`${QDRANT}/collections/${collection}`)).json()).result;
  const pts = await scrollSample(collection, SAMPLE);
  const idOf = (p) => (UUID_RE.test(String(p.payload?.postgres_id ?? '')) ? p.payload.postgres_id : UUID_RE.test(String(p.payload?.chunk_id ?? '')) ? p.payload.chunk_id : null);
  const ids = pts.map(idOf).filter(Boolean);
  const rows = (await db.query(
    'SELECT id::text id, relative_path, content, content_hash, content_embedding::text ce, content_embedding_768::text ce768 FROM codebase_chunk_index WHERE id::text = ANY($1)', [ids],
  )).rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const matched = pts.map((p) => ({ p, row: byId.get(idOf(p)) })).filter((x) => x.row && x.p.vector?.content);
  const hashOk = matched.filter((x) => {
    const ph = String(x.p.payload?.content_hash ?? '');
    return ph && String(x.row.content_hash ?? '').startsWith(ph.slice(0, 16));
  });
  const use = hashOk.length >= 20 ? hashOk : matched; // hash-verified when possible
  const fresh = {};
  for (const [name, fn] of Object.entries(RECIPES)) fresh[name] = await embedMany(use.map((x) => fn(x.row)));
  const hist = {};
  const lens = [];
  const stored = { content_embedding: [], content_embedding_768: [] };
  const best = { raw: [], title_none: [], title_relative_path: [] };
  use.forEach((x, i) => {
    const v = x.p.vector.content;
    const scores = {};
    for (const name of Object.keys(RECIPES)) { scores[name] = cos(v, fresh[name][i]); best[name].push(scores[name]); }
    lens.push({ len: x.row.content.length, raw: scores.raw });
    const ce = parseVec(x.row.ce), c768 = parseVec(x.row.ce768);
    if (ce) stored.content_embedding.push(cos(v, ce));
    if (c768) stored.content_embedding_768.push(cos(v, c768));
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const label = top[1] >= THRESHOLD ? top[0] : 'UNKNOWN';
    hist[label] = (hist[label] ?? 0) + 1;
  });
  const st = (a) => (a.length ? { n: a.length, min: +Math.min(...a).toFixed(4), avg: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(4), ge_threshold: a.filter((v) => v >= THRESHOLD).length } : { n: 0 });
  const total = use.length;
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
  const identified = top && top[0] !== 'UNKNOWN' && total > 0 && top[1] / total >= 0.9;
  receipt.collections[collection] = {
    pointsCount: info.points_count,
    sampled: pts.length,
    matchedToPostgresByUuid: matched.length,
    unmatchedOrStale: pts.length - matched.length,
    hashVerifiedMatches: hashOk.length,
    evaluated: total,
    classificationHistogram: hist,
    rawRecipeByContentLength: Object.fromEntries([['<=2000 chars', (l) => l.len <= 2000], ['>2000 chars', (l) => l.len > 2000]].map(([k, f]) => { const a = lens.filter(f); return [k, { n: a.length, matchesRaw: a.filter((l) => l.raw >= THRESHOLD).length, avgRawCosine: a.length ? +(a.reduce((t, l) => t + l.raw, 0) / a.length).toFixed(4) : null }]; })),
    freshRecipeCosine: Object.fromEntries(Object.entries(best).map(([k, v]) => [k, st(v)])),
    storedColumnCosine: { content_embedding: st(stored.content_embedding), content_embedding_768: st(stored.content_embedding_768) },
    payloadRepresentationLabels: [...new Set(pts.map((p) => p.payload?.representation_name).filter(Boolean))],
    verdict: identified ? `QDRANT_REPRESENTATION_IDENTIFIED:${top[0]}` : 'QDRANT_REPRESENTATION_MIXED_OR_UNKNOWN',
  };
}
await db.end();
receipt.databaseWrites = false;
receipt.qdrantWrites = false;
const outPath = path.join(repoRoot, 'docs/reports/qdrant-representation-parity-v1.json');
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(receipt, null, 2));
