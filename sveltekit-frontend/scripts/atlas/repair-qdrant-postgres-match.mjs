#!/usr/bin/env node
/**
 * P3g Join Repair: Sync 154 packets where Qdrant payload exists but Postgres qdrant_point_id is NULL
 *
 * These packets already have embeddings in Qdrant (via prior ingestion or external source).
 * Just need to populate atlas_packets.qdrant_point_id by matching packet_key.
 *
 * Usage:
 *   node scripts/atlas/repair-qdrant-postgres-match.mjs --dry-run
 *   node scripts/atlas/repair-qdrant-postgres-match.mjs --apply
 */

import { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

await loadAtlasEnv();

const PG_URL = process.env.DATABASE_URL;
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });
const qdrant = new QdrantClient({ url: QDRANT_URL });

async function main() {
  console.log('P3g Join Repair: Qdrant Payload ↔ Postgres Sync');
  console.log('  Mode:', DRY_RUN ? 'DRY_RUN' : 'APPLY');
  console.log();

  const client = await pool.connect();
  try {
    // ── Before Report ─────────────────────────────────────────────────
    console.log('📊 Before Repair:');
    const before = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
        COUNT(*) as total
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);
    console.log(`  atlas_packets: ${before.rows[0].with_qdrant}/${before.rows[0].total} with qdrant_point_id`);
    console.log();

    // ── Fetch Qdrant payload matches ──────────────────────────────────
    console.log('🔍 Scanning Qdrant for payload matches...');
    const matches = new Map();
    let pointCount = 0;

    try {
      let nextOffset = 0;
      let hasMore = true;

      while (hasMore) {
        const scrollRes = await qdrant.scroll(QDRANT_COLLECTION, {
          limit: 1000,
          offset: nextOffset,
          with_payload: true
        });

        for (const point of scrollRes.points ?? []) {
          pointCount++;
          if (point.payload?.packet_key && !point.payload.packet_key.includes(':')) {
            // Valid vector packet_key (not a stub)
            const key = point.payload.packet_key;
            if (!matches.has(key)) {
              matches.set(key, {
                qdrant_point_id: point.id,
                qdrant_collection: QDRANT_COLLECTION,
                qdrant_vector_dim: 768
              });
            }
          }
        }

        hasMore = scrollRes.points?.length === 1000;
        nextOffset += 1000;
      }
    } catch (err) {
      console.error('❌ Failed to scan Qdrant:', err.message);
      process.exit(1);
    }

    console.log(`  Scanned ${pointCount} Qdrant points`);
    console.log(`  Found ${matches.size} packet_key matches`);
    console.log();

    // ── Find Postgres packets with matching packet_key but NULL qdrant_point_id ──
    console.log('🔍 Finding Postgres packets with matching payload...');
    const repairablePkgRes = await client.query(`
      SELECT p.packet_id, p.packet_key
      FROM atlas_packets p
      WHERE p.qdrant_point_id IS NULL
        AND p.packet_key IS NOT NULL
      ORDER BY p.packet_id
      LIMIT 20000
    `);

    const repainable = repairablePkgRes.rows.filter(row => matches.has(row.packet_key));
    console.log(`  Found ${repainable.length} Postgres packets with Qdrant payload matches`);
    console.log();

    if (repainable.length === 0) {
      console.log('✅ No payload matches found (all synced or no duplicates)');
      await client.release();
      await pool.end();
      return;
    }

    if (DRY_RUN) {
      console.log('✅ [DRY_RUN] Would update:');
      console.log(`  ${repainable.length} rows in atlas_packets`);
      console.log(`  Copy qdrant_point_id from Qdrant payload`);
      console.log();
      console.log('To apply: node scripts/atlas/repair-qdrant-postgres-match.mjs --apply');
      await client.release();
      await pool.end();
      return;
    }

    // ── Apply repairs ─────────────────────────────────────────────────
    console.log('⚙️  Applying payload match repairs...');
    await client.query('BEGIN');

    let updated = 0;
    for (const packet of repainable) {
      const match = matches.get(packet.packet_key);
      const res = await client.query(
        `UPDATE atlas_packets SET
           qdrant_point_id = $1,
           qdrant_collection = $2,
           qdrant_vector_dim = $3,
           identity_lane = 'qdrant_chunk',
           updated_at = now()
         WHERE packet_key = $4`,
        [match.qdrant_point_id, match.qdrant_collection, match.qdrant_vector_dim, packet.packet_key]
      );
      updated += res.rowCount;
    }

    await client.query('COMMIT');
    console.log(`✅ Updated ${updated} rows`);
    console.log();

    // ── After Report ──────────────────────────────────────────────────
    console.log('📊 After Repair:');
    const after = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
        COUNT(*) as total
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);
    const delta = after.rows[0].with_qdrant - before.rows[0].with_qdrant;

    console.log(`  atlas_packets: ${after.rows[0].with_qdrant}/${after.rows[0].total} with qdrant_point_id`);
    console.log(`  Coverage improved: +${delta}`);
    console.log();
    console.log('✅ Payload match repairs complete');

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
