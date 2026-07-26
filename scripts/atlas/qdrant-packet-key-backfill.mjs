#!/usr/bin/env node
/**
 * Qdrant packet_key payload backfill
 *
 * For each Qdrant point in codebase_chunks_768 that lacks a packet_key,
 * looks up the corresponding Postgres row by source_ref and populates
 * the payload field.
 *
 * Also reports orphaned points (in Qdrant with no Postgres counterpart)
 * for manual review before deletion.
 *
 * Usage:
 *   node scripts/atlas/qdrant-packet-key-backfill.mjs [--dry-run] [--verbose] [--limit N] [--json]
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1])
  : Infinity;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const BATCH_SIZE = 100;
const PG_BATCH = 500;

const PG_CONFIG = {
  host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5434'),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'legal_ai_db',
  user: process.env.PGUSER || process.env.DB_USER || 'legal_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'legal_password',
  connectionTimeoutMillis: 10000,
};

function log(...args) { if (VERBOSE) console.log(...args); }

async function scrollQdrantMissingPacketKey(callback) {
  let offset = null;
  let total = 0;
  let processed = 0;

  while (true) {
    const body = {
      limit: BATCH_SIZE,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ is_empty: { key: 'packet_key' } }],
        // Exclude directory-cluster summaries (they intentionally have no packet_key)
        must_not: [{ key: 'kind', match: { value: 'directory-cluster' } }],
      },
    };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];

    if (points.length === 0) break;

    await callback(points);
    processed += points.length;
    total += points.length;

    if (processed >= LIMIT) {
      console.log(`  Reached --limit=${LIMIT}, stopping scroll`);
      break;
    }

    offset = data.result?.next_page_offset;
    if (!offset) break;
  }

  return total;
}

function normalizeToSourceRef(payload) {
  // Current schema uses source_ref (e.g. "sveltekit-frontend/src/...")
  if (payload.source_ref) return payload.source_ref;
  // Older graphify points use relative_path (e.g. "src/..." relative to sveltekit-frontend/)
  if (payload.relative_path) {
    const rp = payload.relative_path;
    if (rp.startsWith('src/') || rp.startsWith('scripts/') || rp.startsWith('static/')) {
      return `sveltekit-frontend/${rp}`;
    }
    return rp;
  }
  return null;
}

async function lookupPacketKeys(pool, sourceRefs) {
  if (!sourceRefs.length) return new Map();

  // Try codebase_chunk_index first (canonical for code chunks)
  const maps = new Map();

  try {
    const r = await pool.query(
      `SELECT source_ref, id::text AS chunk_id
       FROM codebase_chunk_index
       WHERE source_ref = ANY($1)`,
      [sourceRefs]
    );
    for (const row of r.rows) {
      maps.set(row.source_ref, { chunk_id: row.chunk_id, packet_key: null });
    }
  } catch (e) {
    log(`  codebase_chunk_index lookup failed: ${e.message}`);
  }

  // Look up packet_key from atlas_packets
  try {
    const r = await pool.query(
      `SELECT source_ref, packet_key
       FROM atlas_packets
       WHERE source_ref = ANY($1) AND packet_key IS NOT NULL`,
      [sourceRefs]
    );
    for (const row of r.rows) {
      const existing = maps.get(row.source_ref) || {};
      maps.set(row.source_ref, { ...existing, packet_key: row.packet_key });
    }
  } catch (e) {
    log(`  atlas_packets lookup failed: ${e.message}`);
  }

  return maps;
}

async function updateQdrantPayload(pointId, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      points: [pointId],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant payload update failed for ${pointId}: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.result?.status === 'acknowledged';
}

async function main() {
  const stats = {
    total_scanned: 0,
    matched: 0,
    updated: 0,
    orphaned: 0,
    no_source_ref: 0,
    errors: 0,
    orphaned_points: [],
  };

  console.log(`=== Qdrant packet_key backfill — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  if (LIMIT !== Infinity) console.log(`Limit: ${LIMIT} points`);
  console.log('');

  const pool = new pg.Pool(PG_CONFIG);

  // Buffer points in batches to reduce Postgres round trips
  let buffer = [];

  const processBatch = async (points) => {
    buffer.push(...points);
    if (buffer.length < PG_BATCH && points.length === BATCH_SIZE) return;

    const batch = buffer.splice(0, buffer.length);
    // Normalize source_ref from relative_path if needed
    for (const p of batch) {
      if (!p.payload) p.payload = {};
      if (!p.payload.source_ref && p.payload.relative_path) {
        p.payload._normalized_source_ref = normalizeToSourceRef(p.payload);
      } else {
        p.payload._normalized_source_ref = p.payload.source_ref || null;
      }
    }

    const withSourceRef = batch.filter(p => p.payload._normalized_source_ref);
    const withoutSourceRef = batch.filter(p => !p.payload._normalized_source_ref);

    stats.no_source_ref += withoutSourceRef.length;
    if (withoutSourceRef.length > 0) {
      log(`  ${withoutSourceRef.length} points without source_ref — cannot backfill`);
    }

    const sourceRefs = withSourceRef.map(p => p.payload._normalized_source_ref);
    const pgMap = await lookupPacketKeys(pool, sourceRefs);

    for (const point of withSourceRef) {
      const lookup = pgMap.get(point.payload._normalized_source_ref);

      if (!lookup?.packet_key) {
        stats.orphaned++;
        if (stats.orphaned_points.length < 20) {
          stats.orphaned_points.push({ id: point.id, source_ref: point.payload._normalized_source_ref });
        }
        log(`  Orphaned: id=${point.id} source_ref=${point.payload.source_ref}`);
        continue;
      }

      stats.matched++;

      const newPayload = { packet_key: lookup.packet_key };
      if (lookup.chunk_id) newPayload.chunk_id = lookup.chunk_id;
      // Also backfill source_ref if it was missing (normalized from relative_path)
      if (!point.payload.source_ref && point.payload._normalized_source_ref) {
        newPayload.source_ref = point.payload._normalized_source_ref;
      }

      if (!DRY_RUN) {
        try {
          await updateQdrantPayload(point.id, newPayload);
          stats.updated++;
          log(`  Updated id=${point.id} → packet_key=${lookup.packet_key}`);
        } catch (e) {
          stats.errors++;
          console.error(`  Error updating id=${point.id}: ${e.message}`);
        }
      } else {
        stats.updated++;
        log(`  [dry-run] Would update id=${point.id} → packet_key=${lookup.packet_key}`);
      }
    }

    const total = stats.matched + stats.orphaned + stats.no_source_ref;
    if (total % 1000 < batch.length) {
      console.log(`  Progress: ${total} processed (matched: ${stats.matched}, orphaned: ${stats.orphaned}, no-ref: ${stats.no_source_ref}, updated: ${stats.updated})`);
    }
  };

  try {
    stats.total_scanned = await scrollQdrantMissingPacketKey(processBatch);
    // Flush remaining buffer
    if (buffer.length > 0) await processBatch([]);
  } catch (e) {
    console.error(`Fatal scroll error: ${e.message}`);
  }

  await pool.end().catch(() => {});

  console.log('');
  console.log('=== Results ===');
  console.log(`  Total scanned:    ${stats.total_scanned}`);
  console.log(`  Matched to PG:    ${stats.matched}`);
  console.log(`  Updated:          ${stats.updated}${DRY_RUN ? ' (dry-run, not applied)' : ''}`);
  console.log(`  Orphaned (no PG): ${stats.orphaned}`);
  console.log(`  No source_ref:    ${stats.no_source_ref}`);
  console.log(`  Errors:           ${stats.errors}`);

  if (stats.orphaned_points.length > 0) {
    console.log('\nFirst orphaned points (max 20):');
    stats.orphaned_points.forEach(p => console.log(`  id=${p.id} source_ref=${p.source_ref}`));
  }

  if (JSON_OUT) {
    const outPath = join(dirname(fileURLToPath(import.meta.url)), '../../docs/reports/qdrant-packet-key-backfill.json');
    writeFileSync(outPath, JSON.stringify({ ...stats, run_at: new Date().toISOString(), dry_run: DRY_RUN }, null, 2));
    console.log(`\nJSON report: docs/reports/qdrant-packet-key-backfill.json`);
  }

  const successRate = stats.total_scanned > 0 ? stats.matched / stats.total_scanned : 0;
  console.log(`\nMatch rate: ${(successRate * 100).toFixed(1)}%`);
  console.log(stats.errors === 0 && successRate > 0 ? '✅ Backfill complete' : '⚠ Backfill done with issues');

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
