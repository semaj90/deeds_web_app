#!/usr/bin/env node
/**
 * SEM768-GATE-02: Qdrant representation + identity census (v2 of this audit). READ-ONLY: scrolls Qdrant, reads Postgres, embeds via local Ollama,
 * writes one small JSON receipt. Never rebuilds or "fixes" anything; payload defects are projection-drift EVIDENCE for a later remediation gate.
 *
 * 1. PAYLOAD CENSUS (all points, payload-only scroll): actual vs documented point count, and how many points carry each identity/lineage field.
 * 2. STRATIFIED SAMPLE: buckets = producer era (payload packet_version / projection_revision) x identity shape (uuid id, corrupt source_ref, hash),
 *    deterministic (sha256 order), equal share per bucket, so a mixed history is not hidden by random sampling.
 * 3. IDENTITY CLASS per sampled point: EXACT_ID_AND_CONTENT_HASH | EXACT_ID_HASH_MISMATCH | SOURCE_REF_AND_CONTENT_HASH_FALLBACK |
 *    SOURCE_REF_CORRUPT | POSTGRES_ROW_MISSING | QDRANT_PAYLOAD_INCOMPLETE. Only the first and third are eligible for recipe inference.
 * 4. RECIPE INFERENCE on eligible points only: cosine of the Qdrant `content` vector vs fresh embeddings under raw / `title: none` /
 *    `title: {relative_path}`; >= THRESHOLD names the recipe, else UNKNOWN.
 * Two separate conclusions: vectorRecipe (how vectors were produced) vs interchangeableExecutor (needs a complete Parent Atlas envelope).
 * Qdrant parity answers "what is stored"; it never selects the semantic recipe (human Phase2F does).
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
const COLLECTIONS = [['codebase_chunks_768', 105762], ['codebase_chunks_768_v2', 52380]]; // [name, point count documented in CLAUDE.md]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYLOAD_FIELDS = ['postgres_id', 'chunk_id', 'content_hash', 'source_ref', 'packet_key', 'source_revision', 'workspace_revision',
  'representation_revision', 'representation_name', 'model_revision', 'packet_version', 'projection_revision', 'embedding_model'];
const ENVELOPE = ['representation_revision', 'model_revision', 'packet_key', 'source_ref', 'source_revision', 'workspace_revision', 'content_hash'];

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
const present = (v) => v !== null && v !== undefined && String(v) !== '';
async function embedMany(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts.slice(i, i + 32).map((t) => t.slice(0, 2000)) }) });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    out.push(...(await r.json()).embeddings);
  }
  return out;
}
async function scrollAllPayloads(collection) {
  const pts = [];
  let offset = null;
  do {
    const r = await qfetch(`${QDRANT}/collections/${collection}/points/scroll`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 4000, offset, with_payload: { include: PAYLOAD_FIELDS }, with_vector: false }),
    });
    const j = (await r.json()).result;
    for (const p of j.points) pts.push({ id: p.id, payload: p.payload ?? {} });
    offset = j.next_page_offset;
  } while (offset);
  return pts;
}
async function fetchVectors(collection, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await qfetch(`${QDRANT}/collections/${collection}/points`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ids.slice(i, i + 100), with_payload: false, with_vector: ['content'] }),
    });
    for (const p of (await r.json()).result ?? []) out.set(String(p.id), p.vector?.content ?? null);
  }
  return out;
}

// Qdrant keep-alive sockets can be closed while the sample is being built; retry with a fresh request.
async function qfetch(url, init) {
  for (let attempt = 1; ; attempt++) {
    try { return await fetch(url, init); } catch (e) { if (attempt >= 4) throw e; await new Promise((r) => setTimeout(r, 500 * attempt)); }
  }
}

const RECIPES = {
  raw: (r) => r.content,
  title_none: (r) => `title: none | text: ${r.content}`,
  title_relative_path: (r) => `title: ${r.relative_path} | text: ${r.content}`,
};
const eraOf = (pl) => String(pl.packet_version ?? pl.projection_revision ?? '(none)');
const uuidIdOf = (pl) => (UUID_RE.test(String(pl.postgres_id ?? '')) ? pl.postgres_id : UUID_RE.test(String(pl.chunk_id ?? '')) ? pl.chunk_id : null);
const corruptRef = (pl) => present(pl.source_ref) && /^\d{1,4}$/.test(String(pl.source_ref).trim());
const shape = (pl) => `${uuidIdOf(pl) ? 'uuid' : 'nouuid'}|${corruptRef(pl) ? 'badref' : present(pl.source_ref) ? 'ref' : 'noref'}|${present(pl.content_hash) ? 'hash' : 'nohash'}`;

const db = new Client({ connectionString: envVal('DATABASE_URL'), statement_timeout: 60000 });
await db.connect();
const receipt = { schema: 'atlas.qdrant-representation-parity.v2', canonicalAuthority: false, mode: 'READ_ONLY', sampleRequested: SAMPLE, threshold: THRESHOLD, collections: {} };

for (const [collection, documented] of COLLECTIONS) {
  const all = await scrollAllPayloads(collection);
  // 1. payload census
  const count = (f) => all.filter((p) => f(p.payload)).length;
  const eras = {};
  for (const p of all) eras[eraOf(p.payload)] = (eras[eraOf(p.payload)] ?? 0) + 1;
  const census = {
    actualPointCount: all.length, documentedPointCount: documented,
    uuidIdCount: count((pl) => uuidIdOf(pl)),
    sourceRefPresentCount: count((pl) => present(pl.source_ref)),
    badSourceRefCount: count(corruptRef),
    contentHashPresentCount: count((pl) => present(pl.content_hash)),
    packetKeyPresentCount: count((pl) => present(pl.packet_key)),
    sourceRevisionPresentCount: count((pl) => present(pl.source_revision)),
    workspaceRevisionPresentCount: count((pl) => present(pl.workspace_revision)),
    representationRevisionPresentCount: count((pl) => present(pl.representation_revision)),
    modelRevisionPresentCount: count((pl) => present(pl.model_revision)),
    producerEras: eras,
    identityShapes: all.reduce((m, p) => { const k = shape(p.payload); m[k] = (m[k] ?? 0) + 1; return m; }, {}),
  };
  // 2. stratified deterministic sample over (era x shape) buckets
  const buckets = new Map();
  for (const p of all) { const k = `${eraOf(p.payload)}||${shape(p.payload)}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(p); }
  for (const arr of buckets.values()) arr.sort((a, b) => (sha(a.id) < sha(b.id) ? -1 : 1));
  const per = Math.max(1, Math.floor(SAMPLE / buckets.size));
  let sample = [];
  for (const arr of buckets.values()) sample.push(...arr.slice(0, per));
  for (let round = per; sample.length < SAMPLE; round++) {
    let added = 0;
    for (const arr of buckets.values()) { if (arr[round] && sample.length < SAMPLE) { sample.push(arr[round]); added++; } }
    if (!added) break;
  }
  const vectors = await fetchVectors(collection, sample.map((p) => p.id));
  // 3. identity classification
  const uuids = sample.map((p) => uuidIdOf(p.payload)).filter(Boolean);
  const pgRows = new Map((await db.query('SELECT id::text id, relative_path, content, content_hash FROM codebase_chunk_index WHERE id::text = ANY($1)', [uuids])).rows.map((r) => [r.id, r]));
  const hashMatches = (row, pl) => present(pl.content_hash) && String(row.content_hash ?? '').startsWith(String(pl.content_hash).slice(0, 16));
  const classes = {};
  const eligible = [];
  for (const p of sample) {
    const pl = p.payload;
    let cls, row = null;
    if (corruptRef(pl)) cls = 'SOURCE_REF_CORRUPT';
    else if (!present(pl.content_hash) || !(uuidIdOf(pl) || present(pl.source_ref))) cls = 'QDRANT_PAYLOAD_INCOMPLETE';
    else {
      const uid = uuidIdOf(pl);
      const exact = uid ? pgRows.get(uid) : null;
      if (exact) { cls = hashMatches(exact, pl) ? 'EXACT_ID_AND_CONTENT_HASH' : 'EXACT_ID_HASH_MISMATCH'; row = cls === 'EXACT_ID_AND_CONTENT_HASH' ? exact : null; }
      else if (present(pl.source_ref)) {
        const fb = (await db.query('SELECT id::text id, relative_path, content, content_hash FROM codebase_chunk_index WHERE (relative_path = $1 OR source_ref = $1) AND content_hash LIKE $2 LIMIT 1', [pl.source_ref, `${String(pl.content_hash).slice(0, 16)}%`])).rows[0];
        if (fb) { cls = 'SOURCE_REF_AND_CONTENT_HASH_FALLBACK'; row = fb; } else cls = uid ? 'POSTGRES_ROW_MISSING' : 'QDRANT_PAYLOAD_INCOMPLETE';
      } else cls = 'POSTGRES_ROW_MISSING';
    }
    classes[cls] = (classes[cls] ?? 0) + 1;
    if (row && vectors.get(String(p.id))) eligible.push({ p, row, cls });
  }
  // 4. recipe inference on eligible points only
  const fresh = {};
  for (const [name, fn] of Object.entries(RECIPES)) fresh[name] = await embedMany(eligible.map((x) => fn(x.row)));
  const hist = {}, byEra = {}, best = { raw: [], title_none: [], title_relative_path: [] };
  eligible.forEach((x, i) => {
    const v = vectors.get(String(x.p.id));
    const scores = Object.fromEntries(Object.keys(RECIPES).map((n) => [n, cos(v, fresh[n][i])]));
    for (const n of Object.keys(RECIPES)) best[n].push(scores[n]);
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const label = top[1] >= THRESHOLD ? top[0] : 'UNKNOWN';
    hist[label] = (hist[label] ?? 0) + 1;
    const era = eraOf(x.p.payload);
    byEra[era] ??= {}; byEra[era][label] = (byEra[era][label] ?? 0) + 1;
  });
  const st = (a) => (a.length ? { n: a.length, min: +Math.min(...a).toFixed(4), avg: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(4), ge_threshold: a.filter((v) => v >= THRESHOLD).length } : { n: 0 });
  const n = eligible.length;
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
  const eraTops = Object.values(byEra).map((h) => Object.entries(h).sort((a, b) => b[1] - a[1])[0][0]);
  let vectorRecipe, reason;
  // The stratified sample deliberately over-represents rare/incomplete payload shapes, so measure identity sufficiency among the points
  // whose payload is complete enough to attempt verification, not against the whole (oversampled) sample.
  const attemptable = sample.length - (classes.QDRANT_PAYLOAD_INCOMPLETE ?? 0) - (classes.SOURCE_REF_CORRUPT ?? 0);
  if (n < 20 || n < 0.5 * attemptable) { vectorRecipe = 'QDRANT_REPRESENTATION_MIXED_OR_UNKNOWN'; reason = 'IDENTITY_INSUFFICIENT'; }
  else if (top[0] !== 'UNKNOWN' && top[1] / n >= 0.9) { vectorRecipe = `QDRANT_VECTOR_RECIPE_IDENTIFIED:${top[0]}`; reason = 'SINGLE_RECIPE_AMONG_ELIGIBLE'; }
  else if (new Set(eraTops).size > 1) { vectorRecipe = 'QDRANT_REPRESENTATION_MIXED_OR_UNKNOWN'; reason = 'COHORTS_DISAGREE'; }
  else { vectorRecipe = 'QDRANT_REPRESENTATION_MIXED_OR_UNKNOWN'; reason = 'UNKNOWN_REMAINDER'; }
  const envelopeGaps = ENVELOPE.filter((f) => count((pl) => present(pl[f])) < 0.9 * all.length);
  receipt.collections[collection] = {
    payloadCensus: census,
    sample: { size: sample.length, buckets: buckets.size, perBucket: per },
    identityClassHistogram: classes,
    eligibleForRepresentationInference: n,
    recipeHistogramEligible: hist,
    recipeHistogramByProducerEra: byEra,
    freshRecipeCosineEligible: Object.fromEntries(Object.entries(best).map(([k, v]) => [k, st(v)])),
    vectorRecipe, vectorRecipeReason: reason,
    interchangeableExecutorProven: false,
    interchangeableExecutorBlockers: envelopeGaps.length ? envelopeGaps.map((f) => `${f} present on <90 percent of points`) : ['envelope fields present, but recipe/identity not yet proven interchangeable'],
  };
  console.log(`${collection}: points=${all.length} sample=${sample.length} eligible=${n} classes=${JSON.stringify(classes)} recipe=${JSON.stringify(hist)} -> ${vectorRecipe} (${reason})`);
}
await db.end();
receipt.databaseWrites = false;
receipt.qdrantWrites = false;
fs.writeFileSync(path.join(repoRoot, 'docs/reports/qdrant-representation-parity-v1.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log('receipt written: docs/reports/qdrant-representation-parity-v1.json');
