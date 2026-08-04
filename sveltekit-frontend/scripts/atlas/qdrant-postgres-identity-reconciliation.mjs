#!/usr/bin/env node
/**
 * READ-ONLY Qdrant ↔ Postgres identity reconciliation.
 * Samples N points from codebase_chunks_768_v2 and classifies each against
 * codebase_chunk_index. No payload mutation, no writes anywhere.
 *
 * Classifications (strongest match wins):
 *   EXACT_POINT_ID        point.id === chunk.id OR chunk.qdrant_id
 *   EXACT_SOURCE_HASH_SPAN unique row with same source_ref + content_hash
 *   EXACT_TEXT_HASH       unique row with same content_hash (any source_ref)
 *   AMBIGUOUS             >1 row matches at the strongest tier reached
 *   MISSING_POSTGRES      no row matches by any key
 *   CONFLICTING           point-id match exists but source_ref/content_hash contradict payload
 *
 * Promotion gate: exact 100%, ambiguous 0, conflicting 0, dim 768, finite 100%.
 */
import { writeFileSync } from 'node:fs';
import pg from 'pg';

const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION_V2 ?? 'codebase_chunks_768_v2';
const SAMPLE = Number(process.env.RECON_SAMPLE ?? 1000);
const PAGE = 100;
const OUT = 'C:/Users/james/Videos/deeds-web-app/docs/reports/qdrant-postgres-identity-reconciliation-2026-08-04.json';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 4,
});

// ── 1. Scroll sample points (with vectors for dim/finiteness gate) ──────────
const points = [];
let offset = null;
let dimBad = 0;
let nonFinite = 0;
while (points.length < SAMPLE) {
  const body = { limit: Math.min(PAGE, SAMPLE - points.length), with_payload: true, with_vector: true };
  if (offset) body.offset = offset;
  const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  const page = data.result?.points ?? [];
  if (!page.length) break;
  for (const p of page) {
    const vec = Array.isArray(p.vector) ? p.vector : p.vector?.content ?? p.vector?.[Object.keys(p.vector ?? {})[0]];
    const arr = Array.isArray(vec) ? vec : [];
    if (arr.length !== 768) dimBad += 1;
    if (arr.some((x) => !Number.isFinite(x))) nonFinite += 1;
    points.push({ id: String(p.id), payload: p.payload ?? {} });
  }
  offset = data.result?.next_page_offset ?? null;
  if (!offset) break;
}
console.log(`sampled ${points.length} points  dim!=768: ${dimBad}  non-finite: ${nonFinite}`);

// ── 2. Batch Postgres lookups ────────────────────────────────────────────────
const ids = points.map((p) => p.id);
const hashes = [...new Set(points.map((p) => p.payload.content_hash).filter(Boolean))];
const srefs = [...new Set(points.map((p) => p.payload.source_ref).filter(Boolean))];

const byId = new Map();
const byQdrantId = new Map();
const byHash = new Map();       // content_hash → rows[]
const bySrefHash = new Map();   // source_ref|content_hash → rows[]

const rowQuery = `SELECT id::text AS id, qdrant_id::text AS qdrant_id, source_ref, content_hash FROM codebase_chunk_index`;
const r1 = await pool.query(`${rowQuery} WHERE id::text = ANY($1)`, [ids]);
for (const row of r1.rows) byId.set(row.id, row);
const r2 = await pool.query(`${rowQuery} WHERE qdrant_id::text = ANY($1)`, [ids]);
for (const row of r2.rows) byQdrantId.set(row.qdrant_id, row);
const r3 = await pool.query(`${rowQuery} WHERE content_hash = ANY($1)`, [hashes]);
for (const row of r3.rows) {
  if (!byHash.has(row.content_hash)) byHash.set(row.content_hash, []);
  byHash.get(row.content_hash).push(row);
  const key = `${row.source_ref}|${row.content_hash}`;
  if (!bySrefHash.has(key)) bySrefHash.set(key, []);
  bySrefHash.get(key).push(row);
}
// supplementary: do these ids exist in atlas_packets instead?
let atlasIdHits = 0;
try {
  const r4 = await pool.query(`SELECT COUNT(*)::int AS n FROM atlas_packets WHERE id::text = ANY($1)`, [ids]);
  atlasIdHits = r4.rows[0]?.n ?? 0;
} catch { /* column shape may differ; informational only */ }

// source_ref coverage (informational)
const r5 = await pool.query(`SELECT COUNT(DISTINCT source_ref)::int AS n FROM codebase_chunk_index WHERE source_ref = ANY($1)`, [srefs]);
const srefCoverage = r5.rows[0]?.n ?? 0;

// ── 3. Classify ──────────────────────────────────────────────────────────────
const counts = {
  EXACT_POINT_ID: 0, EXACT_SOURCE_HASH_SPAN: 0, EXACT_TEXT_HASH: 0,
  AMBIGUOUS: 0, MISSING_POSTGRES: 0, MISSING_QDRANT: 0, CONFLICTING: 0,
};
const samples = { CONFLICTING: [], AMBIGUOUS: [], MISSING_POSTGRES: [], EXACT_POINT_ID: [], EXACT_SOURCE_HASH_SPAN: [], EXACT_TEXT_HASH: [] };
const push = (cls, p, extra = {}) => {
  counts[cls] += 1;
  if (samples[cls] && samples[cls].length < 5) samples[cls].push({ pointId: p.id, source_ref: p.payload.source_ref, content_hash: p.payload.content_hash, ...extra });
};

for (const p of points) {
  const idRow = byId.get(p.id) ?? byQdrantId.get(p.id);
  if (idRow) {
    const contradicts =
      (p.payload.source_ref && idRow.source_ref && p.payload.source_ref !== idRow.source_ref) ||
      (p.payload.content_hash && idRow.content_hash && p.payload.content_hash !== idRow.content_hash);
    if (contradicts) { push('CONFLICTING', p, { row: idRow }); continue; }
    push('EXACT_POINT_ID', p); continue;
  }
  const srefHashRows = bySrefHash.get(`${p.payload.source_ref}|${p.payload.content_hash}`) ?? [];
  if (srefHashRows.length === 1) { push('EXACT_SOURCE_HASH_SPAN', p, { rowId: srefHashRows[0].id }); continue; }
  if (srefHashRows.length > 1) { push('AMBIGUOUS', p, { tier: 'source_hash', matches: srefHashRows.length }); continue; }
  const hashRows = byHash.get(p.payload.content_hash) ?? [];
  if (hashRows.length === 1) { push('EXACT_TEXT_HASH', p, { rowId: hashRows[0].id, rowSourceRef: hashRows[0].source_ref }); continue; }
  if (hashRows.length > 1) { push('AMBIGUOUS', p, { tier: 'text_hash', matches: hashRows.length }); continue; }
  push('MISSING_POSTGRES', p);
}

await pool.end();

// ── 4. Gate + report ─────────────────────────────────────────────────────────
const exact = counts.EXACT_POINT_ID + counts.EXACT_SOURCE_HASH_SPAN + counts.EXACT_TEXT_HASH;
const gate = {
  exact_identity_rate: points.length ? exact / points.length : 0,
  ambiguous: counts.AMBIGUOUS,
  conflicting: counts.CONFLICTING,
  dim_768_all: dimBad === 0,
  finite_all: nonFinite === 0,
};
gate.PROMOTION_GATE =
  gate.exact_identity_rate === 1 && gate.ambiguous === 0 && gate.conflicting === 0 && gate.dim_768_all && gate.finite_all
    ? 'PASS' : 'FAIL';

const report = {
  report: 'qdrant-postgres-identity-reconciliation',
  date: '2026-08-04',
  collection: COLLECTION,
  sample_size: points.length,
  read_only: true,
  counts,
  vector_checks: { dim_not_768: dimBad, non_finite: nonFinite },
  gate,
  informational: {
    atlas_packets_id_hits: atlasIdHits,
    distinct_source_refs_in_sample: srefs.length,
    source_refs_present_in_postgres: srefCoverage,
  },
  samples,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ counts, gate, informational: report.informational }, null, 2));
console.log('Report:', OUT);
