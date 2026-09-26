#!/usr/bin/env node
/**
 * SEM768-GATE-02A: QDRANT PRODUCER COHORT CENSUS. READ-ONLY (Qdrant scroll/retrieve, Postgres reads, local Ollama embeds, one JSON receipt).
 * Purpose: identify which historical writers/projection generations exist in the two 768 collections, how big each cohort is, which are
 * lineage-qualified, and what each cohort's vectors actually are: a COPY of a Postgres column (content_embedding / content_embedding_768,
 * matching how the known writers work) or a FRESH-recipe embedding (raw / title:{path}) or UNKNOWN. It never selects the semantic recipe
 * and never rebuilds or patches anything.
 *
 * Known writers (verified by reading the scripts): apply-retrieval-01l-08a-qdrant-projection-v1.mjs copies content_embedding into v2;
 * project-graphify-embeddings-qdrant.mjs copies content_embedding_768 (content) / signature_embedding (signature) and records
 * projection_revisions + representation_id; qdrant-upsert-worker.mjs writes a RabbitMQ-supplied embedding with no recipe revision.
 *
 * Usage: node scripts/atlas/audit-qdrant-producer-cohort-census-v1.mjs [--per-cohort=12] [--top-cohorts=20]
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
const PER_COHORT = Number(arg('per-cohort', 12));
const TOP = Number(arg('top-cohorts', 20));
const THRESHOLD = 0.995;
const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const COLLECTIONS = ['codebase_chunks_768', 'codebase_chunks_768_v2'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ['packet_version', 'lineage_version', 'qdrant_collection', 'representation_id', 'representation_name', 'representation_revision',
  'projection_revision', 'projection_revisions', 'projection_repair_revision', 'model_revision', 'embedding_model', 'dimension', 'embedding_dimension',
  'embedding_ref', 'payload_backfilled_at', 'postgres_updated_at', 'indexed_at', 'embedded_at', 'graphify_embedding_projected_at',
  'postgres_id', 'chunk_id', 'canonical_id', 'source_ref', 'content_hash', 'hash', 'packet_key', 'source_revision', 'workspace_revision', 'canonical_vector_digest'];

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
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const present = (v) => v !== null && v !== undefined && String(v) !== '' && !(Array.isArray(v) && v.length === 0);
async function qfetch(url, init) {
  for (let attempt = 1; ; attempt++) {
    try { return await fetch(url, init); } catch (e) { if (attempt >= 4) throw e; await new Promise((r) => setTimeout(r, 500 * attempt)); }
  }
}
async function embedMany(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts.slice(i, i + 32).map((t) => t.slice(0, 2000)) }) });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    out.push(...(await r.json()).embeddings);
  }
  return out;
}
async function scrollAll(collection) {
  const pts = [];
  let offset = null;
  do {
    const r = await qfetch(`${QDRANT}/collections/${collection}/points/scroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 4000, offset, with_payload: { include: FIELDS }, with_vector: false }) });
    const j = (await r.json()).result;
    for (const p of j.points) pts.push({ id: p.id, payload: p.payload ?? {} });
    offset = j.next_page_offset;
  } while (offset);
  return pts;
}
async function fetchVectors(collection, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await qfetch(`${QDRANT}/collections/${collection}/points`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(i, i + 100), with_payload: false, with_vector: ['content'] }) });
    for (const p of (await r.json()).result ?? []) out.set(String(p.id), p.vector?.content ?? null);
  }
  return out;
}

const idForm = (id, pl) => (typeof id === 'number' ? 'numeric' : UUID_RE.test(String(id)) ? 'uuid' : String(pl.chunk_id ?? '').startsWith('card:') ? 'card' : 'other');
const month = (v) => (present(v) ? String(v).slice(0, 7) : '-');
const yn = (v) => (present(v) ? 'y' : 'n');
const cohortKey = (p) => {
  const pl = p.payload;
  const pr = pl.projection_revisions ? Object.values(pl.projection_revisions).join('+') : (pl.projection_revision ?? '-');
  return [`id=${idForm(p.id, pl)}`, `pv=${pl.packet_version ?? '-'}`, `lv=${pl.lineage_version ?? '-'}`, `pr=${pr}`, `rep=${yn(pl.representation_id)}${yn(pl.representation_revision)}`,
    `em=${pl.embedding_model ?? '-'}`, `mr=${pl.model_revision ?? '-'}`, `pg=${yn(pl.postgres_id)}`, `ref=${yn(pl.embedding_ref)}`, `bf=${month(pl.payload_backfilled_at)}`, `pgU=${month(pl.postgres_updated_at)}`].join(' ');
};
const qualified = (pl) => present(pl.packet_key) && present(pl.source_revision) && present(pl.workspace_revision) && present(pl.content_hash ?? pl.hash);
const uuidIdOf = (p) => [p.payload.postgres_id, p.payload.chunk_id, p.payload.canonical_id, p.id].map(String).find((v) => UUID_RE.test(v)) ?? null;

const db = new Client({ connectionString: envVal('DATABASE_URL'), statement_timeout: 60000 });
await db.connect();
const receipt = { schema: 'atlas.qdrant-producer-cohort-census.v1', canonicalAuthority: false, mode: 'READ_ONLY', threshold: THRESHOLD, perCohortSample: PER_COHORT, collections: {} };

for (const collection of COLLECTIONS) {
  const all = await scrollAll(collection);
  const cohorts = new Map();
  for (const p of all) { const k = cohortKey(p); if (!cohorts.has(k)) cohorts.set(k, []); cohorts.get(k).push(p); }
  const ranked = [...cohorts.entries()].sort((a, b) => b[1].length - a[1].length);
  const out = [];
  for (const [key, pts] of ranked.slice(0, TOP)) {
    const sample = [...pts].sort((a, b) => (sha(a.id) < sha(b.id) ? -1 : 1)).slice(0, PER_COHORT);
    const vectors = await fetchVectors(collection, sample.map((p) => p.id));
    const uuids = sample.map(uuidIdOf).filter(Boolean);
    const rows = new Map((await db.query('SELECT id::text id, relative_path, content, content_hash, content_embedding::text ce, content_embedding_768::text ce768 FROM codebase_chunk_index WHERE id::text = ANY($1)', [uuids])).rows.map((r) => [r.id, r]));
    const eligible = [];
    for (const p of sample) {
      const ph = String(p.payload.content_hash ?? p.payload.hash ?? '').slice(0, 16);
      if (!ph || !vectors.get(String(p.id))) continue;
      let row = rows.get(uuidIdOf(p) ?? '');
      if (!row && present(p.payload.source_ref) && !/^\d{1,4}$/.test(String(p.payload.source_ref))) {
        row = (await db.query('SELECT id::text id, relative_path, content, content_hash, content_embedding::text ce, content_embedding_768::text ce768 FROM codebase_chunk_index WHERE (relative_path = $1 OR source_ref = $1) AND content_hash LIKE $2 LIMIT 1', [p.payload.source_ref, `${ph}%`])).rows[0];
      }
      if (row && String(row.content_hash ?? '').startsWith(ph)) eligible.push({ p, row });
    }
    const fresh = {
      raw: await embedMany(eligible.map((x) => x.row.content)),
      title_relative_path: await embedMany(eligible.map((x) => `title: ${x.row.relative_path} | text: ${x.row.content}`)),
    };
    const hist = {};
    eligible.forEach((x, i) => {
      const v = vectors.get(String(x.p.id));
      const tests = [];
      if (x.row.ce) tests.push(['COPY_OF_content_embedding', cos(v, JSON.parse(x.row.ce))]);
      if (x.row.ce768) tests.push(['COPY_OF_content_embedding_768', cos(v, JSON.parse(x.row.ce768))]);
      tests.push(['FRESH_raw', cos(v, fresh.raw[i])], ['FRESH_title_relative_path', cos(v, fresh.title_relative_path[i])]);
      const top = tests.sort((a, b) => b[1] - a[1])[0];
      const label = top[1] >= THRESHOLD ? top[0] : 'UNKNOWN';
      hist[label] = (hist[label] ?? 0) + 1;
    });
    out.push({
      cohort: key, size: pts.length, lineageQualified: pts.filter((p) => qualified(p.payload)).length,
      sampled: sample.length, eligibleForVectorComparison: eligible.length, vectorSource: hist,
    });
  }
  const tail = ranked.slice(TOP);
  receipt.collections[collection] = {
    actualPointCount: all.length,
    distinctCohorts: cohorts.size,
    lineageQualifiedPoints: all.filter((p) => qualified(p.payload)).length,
    cohortsAnalyzed: out.length,
    pointsInAnalyzedCohorts: out.reduce((s, c) => s + c.size, 0),
    pointsInUnanalyzedTail: tail.reduce((s, [, v]) => s + v.length, 0),
    cohorts: out,
  };
  console.log(`${collection}: points=${all.length} cohorts=${cohorts.size} analyzed=${out.length}`);
  for (const c of out) console.log(`  ${String(c.size).padStart(7)} q=${String(c.lineageQualified).padStart(6)} elig=${c.eligibleForVectorComparison}/${c.sampled} ${JSON.stringify(c.vectorSource)}  ${c.cohort.slice(0, 150)}`);
}
await db.end();
receipt.databaseWrites = false;
receipt.qdrantWrites = false;
receipt.outcome = 'QDRANT_PRODUCER_COHORT_CENSUS_PROVEN_UNKNOWN_COHORTS_PRESERVED';
fs.writeFileSync(path.join(repoRoot, 'docs/reports/qdrant-producer-cohort-census-v1.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log('receipt written: docs/reports/qdrant-producer-cohort-census-v1.json');
