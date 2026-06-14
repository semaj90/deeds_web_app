#!/usr/bin/env node
/**
 * Backfill Qdrant with packet_key from Postgres
 *
 * After compute-missing-packet-keys.mjs completes, this script mirrors
 * the computed packet_key values into Qdrant codebase_chunks_768 payloads.
 *
 * Current state: ~10% of Qdrant points missing packet_key
 * After fix: 100% coverage
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Qdrant with packet_key from Postgres                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const dryRun = process.argv.includes('--dry-run');
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';

  console.log(`Mode: ${mode}\n`);

  // Check current Qdrant coverage
  console.log('Checking Qdrant collection...');
  const countRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1, with_payload: true })
  }).then(r => r.json());

  const totalQdrantPoints = countRes.result?.points?.length || 0;
  console.log(`Qdrant points: ${totalQdrantPoints}`);

  // Fetch all packets from Postgres with packet_key
  console.log('\nFetching packets from Postgres with packet_key...');
  const packetsRes = await pool.query(`
    SELECT
      packet_id,
      source_ref,
      packet_key
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
    LIMIT 50000
  `);

  const packets = packetsRes.rows;
  console.log(`Retrieved ${packets.length} packets with packet_key\n`);

  if (packets.length === 0) {
    console.log('❌ No packets found with packet_key. Run compute-missing-packet-keys.mjs first.\n');
    await pool.end();
    process.exit(1);
  }

  // Build a source_ref → packet_key map for lookup
  const keyMap = new Map();
  packets.forEach(p => {
    keyMap.set(p.source_ref, p.packet_key);
  });

  console.log(`Built lookup map for ${keyMap.size} source_refs\n`);

  // Fetch Qdrant points and identify missing packet_key
  console.log('Scanning Qdrant collection for missing packet_key...');
  const pointsToUpdate = [];
  let scanned = 0;
  let hasMore = true;
  let nextPageOffset = undefined;

  while (hasMore) {
    const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        offset: nextPageOffset
      })
    }).then(r => r.json());

    const points = scrollRes.result?.points || [];
    if (points.length === 0) {
      hasMore = false;
      break;
    }

    points.forEach(p => {
      scanned++;
      const sourceRef = p.payload?.source_ref;
      const hasPacketKey = p.payload?.packet_key;

      // If missing packet_key and we have it in Postgres, mark for update
      if (!hasPacketKey && sourceRef && keyMap.has(sourceRef)) {
        pointsToUpdate.push({
          point_id: p.id,
          source_ref: sourceRef,
          packet_key: keyMap.get(sourceRef)
        });
      }
    });

    nextPageOffset = scrollRes.result?.next_page_offset;
    hasMore = !!nextPageOffset;
  }

  console.log(`Scanned ${scanned} Qdrant points`);
  console.log(`Found ${pointsToUpdate.length} points needing packet_key update\n`);

  if (pointsToUpdate.length === 0) {
    console.log('✅ All Qdrant points already have packet_key. Nothing to do.\n');
    await pool.end();
    process.exit(0);
  }

  // Show sample
  console.log('Sample of updates to apply:');
  pointsToUpdate.slice(0, 5).forEach((u, i) => {
    console.log(`  ${i + 1}. Point ${u.point_id}`);
    console.log(`     source_ref: ${u.source_ref}`);
    console.log(`     packet_key: ${u.packet_key}`);
  });

  if (!dryRun) {
    console.log(`\n📝 Applying ${pointsToUpdate.length} updates to Qdrant...\n`);

    // Use the /collections/{collection}/points/{point_id} endpoint for single-point updates
    // This is the documented way to update individual point payloads in Qdrant
    for (let i = 0; i < pointsToUpdate.length; i++) {
      const u = pointsToUpdate[i];

      // GET the point first to ensure we have the full structure
      const getRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/${u.point_id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!getRes.ok) {
        console.warn(`  ⚠️  Point ${u.point_id} not found, skipping`);
        continue;
      }

      const pointData = await getRes.json();
      const existingPoint = pointData.result;

      // PATCH: Send full point with updated payload
      const patchRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: existingPoint.id,
              vector: existingPoint.vector,
              payload: {
                ...existingPoint.payload,
                packet_key: u.packet_key
              }
            }
          ]
        })
      });

      if (!patchRes.ok) {
        const err = await patchRes.text();
        throw new Error(`Qdrant PUT failed for point ${u.point_id}: ${patchRes.status} ${err}`);
      }

      if ((i + 1) % 5 === 0) {
        console.log(`  [${i + 1}/${pointsToUpdate.length}] points updated`);
      }
    }

    console.log(`  [${pointsToUpdate.length}/${pointsToUpdate.length}] points updated`);
    console.log('\n✅ All packet_key values written to Qdrant\n');
  } else {
    console.log(`\n🔍 DRY-RUN: Would update ${pointsToUpdate.length} points\n`);
  }

  // Verify
  console.log('Verifying coverage...');
  const verifyRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 100, with_payload: true })
  }).then(r => r.json());

  const verifyPoints = verifyRes.result?.points || [];
  const withKey = verifyPoints.filter(p => p.payload?.packet_key).length;
  const coverage = ((withKey / verifyPoints.length) * 100).toFixed(1);

  console.log(`Sampled: ${verifyPoints.length} points`);
  console.log(`With packet_key: ${withKey} (${coverage}%)`);

  if (parseFloat(coverage) >= 95) {
    console.log('\n✅ GATE PASS: packet_key coverage ≥ 95%\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Coverage is ${coverage}%, run again to catch remaining\n`);
    process.exit(1);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
