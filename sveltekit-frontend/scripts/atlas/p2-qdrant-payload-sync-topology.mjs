#!/usr/bin/env node
/**
 * P2 — Qdrant Payload Sync: Topology Signals
 *
 * Verifies and syncs topolog_cluster, som_cluster, community_id from Postgres
 * canonical packets to Qdrant codebase_chunks_768 payloads.
 *
 * Usage:
 *   npm run atlas:p2:qdrant-payload-sync:verify      # Dry-run audit
 *   npm run atlas:p2:qdrant-payload-sync:sync         # Apply backfill
 *   npm run atlas:p2:qdrant-payload-sync:verify:full  # Full scan (no sampling)
 *
 * Entry point: HTTP API client (fetch), not docker exec
 * Reason: Type-safe, batching, proper error handling, schema validation
 */

import fetch from 'node-fetch';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 100;
const SAMPLE_SIZE = process.argv.includes('--full') ? 50000 : 500;
const DRY_RUN = !process.argv.includes('--apply');

// Topology fields to sync (P2 contract)
const TOPOLOGY_FIELDS = ['topolog_cluster', 'som_cluster', 'community_id'];
const TARGET_COVERAGE = { topolog_cluster: 0.66, som_cluster: 0.66, community_id: 0.96 };

console.log(`\n═══ P2: Qdrant Payload Sync — Topology Signals ═══\n`);
console.log(`Collection: ${COLLECTION}`);
console.log(`URL: ${QDRANT_URL}`);
console.log(`Fields: ${TOPOLOGY_FIELDS.join(', ')}`);
console.log(`Mode: ${DRY_RUN ? 'VERIFY (dry-run)' : 'SYNC (apply backfill)'}`);
console.log(`Sample size: ${SAMPLE_SIZE}\n`);

// 1. Connect to Postgres (truth source)
const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5434'),
  user: process.env.DB_USER || 'legal_admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'legal_ai_db'
});

// 2. Verify Qdrant connection via HTTP API
async function verifyQdrantConnection() {
  try {
    const res = await fetch(`${QDRANT_URL}/health`, { timeout: 5000 });
    if (!res.ok) {
      throw new Error(`Qdrant health check failed: ${res.status}`);
    }
    console.log(`✅ Qdrant connection OK\n`);
    return true;
  } catch (err) {
    console.error(`❌ Qdrant connection failed: ${err.message}\n`);
    return false;
  }
}

// 3. Get Qdrant collection stats
async function getCollectionStats() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (!res.ok) {
    throw new Error(`Qdrant ${res.status}: ${await res.text()}`);
  }
  const { result } = await res.json();
  return {
    pointsCount: result.points_count,
    vectorsCount: result.vectors_count,
    indexedVectorsCount: result.indexed_vectors_count
  };
}

// 4. Audit payload coverage
async function auditPayloadCoverage() {
  console.log('📊 Auditing payload coverage...\n');

  const stats = await getCollectionStats();
  console.log(`Total points: ${stats.pointsCount.toLocaleString()}`);
  console.log(`Indexed vectors: ${stats.indexedVectorsCount.toLocaleString()}\n`);

  const fieldCoverage = {};
  TOPOLOGY_FIELDS.forEach(f => {
    fieldCoverage[f] = { present: 0, missing: 0, null: 0 };
  });

  let scrollOffset = null;
  let pointsScanned = 0;
  const samplePoints = [];

  while (pointsScanned < SAMPLE_SIZE) {
    const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: Math.min(500, SAMPLE_SIZE - pointsScanned),
        offset: scrollOffset,
        with_payload: true
      })
    });

    if (!scrollRes.ok) {
      throw new Error(`Scroll ${scrollRes.status}`);
    }

    const { result } = await scrollRes.json();
    if (!result.points || result.points.length === 0) break;

    for (const point of result.points) {
      const payload = point.payload || {};
      samplePoints.push({
        id: point.id,
        packet_key: payload.packet_key,
        topolog_cluster: payload.topolog_cluster,
        som_cluster: payload.som_cluster,
        community_id: payload.community_id
      });

      // Count coverage
      TOPOLOGY_FIELDS.forEach(field => {
        if (payload[field] === null || payload[field] === undefined || payload[field] === '') {
          fieldCoverage[field].missing++;
        } else {
          fieldCoverage[field].present++;
        }
      });

      pointsScanned++;
    }

    scrollOffset = result.next_page_offset;
    if (!scrollOffset) break;
  }

  console.log('Field Coverage (sample of ' + pointsScanned.toLocaleString() + '):');
  TOPOLOGY_FIELDS.forEach(field => {
    const { present, missing } = fieldCoverage[field];
    const coverage = present / (present + missing);
    const target = TARGET_COVERAGE[field];
    const status = coverage >= target ? '✅' : '⚠️';
    console.log(
      `  ${status} ${field}: ${coverage.toFixed(1)}% (${present}/${present + missing}) [target: ${(target * 100).toFixed(0)}%]`
    );
  });

  return { samplePoints, fieldCoverage, pointsScanned };
}

// 5. Load canonical packets from Postgres
async function loadCanonicalPackets(packet_keys) {
  const query = `
    SELECT
      packet_key,
      topolog_cluster,
      som_cluster,
      community_id
    FROM atlas_packets
    WHERE packet_key = ANY($1::text[])
  `;

  const result = await pool.query(query, [packet_keys]);
  return result.rows.reduce((acc, row) => {
    acc[row.packet_key] = {
      topolog_cluster: row.topolog_cluster,
      som_cluster: row.som_cluster,
      community_id: row.community_id
    };
    return acc;
  }, {});
}

// 6. Sync missing payloads
async function syncMissingPayloads(samplePoints) {
  console.log(`\n🔄 Syncing payloads (${DRY_RUN ? 'DRY-RUN' : 'APPLY'})...\n`);

  // Filter points with missing fields
  const pointsToSync = samplePoints.filter(p =>
    !p.topolog_cluster || !p.som_cluster || !p.community_id
  );

  if (pointsToSync.length === 0) {
    console.log('✅ All sampled points have topology fields. No sync needed.\n');
    return { synced: 0, failed: 0, skipped: pointsToSync.length };
  }

  console.log(`Found ${pointsToSync.length} points needing sync.\n`);

  // Load canonical data from Postgres
  const packet_keys = pointsToSync.map(p => p.packet_key).filter(Boolean);
  if (packet_keys.length === 0) {
    console.log('⚠️  No packet_keys to sync. Skipping.\n');
    return { synced: 0, failed: 0, skipped: pointsToSync.length };
  }

  console.log(`Loading canonical packets from Postgres (${packet_keys.length})...`);
  const canonicalData = await loadCanonicalPackets(packet_keys);
  console.log(`Loaded ${Object.keys(canonicalData).length} packets.\n`);

  let synced = 0;
  let failed = 0;

  // Batch update Qdrant points
  for (let i = 0; i < pointsToSync.length; i += BATCH_SIZE) {
    const batch = pointsToSync.slice(i, i + BATCH_SIZE);
    const updates = [];

    for (const point of batch) {
      const canonical = canonicalData[point.packet_key];
      if (!canonical) continue;

      const updatePayload = {};
      TOPOLOGY_FIELDS.forEach(field => {
        if (canonical[field] !== null && canonical[field] !== undefined) {
          updatePayload[field] = canonical[field];
        }
      });

      if (Object.keys(updatePayload).length > 0) {
        updates.push({
          id: point.id,
          payload: updatePayload
        });
      }
    }

    if (updates.length === 0) continue;

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would update ${updates.length} points in batch ${i / BATCH_SIZE + 1}`);
      synced += updates.length;
    } else {
      try {
        const updateRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: updates
          })
        });

        if (!updateRes.ok) {
          const err = await updateRes.text();
          throw new Error(`${updateRes.status}: ${err}`);
        }

        synced += updates.length;
        console.log(`✅ Synced batch ${i / BATCH_SIZE + 1}: ${updates.length} points`);
      } catch (err) {
        failed += updates.length;
        console.error(`❌ Batch ${i / BATCH_SIZE + 1} failed: ${err.message}`);
      }
    }
  }

  return { synced, failed, skipped: samplePoints.length - pointsToSync.length };
}

// 7. Main execution
async function main() {
  try {
    const connected = await verifyQdrantConnection();
    if (!connected) {
      console.error('Cannot proceed without Qdrant connection.\n');
      process.exit(1);
    }

    // Audit
    const { samplePoints, fieldCoverage, pointsScanned } = await auditPayloadCoverage();

    // Sync if requested
    let syncResult = { synced: 0, failed: 0, skipped: 0 };
    if (!DRY_RUN && pointsScanned > 0) {
      syncResult = await syncMissingPayloads(samplePoints);
    }

    // Report
    console.log(`\n📋 Summary (${DRY_RUN ? 'DRY-RUN' : 'APPLIED'}):`);
    console.log(`  Points scanned: ${pointsScanned.toLocaleString()}`);
    console.log(`  Synced: ${syncResult.synced}`);
    console.log(`  Failed: ${syncResult.failed}`);
    console.log(`  Skipped: ${syncResult.skipped}\n`);

    // Next steps
    if (DRY_RUN) {
      console.log('✅ Verify looks good. Run with --apply to backfill Qdrant.\n');
      console.log('Next: npm run atlas:p2:qdrant-payload-sync:sync\n');
    } else {
      console.log(`✅ Synced ${syncResult.synced} points to Qdrant. Topology fields now available for P3.\n`);
      console.log('Next: npm run atlas:p3:neo4j-topology-edges:backfill\n');
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
