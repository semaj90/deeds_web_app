#!/usr/bin/env node
/**
 * backfill-neo4j-qdrant-id.mjs
 *
 * Sync qdrant_point_id from Postgres atlas_packets to Neo4j Packet nodes.
 *
 * Issue: Neo4j Packet nodes (8,804) exist but have 0% qdrant_id property.
 * Root cause: Initial sync script never ran or failed silently.
 *
 * Strategy:
 *   1. Query Postgres for packet_key → qdrant_point_id mapping
 *   2. For each batch, MATCH Neo4j Packet by packet_key
 *   3. SET p.qdrant_id = qdrant_point_id
 *   4. Verify coverage after backfill
 *
 * Usage:
 *   node scripts/atlas/backfill-neo4j-qdrant-id.mjs --dry-run
 *   node scripts/atlas/backfill-neo4j-qdrant-id.mjs --apply [--batch=100]
 *   node scripts/atlas/backfill-neo4j-qdrant-id.mjs --verify
 */

import pg from 'pg';
import fetch from 'node-fetch';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');
const BATCH_SIZE = parseInt(
  process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '100',
  10
);

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL = process.env.NEO4J_URL || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

function log(...args) { console.log(...args); }

async function fetchNeo4jTx(statement, parameters = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.results[0]?.data || [];
}

async function main() {
  log('\n🔧 Backfill Neo4j qdrant_id from Postgres\n');

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

  try {
    // Step 1: Get mappings from Postgres
    log('Step 1: Fetching packet_key → qdrant_point_id mappings from Postgres...\n');

    const result = await pool.query(`
      SELECT packet_key, qdrant_point_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY packet_key
    `);

    const packets = result.rows || result;
    const mappings = packets.filter(p => p.qdrant_point_id);

    log(`  ✓ Found ${mappings.length} packets with qdrant_point_id (${packets.length} total)`);
    log(`  ✓ Coverage: ${(mappings.length / packets.length * 100).toFixed(1)}%\n`);

    if (mappings.length === 0) {
      log(`  ⚠️  No packets have qdrant_point_id set. Check Postgres schema.\n`);
      return;
    }

    // Step 2: Backfill in batches using UNWIND for bulk SET
    if (APPLY || DRY_RUN) {
      log(`Step 2: Backfilling Neo4j Packet nodes (${BATCH_SIZE} per batch)...\n`);

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
        const batch = mappings.slice(i, i + BATCH_SIZE);

        if (APPLY) {
          try {
            // Use UNWIND to iterate through mappings and SET each one
            const mappingList = batch.map(row => ({
              packet_key: row.packet_key,
              qdrant_point_id: row.qdrant_point_id,
            }));

            const cypher = `
              UNWIND $mappings AS mapping
              MATCH (p:Packet {packet_key: mapping.packet_key})
              SET p.qdrant_id = mapping.qdrant_point_id
              RETURN count(p) as updated
            `;

            const result = await fetchNeo4jTx(cypher, { mappings: mappingList });
            const batchUpdated = result[0]?.row?.[0] || 0;

            updated += batchUpdated;
            log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mappings.length / BATCH_SIZE)}: ${batchUpdated} updated`);
          } catch (e) {
            log(`  ✗ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${e.message}`);
            failed++;
          }
        } else {
          // For dry-run, show what would be processed
          log(`  [DRY-RUN] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} packet_keys`);
          updated += batch.length;
        }
      }

      log(`\n  ✓ Backfill complete: ${updated} nodes updated, ${failed} batches failed\n`);
    }

    // Step 3: Verify
    log('Step 3: Verifying backfill coverage...\n');

    const verifyResult = await fetchNeo4jTx(
      'MATCH (p:Packet) RETURN count(p) as total, sum(CASE WHEN p.qdrant_id IS NOT NULL THEN 1 ELSE 0 END) as with_id'
    );

    const [total, withId] = verifyResult[0]?.row || [0, 0];
    const coverage = (withId / total * 100).toFixed(1);

    log(`  Packet nodes with qdrant_id: ${withId}/${total} (${coverage}%)`);

    if (coverage === '100.0') {
      log(`  ✅ VERIFIED: All Packet nodes now have qdrant_id\n`);
    } else if (coverage > '50') {
      log(`  ⚠️  PARTIAL: ${coverage}% coverage — some packets still missing qdrant_id\n`);
    } else {
      log(`  ✗ LOW COVERAGE: ${coverage}% — backfill may have failed\n`);
    }

  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error(`❌ Fatal: ${e.message}`);
  process.exit(1);
});
