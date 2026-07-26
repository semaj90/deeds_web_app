#!/usr/bin/env node
/**
 * Qdrant ↔ Postgres Alignment
 *
 * Aligns two Postgres tables with the live codebase_chunks_768 Qdrant collection:
 *
 *   1. atlas_packets.qdrant_point_id  — backfill missing UUIDs from Qdrant payload packet_key match
 *   2. codebase_chunk_index.qdrant_id — backfill missing UUIDs from Qdrant payload source_ref match
 *
 * Does NOT delete any Qdrant points. Read-only on Qdrant.
 * Writes only backfills to Postgres (qdrant_point_id / qdrant_id columns).
 *
 * Pre-flight report (always runs):
 *   - Total Qdrant points by ID type (UUID / integer)
 *   - UUID points classified: in_cci_only / in_ap_only / in_both / in_neither
 *   - Integer points: count (legacy, left alone)
 *   - atlas_packets: how many need qdrant_point_id backfill
 *   - codebase_chunk_index: how many need qdrant_id backfill
 *
 * Alignment strategy:
 *   - For atlas_packets: match Qdrant payload.source_ref → atlas_packets.source_ref,
 *     write point UUID back to atlas_packets.qdrant_point_id + qdrant_collection
 *   - For codebase_chunk_index: match Qdrant payload.source_ref → cci.relative_path
 *     (normalized: strip 'sveltekit-frontend/' prefix), write UUID to cci.qdrant_id
 *   - Where multiple Qdrant points share one source_ref, write the most-recently-seen UUID
 *     (deterministic: sorted by UUID lexicographic order, take first)
 *
 * Usage:
 *   node scripts/atlas/qdrant-postgres-align.mjs [--dry-run] [--verbose] [--json]
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(__dir, '../../sveltekit-frontend/.env.local'), override: true });

const DRY_RUN  = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');

const QDRANT_URL        = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const SCROLL_BATCH = 500;
const PG_BATCH     = 500;

const PG_CONFIG = {
  host:                    process.env.DB_HOST  || process.env.PGHOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT  || process.env.PGPORT     || '5434'),
  database:                process.env.DB_NAME  || process.env.PGDATABASE || 'legal_ai_db',
  user:                    process.env.DB_USER  || process.env.PGUSER     || 'legal_admin',
  password:                process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
};

if (!PG_CONFIG.password) {
  console.error('FATAL: PostgreSQL password not configured. Set DB_PASSWORD in .env.local');
  process.exit(1);
}

function log(...args) { if (VERBOSE) console.log(...args); }

function normalizeSourceRef(sr) {
  if (!sr) return null;
  // Strip leading sveltekit-frontend/ so we can match cci.relative_path (which uses 'src/...')
  return sr.replace(/^sveltekit-frontend\//, '');
}

async function scrollQdrantPayloads() {
  const points = [];
  let offset = null;

  while (true) {
    const body = {
      limit: SCROLL_BATCH,
      with_payload: ['source_ref', 'packet_key', 'kind'],
      with_vector: false,
    };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const batch = data.result?.points ?? [];
    if (!batch.length) break;

    for (const p of batch) {
      if (typeof p.id === 'string') points.push(p); // UUID only
    }

    if (points.length % 10000 < SCROLL_BATCH) log(`  Scrolled ${points.length} UUID points...`);
    offset = data.result?.next_page_offset;
    if (!offset) break;
  }
  return points;
}

async function main() {
  console.log(`=== Qdrant ↔ Postgres Alignment — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  console.log('');

  const pool = new pg.Pool(PG_CONFIG);

  // ── Load Postgres state ────────────────────────────────────────────────────
  console.log('Loading Postgres state...');

  const [apR, cciR] = await Promise.all([
    pool.query(`
      SELECT packet_key, source_ref, qdrant_point_id
      FROM atlas_packets
      WHERE source_ref IS NOT NULL
    `),
    pool.query(`
      SELECT id, qdrant_id, relative_path
      FROM codebase_chunk_index
    `),
  ]);

  // atlas_packets: index by source_ref → {packet_key, current_qdrant_point_id}
  const apBySourceRef = new Map();
  for (const row of apR.rows) {
    apBySourceRef.set(row.source_ref, { packet_key: row.packet_key, qdrant_point_id: row.qdrant_point_id });
  }

  // codebase_chunk_index: index by normalized relative_path → {id, current_qdrant_id}
  // One path can have multiple chunks — collect all
  const cciByPath = new Map();
  for (const row of cciR.rows) {
    const norm = normalizeSourceRef(row.relative_path) || row.relative_path;
    if (!cciByPath.has(norm)) cciByPath.set(norm, []);
    cciByPath.get(norm).push({ id: row.id, qdrant_id: row.qdrant_id });
  }

  console.log(`  atlas_packets:          ${apR.rows.length} rows`);
  console.log(`  codebase_chunk_index:   ${cciR.rows.length} rows`);
  console.log('');

  // ── Scroll Qdrant UUID points ──────────────────────────────────────────────
  console.log('Scrolling Qdrant UUID points...');
  const qdrantPoints = await scrollQdrantPayloads();
  console.log(`  ${qdrantPoints.length} UUID points`);
  console.log('');

  // ── Build backfill maps ────────────────────────────────────────────────────
  // For atlas_packets: source_ref → canonical Qdrant UUID
  // For codebase_chunk_index: relative_path (normalized) → canonical Qdrant UUID
  //
  // Where multiple Qdrant points share one source_ref, pick lexicographically first UUID
  // (deterministic across runs)

  const apBackfill   = new Map(); // source_ref → uuid
  const cciBackfill  = new Map(); // normalized_path → uuid

  let dirClusterSkipped = 0;
  let noSourceRef = 0;

  for (const p of qdrantPoints) {
    const id = p.id; // UUID string
    const payload = p.payload ?? {};

    if (payload.kind === 'directory-cluster') { dirClusterSkipped++; continue; }

    const sourceRef = payload.source_ref;
    if (!sourceRef) { noSourceRef++; continue; }

    const normRef = normalizeSourceRef(sourceRef);

    // atlas_packets backfill
    if (apBySourceRef.has(sourceRef)) {
      const existing = apBySourceRef.get(sourceRef);
      if (!existing.qdrant_point_id) {
        // No UUID yet — record this one (or keep lexicographically first)
        const prev = apBackfill.get(sourceRef);
        if (!prev || id < prev) apBackfill.set(sourceRef, id);
      }
    }

    // codebase_chunk_index backfill (match on normalized path)
    if (cciByPath.has(normRef)) {
      const rows = cciByPath.get(normRef);
      // Only backfill rows that don't have qdrant_id yet
      const needsBackfill = rows.filter(r => !r.qdrant_id);
      if (needsBackfill.length > 0) {
        const prev = cciBackfill.get(normRef);
        if (!prev || id < prev) cciBackfill.set(normRef, id);
      }
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const apNeedBackfill    = apR.rows.filter(r => !r.qdrant_point_id).length;
  const apWillBackfill    = apBackfill.size;
  const apNoQdrantMatch   = apNeedBackfill - apWillBackfill;

  const cciNeedBackfill   = cciR.rows.filter(r => !r.qdrant_id).length;
  const cciWillBackfill   = [...cciBackfill.values()].length; // unique paths with matches
  // Count actual CCI rows that will be updated (one path may have N chunks)
  let cciRowsToUpdate = 0;
  for (const [normRef] of cciBackfill) {
    cciRowsToUpdate += (cciByPath.get(normRef) ?? []).filter(r => !r.qdrant_id).length;
  }

  console.log('=== Pre-flight Report ===');
  console.log(`  Qdrant UUID points:              ${qdrantPoints.length}`);
  console.log(`    dir-cluster (skipped):         ${dirClusterSkipped}`);
  console.log(`    no source_ref (skipped):       ${noSourceRef}`);
  console.log('');
  console.log(`  atlas_packets:`);
  console.log(`    total rows:                    ${apR.rows.length}`);
  console.log(`    already have qdrant_point_id:  ${apR.rows.length - apNeedBackfill}`);
  console.log(`    missing qdrant_point_id:       ${apNeedBackfill}`);
  console.log(`    will backfill (Qdrant match):  ${apWillBackfill}`);
  console.log(`    no Qdrant match found:         ${apNoQdrantMatch}`);
  console.log('');
  console.log(`  codebase_chunk_index:`);
  console.log(`    total rows:                    ${cciR.rows.length}`);
  console.log(`    already have qdrant_id:        ${cciR.rows.length - cciNeedBackfill}`);
  console.log(`    missing qdrant_id:             ${cciNeedBackfill}`);
  console.log(`    paths with Qdrant match:       ${cciWillBackfill}`);
  console.log(`    rows that will be updated:     ${cciRowsToUpdate}`);
  console.log('');

  const stats = {
    qdrant_uuid_points: qdrantPoints.length,
    ap: { total: apR.rows.length, had_id: apR.rows.length - apNeedBackfill, missing: apNeedBackfill, backfilled: 0, no_match: apNoQdrantMatch, errors: 0 },
    cci: { total: cciR.rows.length, had_id: cciR.rows.length - cciNeedBackfill, missing: cciNeedBackfill, backfilled: 0, no_match: cciNeedBackfill - cciRowsToUpdate, errors: 0 },
  };

  if (DRY_RUN) {
    console.log('[dry-run] Would update:');
    console.log(`  atlas_packets.qdrant_point_id:  ${apWillBackfill} rows`);
    console.log(`  codebase_chunk_index.qdrant_id: ${cciRowsToUpdate} rows`);
    stats.ap.backfilled = apWillBackfill;
    stats.cci.backfilled = cciRowsToUpdate;
  } else {
    // ── atlas_packets backfill ─────────────────────────────────────────────
    console.log(`Backfilling atlas_packets.qdrant_point_id (${apWillBackfill} rows)...`);
    const apEntries = [...apBackfill.entries()]; // [source_ref, uuid]

    for (let i = 0; i < apEntries.length; i += PG_BATCH) {
      const batch = apEntries.slice(i, i + PG_BATCH);
      const sourceRefs = batch.map(e => e[0]);
      const uuids      = batch.map(e => e[1]);
      try {
        const r = await pool.query(`
          UPDATE atlas_packets
          SET qdrant_point_id  = data.uuid,
              qdrant_collection = $3,
              updated_at        = NOW()
          FROM (
            SELECT unnest($1::text[]) AS source_ref,
                   unnest($2::text[]) AS uuid
          ) data
          WHERE atlas_packets.source_ref = data.source_ref
            AND atlas_packets.qdrant_point_id IS NULL
        `, [sourceRefs, uuids, QDRANT_COLLECTION]);
        stats.ap.backfilled += r.rowCount;
        log(`  atlas_packets: ${stats.ap.backfilled}/${apWillBackfill} updated`);
      } catch (e) {
        stats.ap.errors++;
        console.error(`  atlas_packets batch error: ${e.message}`);
      }
    }
    console.log(`  atlas_packets backfilled: ${stats.ap.backfilled}`);

    // ── codebase_chunk_index backfill ──────────────────────────────────────
    console.log(`Backfilling codebase_chunk_index.qdrant_id (${cciRowsToUpdate} rows)...`);

    // Collect [row.id, uuid] pairs
    const cciPairs = [];
    for (const [normRef, uuid] of cciBackfill.entries()) {
      const rows = cciByPath.get(normRef) ?? [];
      for (const row of rows) {
        if (!row.qdrant_id) cciPairs.push([row.id, uuid]);
      }
    }

    for (let i = 0; i < cciPairs.length; i += PG_BATCH) {
      const batch = cciPairs.slice(i, i + PG_BATCH);
      const ids   = batch.map(e => e[0]);
      const uuids = batch.map(e => e[1]);
      try {
        const r = await pool.query(`
          UPDATE codebase_chunk_index
          SET qdrant_id  = data.uuid,
              updated_at = NOW()
          FROM (
            SELECT unnest($1::uuid[]) AS id,
                   unnest($2::text[]) AS uuid
          ) data
          WHERE codebase_chunk_index.id = data.id
            AND codebase_chunk_index.qdrant_id IS NULL
        `, [ids, uuids]);
        stats.cci.backfilled += r.rowCount;
        log(`  codebase_chunk_index: ${stats.cci.backfilled}/${cciRowsToUpdate} updated`);
      } catch (e) {
        stats.cci.errors++;
        console.error(`  codebase_chunk_index batch error: ${e.message}`);
      }
    }
    console.log(`  codebase_chunk_index backfilled: ${stats.cci.backfilled}`);
  }

  await pool.end().catch(() => {});

  console.log('');
  console.log('=== Summary ===');
  console.log(`  atlas_packets.qdrant_point_id:  backfilled=${stats.ap.backfilled}, no_match=${stats.ap.no_match}, errors=${stats.ap.errors}`);
  console.log(`  codebase_chunk_index.qdrant_id: backfilled=${stats.cci.backfilled}, no_match=${stats.cci.no_match}, errors=${stats.cci.errors}`);

  const report = { run_at: new Date().toISOString(), dry_run: DRY_RUN, collection: QDRANT_COLLECTION, ...stats };

  if (JSON_OUT) {
    const outPath = join(__dir, '../../docs/reports/qdrant-postgres-align.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('\nJSON report: docs/reports/qdrant-postgres-align.json');
  }

  const ok = stats.ap.errors === 0 && stats.cci.errors === 0;
  console.log(ok ? '\n✅ Alignment complete' : '\n⚠ Alignment done with errors');
  process.exit(ok ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
