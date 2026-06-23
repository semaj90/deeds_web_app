#!/usr/bin/env node
/**
 * P3g Join Repair: Sync 154 packets with Qdrant payload to Postgres qdrant_point_id
 *
 * These packets already exist in Qdrant (have payload) but Postgres is missing:
 * - qdrant_point_id (the numeric ID from Qdrant)
 * - qdrant_collection (which Qdrant collection they live in)
 *
 * Strategy: Query Qdrant for these packets, extract their point IDs, then
 * UPDATE Postgres to populate the missing fields.
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as fs from 'fs';

const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db';
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost';
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333', 10);

const pool = new Pool({ connectionString: DB_URL });
const qdrant = new QdrantClient({ host: QDRANT_HOST, port: QDRANT_PORT });

let repaired = 0;
let failed = 0;
let skipped = 0;

async function getPayloadMatchCandidates() {
  console.log('📋 Querying packets with Qdrant payload but missing qdrant_point_id...');

  const result = await pool.query(`
    SELECT
      packet_id,
      packet_key,
      source_ref,
      feature_id,
      payload
    FROM atlas_packets
    WHERE qdrant_point_id IS NULL
      AND payload IS NOT NULL
      AND payload != '{}'::jsonb
    LIMIT 200
  `);

  console.log(`Found ${result.rows.length} candidates for join repair`);
  return result.rows;
}

async function findPointIdInQdrant(packet) {
  const { packet_key, source_ref, feature_id, payload } = packet;

  try {
    // Try exact match on packet_key in payload
    if (payload?.packet_key === packet_key) {
      // If Qdrant search metadata includes the point_id, use it
      // For now, we'll do a scroll through the collection to find it
      // This is slow but ensures correctness

      // Determine which collection (prefer codebase_chunks_768 as primary)
      const collections = ['codebase_chunks_768', 'evidence_items', 'legal_documents'];

      for (const collection of collections) {
        try {
          // Scroll with a filter on payload
          const scrollResult = await qdrant.scroll(collection, {
            filter: {
              must: [
                {
                  field: 'payload.packet_key',
                  match: { value: packet_key }
                }
              ]
            },
            limit: 1,
            with_payload: true,
            with_vectors: false
          });

          if (scrollResult.points && scrollResult.points.length > 0) {
            const point = scrollResult.points[0];
            return {
              qdrant_point_id: point.id,
              qdrant_collection: collection,
              payload: point.payload
            };
          }
        } catch (err) {
          // Collection might not exist or filter failed, continue
          continue;
        }
      }
    }

    return null;
  } catch (err) {
    console.error(`  ⚠️  Error searching Qdrant for ${packet_key}:`, err.message);
    return null;
  }
}

async function syncPacket(packet) {
  const { packet_id, packet_key } = packet;

  const match = await findPointIdInQdrant(packet);

  if (!match) {
    skipped++;
    return false;
  }

  try {
    await pool.query(
      `UPDATE atlas_packets
       SET qdrant_point_id = $1, qdrant_collection = $2
       WHERE packet_id = $3`,
      [match.qdrant_point_id, match.qdrant_collection, packet_id]
    );

    repaired++;
    console.log(`  ✅ ${packet_key} → point ${match.qdrant_point_id} (${match.qdrant_collection})`);
    return true;
  } catch (err) {
    failed++;
    console.error(`  ❌ Failed to update ${packet_key}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('🔧 P3g JOIN REPAIR: Qdrant payload ↔ Postgres qdrant_point_id sync\n');

  const candidates = await getPayloadMatchCandidates();

  if (candidates.length === 0) {
    console.log('✅ No candidates found. Join is clean.');
    process.exit(0);
  }

  console.log(`\n⚙️  Repairing ${candidates.length} packets...\n`);

  for (const packet of candidates) {
    await syncPacket(packet);
  }

  console.log(`\n📊 RESULTS:`);
  console.log(`  ✅ Repaired: ${repaired}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    repaired,
    failed,
    skipped,
    total: candidates.length
  };

  fs.writeFileSync('docs/reports/p3g-join-repair-results.json', JSON.stringify(report, null, 2));
  console.log(`\n📝 Report: docs/reports/p3g-join-repair-results.json`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
