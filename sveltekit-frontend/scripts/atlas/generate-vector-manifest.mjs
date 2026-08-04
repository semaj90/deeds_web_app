#!/usr/bin/env node
/**
 * READ-ONLY generation of the immutable Qdrant <-> Postgres vector manifest.
 * Required before cuVS clustering or GPU top-k results can be joined back
 * safely to canonical identity. No mutation of Qdrant or Postgres.
 *
 * Scope note: per qdrant-postgres-identity-reconciliation-2026-08-04, a
 * 1000-point sample already proved EXACT_POINT_ID 1000/1000, dim=768,
 * finite=100% (PROMOTION_GATE PASS). This manifest re-verifies identity
 * mapping for ALL 52,380 rows via payload (fast — no vector fetch), and
 * cites the prior sample as the vector-quality evidence rather than
 * re-fetching all 52,380 * 768-dim * 3-named-vectors floats, which would
 * be a ~450MB fetch for no additional identity information. A full
 * exhaustive vector audit is a separate, explicitly out-of-scope task
 * (see report "not_verified_exhaustively" section).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION_V2 ?? 'codebase_chunks_768_v2';
const PAGE = 500;
const MANIFEST_OUT = 'C:/Users/james/Videos/deeds-web-app/docs/reports/atlas-vector-manifest-v1-2026-08-04.json';
const REPORT_OUT = 'C:/Users/james/Videos/deeds-web-app/docs/reports/atlas-vector-manifest-generation-2026-08-04.json';

const sha256 = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

// ── 1. Collection-level facts ────────────────────────────────────────────
const collRes = await fetch(`${QDRANT}/collections/${COLLECTION}`);
const collInfo = (await collRes.json()).result;
const declaredPointCount = collInfo.points_count;
const vectorSchema = collInfo.config?.params?.vectors ?? {};

console.log(`Collection ${COLLECTION}: ${declaredPointCount} points declared`);
console.log('Named vectors:', Object.keys(vectorSchema).map((k) => `${k}(${vectorSchema[k].size}d,${vectorSchema[k].distance})`).join(', '));

// ── 2. Scroll ALL points (payload only — no vector fetch, see scope note) ─
const rawRows = [];
let offset = null;
let page = 0;
while (true) {
  const body = { limit: PAGE, with_payload: true, with_vector: false };
  if (offset) body.offset = offset;
  const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  const pts = data.result?.points ?? [];
  if (!pts.length) break;
  for (const p of pts) rawRows.push({ id: String(p.id), payload: p.payload ?? {} });
  offset = data.result?.next_page_offset ?? null;
  page += 1;
  if (page % 20 === 0) console.log(`  scrolled ${rawRows.length} rows...`);
  if (!offset) break;
}
console.log(`Fetched ${rawRows.length} rows`);

// ── 3. Deterministic sort by postgres_id (the canonical join key) ────────
rawRows.sort((a, b) => {
  const ai = a.payload.postgres_id ?? a.id;
  const bi = b.payload.postgres_id ?? b.id;
  return ai < bi ? -1 : ai > bi ? 1 : 0;
});

// ── 4. Build manifest rows + integrity checks ─────────────────────────────
let missingPostgresId = 0;
let missingSourceRef = 0;
let missingContentHash = 0;
let idMismatch = 0;
const seenPacketKeys = new Map();
let packetKeyCollisions = 0;

const rows = rawRows.map((row, index) => {
  const p = row.payload;
  const postgresId = p.postgres_id ?? null;
  const qdrantPointId = p.qdrant_point_id ?? row.id;
  if (!postgresId) missingPostgresId += 1;
  else if (postgresId !== row.id) idMismatch += 1; // per reconciliation, should always be equal
  if (!p.source_ref) missingSourceRef += 1;
  if (!p.content_hash) missingContentHash += 1;

  const packetKey = null; // per packet-key-grain-audit-2026-08-04: existing lane is not
                           // trustworthy identity — manifest records it as null pending
                           // the grain decision, not backfilled from the unreliable corpus
  if (packetKey) {
    if (seenPacketKeys.has(packetKey)) packetKeyCollisions += 1;
    seenPacketKeys.set(packetKey, (seenPacketKeys.get(packetKey) ?? 0) + 1);
  }

  return {
    matrix_row: index,
    postgres_id: postgresId,
    qdrant_point_id: row.id, // the actual live Qdrant point id (not payload copy)
    packet_key: packetKey,
    source_ref: p.source_ref ?? null,
    content_hash: p.content_hash ?? null,
    representation_name: p.representation_name ?? null,
    projection_revision: p.projection_revision ?? null,
  };
});

// ── 5. Content-address the manifest ───────────────────────────────────────
const manifestBody = {
  manifest_version: 'atlas.vector.manifest.v1',
  collection: COLLECTION,
  vector_schema: Object.fromEntries(Object.entries(vectorSchema).map(([k, v]) => [k, { dimension: v.size, distance: v.distance }])),
  generated_at: new Date().toISOString(),
  row_count: rows.length,
  sort_key: 'postgres_id',
  immutable: true,
  read_only_after_generation: true,
  rows,
};
const manifestHash = sha256(JSON.stringify(rows));
manifestBody.manifest_id = `sha256:${manifestHash}`;

writeFileSync(MANIFEST_OUT, JSON.stringify(manifestBody, null, 2));

// ── 6. Generation report ──────────────────────────────────────────────────
const gate = {
  declared_vs_fetched_count_match: declaredPointCount === rows.length,
  missing_postgres_id: missingPostgresId,
  id_field_mismatch: idMismatch,
  missing_source_ref: missingSourceRef,
  missing_content_hash: missingContentHash,
  packet_key_collisions: packetKeyCollisions,
};
gate.RESULT = gate.declared_vs_fetched_count_match && gate.missing_postgres_id === 0 && gate.id_field_mismatch === 0
  ? 'PASS' : 'FAIL';

const report = {
  report: 'atlas-vector-manifest-generation',
  date: '2026-08-04',
  read_only: true,
  mutation_performed: false,
  manifest_path: MANIFEST_OUT,
  manifest_id: manifestBody.manifest_id,
  row_count: rows.length,
  declared_point_count: declaredPointCount,
  vector_schema: manifestBody.vector_schema,
  gate,
  packet_key_status: 'ALL_NULL_BY_DESIGN — pending grain decision, see packet-key-grain-audit-2026-08-04.md; do not backfill from the existing corpus (90.5% qdrant_id passthrough, 9.5% content-hash colliding with unresolved duplicate rows)',
  not_verified_exhaustively: [
    'vector dimension/finiteness for all 52,380 rows (verified on 1,000-row sample only — see qdrant-postgres-identity-reconciliation-2026-08-04.json, PROMOTION_GATE PASS)',
    'content_hash correctness against actual chunk content (structural presence checked, not recomputed)',
  ],
};
writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));

console.log(JSON.stringify({ manifest_id: manifestBody.manifest_id, row_count: rows.length, gate }, null, 2));
console.log('Manifest:', MANIFEST_OUT);
console.log('Report:', REPORT_OUT);
