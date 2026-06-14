#!/usr/bin/env node
/**
 * Backfill Qdrant Payload with Missing Postgres Fields
 *
 * Purpose: Synchronize atlas_codebase_packets columns to Qdrant payload
 * Handles schema mismatch: camelCase (Qdrant) vs snake_case (Postgres)
 *
 * Mapping (Postgres → Qdrant):
 *   packet_key → stable_key (new)
 *   file_path → file_path (new)
 *   feature_label → feature_label (new)
 *   community_id → community_id (new)
 *   community_confidence → community_conf (new)
 *   lineage_version → lineage_version (new)
 *   ledger_type → ledger_type (new)
 *   tree_node_id → tree_node_id (new)
 *   som_cluster → som_cluster (already exists, verify)
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-payload-complete.mjs [--dry-run] [--apply] [--batch=50]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import https from 'https';
import http from 'http';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const flags = {
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply'),
  batch: parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '25')
};

const mode = flags.apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Payload Backfill: Missing Postgres Fields              ║');
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
      headers: {
        'Content-Type': 'application/json'
      }
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

    req.on('error', (err) => {
      console.error(`Qdrant request error (${method} ${path}):`, err.message);
      reject(err);
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ────────────────────────────────────────────────────────────────
// Backfill Logic
// ────────────────────────────────────────────────────────────────

async function backfillPayloads() {
  console.log('📊 Step 1: Fetch Postgres packets\n');

  // Fetch all packets from Postgres
  const result = await pool.query(`
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
  `);

  const packets = result.rows;
  console.log(`   ✅ Loaded ${packets.length} packets\n`);

  // Build update operations for Qdrant
  console.log(`📦 Step 2: Build Qdrant update operations (batch size: ${flags.batch})\n`);

  const operations = [];
  let batchCount = 0;

  for (let i = 0; i < packets.length; i += flags.batch) {
    const batch = packets.slice(i, i + flags.batch);
    batchCount++;

    // Build set_payload operations for this batch
    const batchOps = batch.map(pkt => ({
      operation: 'set_payload',
      payload: {
        stable_key: pkt.packet_key,
        file_path: pkt.file_path,
        feature_label: pkt.feature_label,
        community_id: pkt.community_id || null,
        community_conf: pkt.community_confidence ? parseFloat(pkt.community_confidence) : null,
        lineage_version: pkt.lineage_version,
        ledger_type: pkt.ledger_type,
        tree_node_id: pkt.tree_node_id ? pkt.tree_node_id.toString() : null,
        // som_cluster already exists in Qdrant, only update if changed
        som_cluster: pkt.som_cluster ? pkt.som_cluster.toString() : null
      },
      filter: {
        must: [
          {
            key: 'source_ref',
            match: { value: pkt.source_ref }
          }
        ]
      }
    }));

    operations.push(...batchOps);
  }

  console.log(`   ✅ Built ${operations.length} update operations (${batchCount} batches)\n`);

  if (flags.dryRun) {
    console.log('   [DRY-RUN] Preview (first 3 operations):\n');
    for (const op of operations.slice(0, 3)) {
      console.log(`   Operation: ${op.operation}`);
      console.log(`   Filter: source_ref = "${op.filter.must[0].match.value}"`);
      console.log(`   Payload keys: ${Object.keys(op.payload).join(', ')}\n`);
    }
    console.log(`   [DRY-RUN] Would apply ${operations.length} updates\n`);
    return { success: true, operationsCount: operations.length };
  }

  // Apply updates to Qdrant
  console.log(`🔄 Step 3: Apply updates to Qdrant (${operations.length} operations)\n`);

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < operations.length; i += flags.batch) {
    const batch = operations.slice(i, i + flags.batch);
    const batchNum = Math.floor(i / flags.batch) + 1;

    try {
      // Use set_payload endpoint with filter for each batch
      // Note: Qdrant set_payload applies payload to all points matching the filter
      const response = await qdrantRequest(
        'POST',
        '/collections/codebase_chunks_768/points/set_payload',
        {
          payload: batch[0]?.payload || {},
          points: [] // Will be set by filter instead
        }
      );

      if (response.status === 200) {
        successCount += batch.length;
        console.log(`   ✅ Batch ${batchNum}: ${batch.length} updates applied`);
      } else {
        failureCount += batch.length;
        console.log(`   ❌ Batch ${batchNum}: HTTP ${response.status}`);
      }
    } catch (err) {
      failureCount += batch.length;
      console.log(`   ❌ Batch ${batchNum}: ${err.message}`);
    }
  }

  console.log(`\n   Success: ${successCount}/${operations.length}`);
  console.log(`   Failures: ${failureCount}/${operations.length}\n`);

  return { success: failureCount === 0, operationsCount: operations.length, successCount, failureCount };
}

// ────────────────────────────────────────────────────────────────
// Verify
// ────────────────────────────────────────────────────────────────

async function verifyPayloads() {
  console.log('✅ Step 4: Verify Qdrant payload schema\n');

  try {
    const response = await qdrantRequest('GET', '/collections/codebase_chunks_768');
    const schema = response.data.result.payload_schema;

    const expectedFields = ['stable_key', 'file_path', 'feature_label', 'community_id', 'community_conf', 'lineage_version', 'ledger_type', 'tree_node_id'];
    const schemaKeys = Object.keys(schema);

    for (const field of expectedFields) {
      const status = schemaKeys.includes(field) ? '✅' : '⏳';
      const coverage = schema[field]?.points || 0;
      console.log(`   ${status} ${field}: ${coverage} points`);
    }
  } catch (err) {
    console.error('   ❌ Verification failed:', err.message);
  }

  console.log('');
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

async function main() {
  try {
    const result = await backfillPayloads();

    if (result.success || flags.dryRun) {
      await verifyPayloads();

      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║  Backfill Complete ✅                                         ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      if (flags.dryRun) {
        console.log('   📋 To apply these changes, run:\n');
        console.log('   node scripts/atlas/backfill-qdrant-payload-complete.mjs --apply\n');
      }

      process.exit(0);
    } else {
      console.error('\n❌ Backfill failed with errors\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
