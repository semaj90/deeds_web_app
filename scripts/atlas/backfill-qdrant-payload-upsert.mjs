#!/usr/bin/env node
/**
 * Backfill Qdrant Payload via Upsert (Update Existing Points)
 *
 * Purpose: Add missing Postgres fields to Qdrant payload
 * Uses Qdrant's set_payload with point ID filters
 *
 * Approach: For each packet, find matching Qdrant points by source_ref and update payload
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-payload-upsert.mjs [--dry-run] [--apply] [--sample=10]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import http from 'http';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const flags = {
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply'),
  sample: parseInt(process.argv.find(a => a.startsWith('--sample='))?.split('=')[1] || '0')
};

const mode = flags.apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Payload Upsert: Missing Postgres Fields                ║');
console.log(`║  Mode: ${mode}${' '.repeat(48 - mode.length)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ────────────────────────────────────────────────────────────────
// Qdrant API Helper
// ────────────────────────────────────────────────────────────────

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

// Search Qdrant for points matching source_ref
async function searchQdrantBySourceRef(sourceRef) {
  const response = await qdrantRequest(
    'POST',
    '/collections/codebase_chunks_768/points/search',
    {
      vector: {
        name: 'content',
        vector: new Array(768).fill(0) // Dummy vector, we're using filter only
      },
      filter: {
        must: [{ key: 'source_ref', match: { value: sourceRef } }]
      },
      limit: 100,
      with_vectors: false,
      with_payload: true
    }
  );
  return response.data?.result || [];
}

// Update payload for specific points
async function updatePointPayloads(payload, pointIds) {
  if (pointIds.length === 0) return { status: 200 };

  const response = await qdrantRequest(
    'POST',
    '/collections/codebase_chunks_768/points/set_payload',
    {
      payload,
      points: pointIds
    }
  );
  return response;
}

// ────────────────────────────────────────────────────────────────
// Backfill Logic
// ────────────────────────────────────────────────────────────────

async function backfillPayloads() {
  console.log('📊 Step 1: Fetch Postgres packets\n');

  const query = `
    SELECT
      packet_key,
      source_ref,
      file_path,
      feature_id,
      feature_label,
      community_id,
      community_confidence,
      lineage_version,
      ledger_type,
      tree_node_id,
      som_cluster
    FROM atlas_codebase_packets
    ORDER BY created_at DESC
  `;

  const result = await pool.query(flags.sample > 0 ? query + ` LIMIT ${flags.sample}` : query);
  const packets = result.rows;
  console.log(`   ✅ Loaded ${packets.length} packets${flags.sample > 0 ? ` (sample: ${flags.sample})` : ''}\n`);

  console.log(`🔍 Step 2: Search Qdrant and collect point IDs\n`);

  let totalPoints = 0;
  let pointsToUpdate = [];
  let packetsWithPoints = 0;

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];

    // Search for points with this source_ref
    try {
      const results = await searchQdrantBySourceRef(pkt.source_ref);

      if (results.length > 0) {
        packetsWithPoints++;
        totalPoints += results.length;

        for (const point of results) {
          pointsToUpdate.push({
            pointId: point.id,
            payload: {
              stable_key: pkt.packet_key,
              file_path: pkt.file_path,
              feature_label: pkt.feature_label || '',
              community_id: pkt.community_id || null,
              community_conf: pkt.community_confidence ? parseFloat(pkt.community_confidence) : null,
              lineage_version: pkt.lineage_version,
              ledger_type: pkt.ledger_type,
              tree_node_id: pkt.tree_node_id ? pkt.tree_node_id.toString() : null
            }
          });
        }
      }
    } catch (err) {
      console.error(`   ❌ Error searching for ${pkt.source_ref}:`, err.message);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`   ⏳ Processed ${i + 1}/${packets.length} packets (${totalPoints} points found)`);
    }
  }

  console.log(`   ✅ Found ${totalPoints} Qdrant points from ${packetsWithPoints}/${packets.length} packets\n`);

  if (pointsToUpdate.length === 0) {
    console.log('   ⚠️  No points to update\n');
    return { success: true, pointsCount: 0 };
  }

  if (flags.dryRun) {
    console.log(`   [DRY-RUN] Would update ${pointsToUpdate.length} points\n`);
    console.log(`   Sample (first 3 points):\n`);
    for (const item of pointsToUpdate.slice(0, 3)) {
      console.log(`     Point ID: ${item.pointId}`);
      console.log(`     Payload keys: ${Object.keys(item.payload).join(', ')}\n`);
    }
    return { success: true, pointsCount: pointsToUpdate.length };
  }

  // Apply updates in batches
  console.log(`🔄 Step 3: Apply payload updates (${pointsToUpdate.length} points in batches of 100)\n`);

  const batchSize = 100;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < pointsToUpdate.length; i += batchSize) {
    const batch = pointsToUpdate.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    // All points in this batch use the same payload structure
    // We need to update each point individually since payloads differ
    for (const item of batch) {
      try {
        const response = await updatePointPayloads(item.payload, [item.pointId]);

        if (response.status === 200) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (err) {
        failureCount++;
      }
    }

    console.log(`   ✅ Batch ${batchNum}: ${batch.length} points updated`);
  }

  console.log(`\n   Success: ${successCount}/${pointsToUpdate.length}`);
  console.log(`   Failures: ${failureCount}/${pointsToUpdate.length}\n`);

  return { success: failureCount === 0, pointsCount: pointsToUpdate.length, successCount, failureCount };
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

async function main() {
  try {
    const result = await backfillPayloads();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Payload Backfill Complete ✅                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (flags.dryRun && result.pointsCount > 0) {
      console.log('   📋 To apply these changes, run:\n');
      console.log('   node scripts/atlas/backfill-qdrant-payload-upsert.mjs --apply\n');
    }

    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
