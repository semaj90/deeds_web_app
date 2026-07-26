#!/usr/bin/env node
/**
 * Qdrant Point-Level Reconciliation
 *
 * Produces a classified report of every Qdrant point in codebase_chunks_768
 * vs. the canonical Postgres population (codebase_chunk_index).
 *
 * Classification buckets:
 *   EXACT_MATCH            — point.id == cci.qdrant_id, source_ref matches
 *   ID_MATCH_NO_SOURCE_REF — point.id matches but Postgres row has no source_ref
 *   SOURCE_REF_MISMATCH    — point.id matches qdrant_id but source_ref differs
 *   ORPHAN_NO_PG_ROW       — point.id not found in cci.qdrant_id at all
 *   PAYLOAD_INCOMPLETE     — point.id matches but packet_key missing in payload
 *   DIRECTORY_CLUSTER      — kind=directory-cluster (excluded from sync scope)
 *
 * Safe actions derived from this report:
 *   QUARANTINE_CANDIDATE   — ORPHAN_NO_PG_ROW with no atlas_packets source_ref match
 *   PAYLOAD_BACKFILL       — PAYLOAD_INCOMPLETE (backfill, do not delete)
 *   NO_ACTION              — everything else
 *
 * Does NOT delete anything. Outputs JSON report + summary.
 *
 * Usage:
 *   node scripts/atlas/qdrant-point-reconciliation.mjs [--verbose] [--json] [--limit N]
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env.local'), override: true });

const VERBOSE  = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1])
  : Infinity;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const SCROLL_BATCH = 250;

const PG_CONFIG = {
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5434'),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
};

if (!PG_CONFIG.password) {
  console.error('FATAL: PostgreSQL password is not configured. Set DB_PASSWORD or PGPASSWORD in .env.local');
  process.exit(1);
}

function log(...args) { if (VERBOSE) console.log(...args); }

async function scrollQdrant() {
  const points = [];
  let offset = null;
  let total = 0;

  while (true) {
    const body = {
      limit: SCROLL_BATCH,
      with_payload: ['source_ref', 'packet_key', 'content_hash', 'kind', 'chunk_id', 'relative_path'],
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
    if (batch.length === 0) break;

    points.push(...batch);
    total += batch.length;
    if (total % 5000 === 0) log(`  Scrolled ${total} points...`);
    if (total >= LIMIT) { log(`  Reached limit ${LIMIT}`); break; }

    offset = data.result?.next_page_offset;
    if (!offset) break;
  }
  return points;
}

async function main() {
  console.log('=== Qdrant Point-Level Reconciliation ===');
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  console.log('');

  const pool = new pg.Pool(PG_CONFIG);

  // ── Load canonical Postgres population ──────────────────────────────────────
  console.log('Loading codebase_chunk_index from Postgres...');
  const pgRows = await pool.query(`
    SELECT qdrant_id, relative_path, content_hash, chunk_id
    FROM codebase_chunk_index
    WHERE qdrant_id IS NOT NULL
  `);

  // Build lookup maps keyed by qdrant_id (UUID string)
  const pgByQdrantId = new Map();
  for (const row of pgRows.rows) {
    pgByQdrantId.set(row.qdrant_id, row);
  }
  console.log(`  ${pgRows.rows.length} Postgres rows with qdrant_id`);

  // Also load atlas_packets source_refs for fallback classification
  const apRows = await pool.query(`SELECT DISTINCT source_ref FROM atlas_packets WHERE source_ref IS NOT NULL`);
  const atlasSourceRefs = new Set(apRows.rows.map(r => r.source_ref));
  console.log(`  ${atlasSourceRefs.size} distinct source_refs in atlas_packets`);
  console.log('');

  // ── Scroll all Qdrant points ─────────────────────────────────────────────────
  console.log('Scrolling Qdrant points...');
  const qdrantPoints = await scrollQdrant();
  console.log(`  ${qdrantPoints.length} total Qdrant points`);
  console.log('');

  // ── Classify each point ──────────────────────────────────────────────────────
  const buckets = {
    DIRECTORY_CLUSTER:      [],
    EXACT_MATCH:            [],
    ID_MATCH_NO_SOURCE_REF: [],
    SOURCE_REF_MISMATCH:    [],
    PAYLOAD_INCOMPLETE:     [],
    ORPHAN_NO_PG_ROW:       [],
  };

  for (const point of qdrantPoints) {
    const id = String(point.id);
    const payload = point.payload ?? {};

    // Directory clusters are out of sync scope
    if (payload.kind === 'directory-cluster') {
      buckets.DIRECTORY_CLUSTER.push(id);
      continue;
    }

    const pgRow = pgByQdrantId.get(id);

    if (!pgRow) {
      // Point UUID not found as qdrant_id in codebase_chunk_index
      buckets.ORPHAN_NO_PG_ROW.push({ id, source_ref: payload.source_ref, packet_key: payload.packet_key });
      continue;
    }

    // ID matched — check payload completeness
    if (!payload.packet_key) {
      buckets.PAYLOAD_INCOMPLETE.push({ id, source_ref: payload.source_ref, pg_relative_path: pgRow.relative_path });
      continue;
    }

    // Check source_ref alignment
    const qdrantSrc = payload.source_ref;
    const pgPath = pgRow.relative_path;

    // Normalize: qdrant source_ref may be sveltekit-frontend/... or just the relative path
    const pgNorm = pgPath?.replace(/^sveltekit-frontend\//, '');
    const qdNorm = qdrantSrc?.replace(/^sveltekit-frontend\//, '');

    if (!qdrantSrc) {
      buckets.ID_MATCH_NO_SOURCE_REF.push({ id, pg_relative_path: pgPath });
    } else if (pgNorm && qdNorm && pgNorm !== qdNorm) {
      buckets.SOURCE_REF_MISMATCH.push({ id, qdrant_source_ref: qdrantSrc, pg_relative_path: pgPath });
    } else {
      buckets.EXACT_MATCH.push(id);
    }
  }

  // ── Derive safe actions ──────────────────────────────────────────────────────
  // ORPHAN_NO_PG_ROW: further classify by atlas_packets source_ref
  const quarantineCandidates = [];
  const atlasOnlyOrphans = [];
  for (const o of buckets.ORPHAN_NO_PG_ROW) {
    if (o.source_ref && atlasSourceRefs.has(o.source_ref)) {
      atlasOnlyOrphans.push(o); // present in atlas_packets but not in codebase_chunk_index
    } else {
      quarantineCandidates.push(o); // not in any canonical Postgres population
    }
  }

  await pool.end().catch(() => {});

  // ── Print summary ────────────────────────────────────────────────────────────
  console.log('=== Classification Results ===');
  console.log(`  DIRECTORY_CLUSTER:      ${buckets.DIRECTORY_CLUSTER.length}  (out of sync scope)`);
  console.log(`  EXACT_MATCH:            ${buckets.EXACT_MATCH.length}`);
  console.log(`  ID_MATCH_NO_SOURCE_REF: ${buckets.ID_MATCH_NO_SOURCE_REF.length}  (payload backfill needed)`);
  console.log(`  SOURCE_REF_MISMATCH:    ${buckets.SOURCE_REF_MISMATCH.length}  (investigate)`);
  console.log(`  PAYLOAD_INCOMPLETE:     ${buckets.PAYLOAD_INCOMPLETE.length}  (backfill packet_key, do NOT delete)`);
  console.log(`  ORPHAN_NO_PG_ROW:       ${buckets.ORPHAN_NO_PG_ROW.length}  total`);
  console.log(`    ├─ atlas_only orphans: ${atlasOnlyOrphans.length}  (in atlas_packets but not codebase_chunk_index)`);
  console.log(`    └─ quarantine cands:  ${quarantineCandidates.length}  (not in any canonical Postgres population)`);
  console.log('');
  console.log('=== Safe Actions ===');
  console.log(`  BACKFILL source_ref:    ${buckets.ID_MATCH_NO_SOURCE_REF.length} points`);
  console.log(`  BACKFILL packet_key:    ${buckets.PAYLOAD_INCOMPLETE.length} points`);
  console.log(`  INVESTIGATE mismatch:   ${buckets.SOURCE_REF_MISMATCH.length} points`);
  console.log(`  QUARANTINE candidates:  ${quarantineCandidates.length} points (review before delete)`);
  console.log(`  NO_ACTION (exact):      ${buckets.EXACT_MATCH.length} points`);
  console.log('');

  // Show sample quarantine candidates
  if (quarantineCandidates.length > 0 && VERBOSE) {
    console.log('Sample quarantine candidates (first 10):');
    for (const c of quarantineCandidates.slice(0, 10)) {
      console.log(`  id=${c.id} source_ref=${c.source_ref ?? 'MISSING'} packet_key=${c.packet_key ?? 'MISSING'}`);
    }
    console.log('');
  }

  if (buckets.SOURCE_REF_MISMATCH.length > 0 && VERBOSE) {
    console.log('Sample source_ref mismatches (first 5):');
    for (const m of buckets.SOURCE_REF_MISMATCH.slice(0, 5)) {
      console.log(`  id=${m.id}`);
      console.log(`    qdrant: ${m.qdrant_source_ref}`);
      console.log(`    pg:     ${m.pg_relative_path}`);
    }
    console.log('');
  }

  const report = {
    run_at: new Date().toISOString(),
    collection: QDRANT_COLLECTION,
    total_points: qdrantPoints.length,
    pg_rows_with_qdrant_id: pgRows.rows.length,
    classification: {
      directory_cluster: buckets.DIRECTORY_CLUSTER.length,
      exact_match: buckets.EXACT_MATCH.length,
      id_match_no_source_ref: buckets.ID_MATCH_NO_SOURCE_REF.length,
      source_ref_mismatch: buckets.SOURCE_REF_MISMATCH.length,
      payload_incomplete: buckets.PAYLOAD_INCOMPLETE.length,
      orphan_no_pg_row: buckets.ORPHAN_NO_PG_ROW.length,
    },
    safe_actions: {
      backfill_source_ref: buckets.ID_MATCH_NO_SOURCE_REF.length,
      backfill_packet_key: buckets.PAYLOAD_INCOMPLETE.length,
      investigate_mismatch: buckets.SOURCE_REF_MISMATCH.length,
      quarantine_candidates: quarantineCandidates.length,
      atlas_only_orphans: atlasOnlyOrphans.length,
      no_action_exact: buckets.EXACT_MATCH.length,
    },
    samples: {
      source_ref_mismatch: buckets.SOURCE_REF_MISMATCH.slice(0, 20),
      quarantine_candidates: quarantineCandidates.slice(0, 20),
      atlas_only_orphans: atlasOnlyOrphans.slice(0, 20),
      payload_incomplete: buckets.PAYLOAD_INCOMPLETE.slice(0, 20),
    },
  };

  if (JSON_OUT) {
    const outPath = join(dirname(fileURLToPath(import.meta.url)), '../../docs/reports/qdrant-point-reconciliation.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('JSON report: docs/reports/qdrant-point-reconciliation.json');
  }

  const healthyRate = buckets.EXACT_MATCH.length / (qdrantPoints.length - buckets.DIRECTORY_CLUSTER.length);
  console.log(`Identity health: ${(healthyRate * 100).toFixed(1)}% exact match (non-cluster points)`);
  console.log(quarantineCandidates.length === 0 ? '✅ No quarantine candidates' : `⚠ ${quarantineCandidates.length} quarantine candidates — review before any deletion`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
