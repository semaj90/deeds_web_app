#!/usr/bin/env node
/**
 * Link Postgres packets to their Qdrant point IDs
 *
 * Purpose:
 *   Updates atlas_packets.qdrant_point_id from Qdrant payload packet_key matches.
 *
 * Usage:
 *   node scripts/atlas/link-postgres-to-qdrant.mjs [--apply]
 */

import pg from 'pg';
import fetch from 'node-fetch';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DRY_RUN = !APPLY;

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'codebase_chunks_768';

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });

function log(...args) { console.log(...args); }

async function getPacketsWithoutQdrantId() {
  const result = await db.query(`
    SELECT packet_key FROM atlas_packets
    WHERE embedding IS NOT NULL AND qdrant_point_id IS NULL
    LIMIT 1000
  `);
  return result.rows.map(r => r.packet_key);
}

async function searchQdrantByPacketKey(packetKey) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'packet_key', match: { value: packetKey } }
          ]
        },
        limit: 1,
        with_payload: true
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const points = data.result?.points || [];
    if (points.length > 0) {
      return points[0].id;
    }
    return null;
  } catch (e) {
    console.error(`Error searching Qdrant: ${e.message}`);
    return null;
  }
}

async function updatePostgresWithQdrantId(packetKey, qdrantPointId) {
  await db.query(
    'UPDATE atlas_packets SET qdrant_point_id = $1, updated_at = now() WHERE packet_key = $2',
    [String(qdrantPointId), packetKey]
  );
}

async function linkPackets() {
  log(`\n═══ Link Postgres → Qdrant Point IDs ═══\n`);

  try {
    // Get packets without Qdrant IDs
    log(`1. Finding packets without Qdrant IDs...`);
    const packetKeys = await getPacketsWithoutQdrantId();
    log(`   ✅ Found ${packetKeys.length} packets to link`);

    if (packetKeys.length === 0) {
      log(`   All packets already linked.`);
      process.exit(0);
    }

    // Search Qdrant and update Postgres
    if (APPLY) {
      log(`\n2. Searching Qdrant and updating Postgres...`);
      let linked = 0;

      for (const packetKey of packetKeys) {
        const qdrantId = await searchQdrantByPacketKey(packetKey);
        if (qdrantId !== null) {
          await updatePostgresWithQdrantId(packetKey, qdrantId);
          linked++;
        }

        if (linked % 10 === 0) {
          process.stdout.write(`\r   Linked ${linked}/${packetKeys.length}`);
        }
      }

      process.stdout.write('\n');
      log(`   ✅ Linked: ${linked} packets`);
    } else {
      log(`   [Dry-run] Would link ${packetKeys.length} packets`);
    }

    // Verify
    log(`\n3. Verifying link...`);
    const verify = await db.query(
      'SELECT COUNT(*) FROM atlas_packets WHERE embedding IS NOT NULL AND qdrant_point_id IS NOT NULL'
    );
    const linked = parseInt(verify.rows[0].count);
    const total = await db.query(
      'SELECT COUNT(*) FROM atlas_packets WHERE embedding IS NOT NULL'
    );
    const totalEmbed = parseInt(total.rows[0].count);

    log(`   Linked: ${linked}/${totalEmbed}`);

    log(`\n✨ Done.`);
    process.exit(0);
  } catch (e) {
    log(`❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    await db.end();
  }
}

linkPackets();