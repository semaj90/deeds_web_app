#!/usr/bin/env node
/**
 * Repair Qdrant ↔ Postgres join (atlas_packets.qdrant_point_id)
 *
 * P3 blocker: Many atlas_packets rows have NULL qdrant_point_id even though
 * atlas_higher_hop_index has the canonical qdrant_point_id.
 *
 * This script:
 * 1. Finds rows where atlas_packets.packet_key matches atlas_higher_hop_index
 * 2. Copies qdrant_point_id + collection from higher_hop_index
 * 3. Reports coverage before/after
 *
 * Per user guidance: First repair by join, only embed missing packets after.
 *
 * Usage:
 *   node scripts/atlas/repair-qdrant-postgres-join.mjs --dry-run
 *   node scripts/atlas/repair-qdrant-postgres-join.mjs --apply
 *   node scripts/atlas/repair-qdrant-postgres-join.mjs --verbose
 */

import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const VERBOSE = process.argv.includes('--verbose');

await loadAtlasEnv();
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

/**
 * Count packets with qdrant_point_id before repair.
 */
async function countBefore(client) {
  const res = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
      COUNT(*) as total
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
  `);
  return res.rows[0];
}

/**
 * Count potential join targets in higher_hop_index.
 */
async function countTargets(client) {
  const res = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant
    FROM atlas_higher_hop_index
    WHERE packet_key IS NOT NULL AND qdrant_point_id IS NOT NULL
  `);
  return res.rows[0];
}

/**
 * Count rows that would be updated.
 */
async function countUpdatable(client) {
  const res = await client.query(`
    SELECT COUNT(*) as count
    FROM atlas_packets p
    JOIN atlas_higher_hop_index h ON h.packet_key = p.packet_key
    WHERE p.packet_key IS NOT NULL
      AND p.qdrant_point_id IS NULL
      AND h.qdrant_point_id IS NOT NULL
  `);
  return res.rows[0].count;
}

/**
 * Perform the repair: copy qdrant_point_id from higher_hop_index.
 */
async function repairJoin(client) {
  const res = await client.query(`
    UPDATE atlas_packets p
    SET
      qdrant_point_id = h.qdrant_point_id,
      qdrant_collection = COALESCE(h.qdrant_collection, 'codebase_chunks_768'),
      qdrant_vector_dim = COALESCE(p.qdrant_vector_dim, 768),
      identity_lane = COALESCE(p.identity_lane, 'qdrant_chunk')
    FROM atlas_higher_hop_index h
    WHERE p.packet_key = h.packet_key
      AND p.packet_key IS NOT NULL
      AND p.qdrant_point_id IS NULL
      AND h.qdrant_point_id IS NOT NULL
  `);
  return res.rowCount;
}

/**
 * Report ambiguous packet_keys (would cause conflicts).
 */
async function reportAmbiguous(client) {
  const res = await client.query(`
    SELECT
      p.packet_key,
      COUNT(DISTINCT p.packet_id) as packet_count,
      COUNT(DISTINCT h.qdrant_point_id) as unique_points
    FROM atlas_packets p
    JOIN atlas_higher_hop_index h ON h.packet_key = p.packet_key
    WHERE p.packet_key IS NOT NULL
    GROUP BY p.packet_key
    HAVING COUNT(DISTINCT h.qdrant_point_id) > 1
  `);
  return res.rows;
}

async function main() {
  console.log('Repair Qdrant ↔ Postgres Join');
  console.log('  Mode:', DRY_RUN ? 'DRY_RUN' : 'APPLY');
  console.log();

  const client = await pool.connect();
  try {
    // ── Before Report ─────────────────────────────────────────────────
    console.log('📊 Before Repair:');
    const before = await countBefore(client);
    const targets = await countTargets(client);
    const updatable = await countUpdatable(client);

    console.log(`  atlas_packets: ${before.with_qdrant}/${before.total} with qdrant_point_id`);
    console.log(`  atlas_higher_hop_index: ${targets.with_qdrant}/${targets.total} with qdrant_point_id`);
    console.log(`  Repairable by join: ${updatable} rows`);
    console.log();

    // ── Ambiguity Check ───────────────────────────────────────────────
    const ambiguous = await reportAmbiguous(client);
    if (ambiguous.length > 0) {
      console.warn(`⚠️  ${ambiguous.length} packet_keys have ambiguous qdrant_point_id:`);
      for (const row of ambiguous.slice(0, 5)) {
        console.warn(
          `  ${row.packet_key}: ${row.packet_count} packets → ${row.unique_points} points`
        );
      }
      console.warn('  (Using COALESCE + first match; check for data corruption)');
      console.log();
    }

    // ── Dry Run ───────────────────────────────────────────────────────
    if (DRY_RUN) {
      console.log('✅ [DRY_RUN] Would update:');
      console.log(`  ${updatable} rows in atlas_packets`);
      console.log(`  New qdrant_point_id: copied from atlas_higher_hop_index`);
      console.log(`  New qdrant_collection: COALESCE(..., 'codebase_chunks_768')`);
      console.log(`  New qdrant_vector_dim: COALESCE(..., 768)`);
      console.log(`  New identity_lane: COALESCE(..., 'qdrant_chunk')`);
      console.log();
      console.log('To apply: node scripts/atlas/repair-qdrant-postgres-join.mjs --apply');
      return;
    }

    // ── Apply Repair ──────────────────────────────────────────────────
    console.log('⚙️  Applying repair...');
    await client.query('BEGIN');
    const updated = await repairJoin(client);
    await client.query('COMMIT');

    console.log(`✅ Updated ${updated} rows`);
    console.log();

    // ── After Report ──────────────────────────────────────────────────
    console.log('📊 After Repair:');
    const after = await countBefore(client);
    const delta = after.with_qdrant - before.with_qdrant;

    console.log(`  atlas_packets: ${after.with_qdrant}/${after.total} with qdrant_point_id`);
    console.log(`  Coverage improved: +${delta} (${((delta / after.total) * 100).toFixed(1)}%)`);
    console.log();

    const stillMissing = after.total - after.with_qdrant;
    if (stillMissing > 0) {
      console.log(`⚠️  Still missing: ${stillMissing} rows (no match in atlas_higher_hop_index)`);
      console.log('  → These need explicit Qdrant embedding (P3g lane)');
    } else {
      console.log('🎉 All packets have qdrant_point_id!');
    }
  } catch (err) {
    if (!DRY_RUN) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('[FAIL]', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
