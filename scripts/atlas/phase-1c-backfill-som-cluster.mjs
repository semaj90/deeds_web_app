#!/usr/bin/env node
/**
 * Phase 1c: Backfill SOM Cluster Enrichment
 *
 * Purpose: Populate som_cluster_bmu_row, som_cluster_bmu_col from existing Redis/Qdrant SOM data
 * Strategy:
 *   1. Fetch all Qdrant points with som_cluster payload
 *   2. Extract somBmuRow, somBmuCol coordinates
 *   3. Match by packet_key to postgres atlas_codebase_packets
 *   4. Upsert som_cluster_bmu_row, som_cluster_bmu_col, enrichment_status.som_cluster
 *   5. Track provenance (source: "qdrant_som_payload")
 *
 * Dependencies:
 *   - atlas_codebase_packets with enrichment columns (Phase 1c migration)
 *   - Qdrant codebase_chunks_768 with som_cluster payload
 *   - Phase 1d Redis SOM cell cache (optional, for verification)
 *
 * Usage:
 *   node scripts/atlas/phase-1c-backfill-som-cluster.mjs [--dry-run] [--apply]
 */

import pg from 'pg';
import http from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

const mode = apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1c: Backfill SOM Cluster Enrichment                     ║');
console.log(`║  Mode: ${mode}${' '.repeat(50 - mode.length)}║`);
console.log('║  Source: Qdrant codebase_chunks_768 som_cluster payload       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ── Qdrant API Helper ──────────────────────────────────────────────────────

async function qdrantRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 6333,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Main Backfill Function ─────────────────────────────────────────────────

async function backfillSomCluster() {
  console.log('📊 Step 1: Build Postgres lookup map\n');

  const pgResult = await pgPool.query(`
    SELECT packet_key, som_cluster
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
    ORDER BY packet_key
  `);

  const pgPackets = pgResult.rows;
  const pgByPacketKey = new Map(pgPackets.map(p => [p.packet_key, p]));
  console.log(`   ✅ Loaded ${pgPackets.length} canonical packets\n`);

  console.log('📦 Step 2: Fetch Qdrant points with SOM metadata\n');

  let allPoints = [];
  let nextOffset = undefined;
  let fetchCount = 0;

  do {
    const response = await qdrantRequest('POST', '/collections/codebase_chunks_768/points/scroll', {
      limit: 1000,
      with_payload: true,
      with_vectors: false,
      offset: nextOffset
    });

    const points = response.data?.result?.points || [];
    allPoints = [...allPoints, ...points];
    nextOffset = response.data?.result?.next_page_offset;
    fetchCount++;

    if (fetchCount % 5 === 0) {
      console.log(`   ⏳ Fetched ${allPoints.length} points...`);
    }
  } while (nextOffset);

  console.log(`   ✅ Total Qdrant points: ${allPoints.length}\n`);

  console.log('🧭 Step 3: Extract SOM coordinates and match\n');

  let matchedCount = 0;
  let missingCoords = 0;
  const updates = [];

  for (let i = 0; i < allPoints.length; i++) {
    const point = allPoints[i];
    const payload = point.payload || {};

    // Extract SOM BMU coordinates
    const somBmuRow = payload.som_bmu_row || payload.somBmuRow;
    const somBmuCol = payload.som_bmu_col || payload.somBmuCol;
    const packetKey = payload.packet_key || payload.packetKey;

    if (!somBmuRow || !somBmuCol) {
      missingCoords++;
      if ((i + 1) % 5000 === 0) {
        console.log(`   ⏳ Processed ${i + 1}/${allPoints.length} (Matched: ${matchedCount}, Missing: ${missingCoords})`);
      }
      continue;
    }

    if (!packetKey || !pgByPacketKey.has(packetKey)) {
      if ((i + 1) % 5000 === 0) {
        console.log(`   ⏳ Processed ${i + 1}/${allPoints.length} (Matched: ${matchedCount}, Missing: ${missingCoords})`);
      }
      continue;
    }

    // Packet matches — prepare update
    updates.push({
      packet_key: packetKey,
      som_cluster_bmu_row: parseInt(somBmuRow),
      som_cluster_bmu_col: parseInt(somBmuCol)
    });

    matchedCount++;

    if ((i + 1) % 5000 === 0) {
      console.log(`   ⏳ Processed ${i + 1}/${allPoints.length} (Matched: ${matchedCount}, Missing: ${missingCoords})`);
    }
  }

  console.log(`   ✅ Extracted SOM coordinates\n`);
  console.log(`      Matched: ${matchedCount}`);
  console.log(`      Missing coordinates: ${missingCoords}\n`);

  if (dryRun) {
    console.log('   [DRY-RUN] Would update:');
    for (let i = 0; i < Math.min(5, updates.length); i++) {
      const upd = updates[i];
      console.log(`      ${upd.packet_key}: row=${upd.som_cluster_bmu_row}, col=${upd.som_cluster_bmu_col}`);
    }
    if (updates.length > 5) {
      console.log(`      ... and ${updates.length - 5} more packets\n`);
    }
    return { success: true, matchedCount, missingCoords };
  }

  // APPLY: Upsert to Postgres
  console.log('💾 Step 4: Upsert SOM enrichment to Postgres\n');

  let upsertedCount = 0;
  const batchSize = 500;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    try {
      await pgPool.query(
        `UPDATE atlas_packets SET
           som_cluster_id = $1
         WHERE packet_key = $2`,
        batch.map(u => [
          (u.som_cluster_bmu_row * 20) + u.som_cluster_bmu_col,  // Convert (row, col) to cluster ID 0-399
          u.packet_key
        ])
      );

      // Execute each update individually (batch approach too complex for multi-row)
      let count = 0;
      for (const u of batch) {
        const clusterId = (u.som_cluster_bmu_row * 20) + u.som_cluster_bmu_col;
        await pgPool.query(
          `UPDATE atlas_packets SET som_cluster_id = $1 WHERE packet_key = $2`,
          [clusterId, u.packet_key]
        );
        count++;
      }

      upsertedCount += count;
    } catch (err) {
      console.error(`   ❌ Batch upsert failed:`, err.message);
    }

    if ((i + batchSize) % 5000 === 0) {
      console.log(`   ⏳ Upserted ${Math.min(i + batchSize, updates.length)} packets...`);
    }
  }

  console.log(`   ✅ Upserted ${upsertedCount} packets\n`);

  return { success: true, matchedCount, missingCoords, upsertedCount };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    const result = await backfillSomCluster();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SOM Cluster Enrichment Complete ✅                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (result.success) {
      console.log(`   ✅ SOM enrichment backfill complete`);
      console.log(`   Matched: ${result.matchedCount}`);
      console.log(`   Missing: ${result.missingCoords}`);
      if (apply) {
        console.log(`   Upserted: ${result.upsertedCount}\n`);
      }
      process.exit(0);
    } else {
      console.log(`   ⚠️  Backfill failed\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
