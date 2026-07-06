#!/usr/bin/env node
/**
 * Direct backfill: Postgres som_cluster → som_cluster_id
 * 
 * Converts existing som_cluster text values to numeric cluster IDs (0-399)
 * and writes to som_cluster_id column
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Direct Backfill: Postgres som_cluster → som_cluster_id        ║');
console.log(`║  Mode: ${dryRun || !apply ? 'DRY-RUN' : 'APPLY'}${' '.repeat(42 - (dryRun || !apply ? 'DRY-RUN' : 'APPLY').length)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function backfillDirect() {
  console.log('📊 Step 1: Load packets with som_cluster\n');

  const result = await pgPool.query(`
    SELECT packet_key, som_cluster
    FROM atlas_packets
    WHERE som_cluster IS NOT NULL
    ORDER BY packet_key
  `);

  const packets = result.rows;
  console.log(`   ✅ Loaded ${packets.length} packets with som_cluster\n`);

  console.log('🔄 Step 2: Parse and validate cluster IDs\n');

  const updates = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const packet of packets) {
    let clusterId = null;
    const somCluster = packet.som_cluster;

    if (typeof somCluster === 'string') {
      if (somCluster.startsWith('som:')) {
        // Format: "som:5:12" → row=5, col=12 → clusterId = 5*20 + 12 = 112
        const parts = somCluster.split(':');
        if (parts.length === 3) {
          const row = parseInt(parts[1]);
          const col = parseInt(parts[2]);
          if (!isNaN(row) && !isNaN(col) && row >= 0 && row < 20 && col >= 0 && col < 20) {
            clusterId = row * 20 + col;
          }
        }
      } else if (!isNaN(parseInt(somCluster))) {
        // Already numeric (0-399)
        const id = parseInt(somCluster);
        if (id >= 0 && id < 400) {
          clusterId = id;
        }
      }
    }

    if (clusterId !== null) {
      updates.push({ packet_key: packet.packet_key, som_cluster_id: clusterId });
      validCount++;
    } else {
      invalidCount++;
    }
  }

  console.log(`   ✅ Valid cluster IDs: ${validCount}`);
  console.log(`   ⚠️  Invalid/unparseable: ${invalidCount}\n`);

  if (dryRun) {
    console.log('   [DRY-RUN] Sample updates:\n');
    for (let i = 0; i < Math.min(5, updates.length); i++) {
      const u = updates[i];
      console.log(`      ${u.packet_key}: cluster_id=${u.som_cluster_id}`);
    }
    if (updates.length > 5) {
      console.log(`      ... and ${updates.length - 5} more\n`);
    }
    return { success: true, validCount };
  }

  console.log('💾 Step 3: Upsert to Postgres (batch)\n');

  let upsertedCount = 0;
  const batchSize = 500;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    try {
      for (const u of batch) {
        await pgPool.query(
          'UPDATE atlas_packets SET som_cluster_id = $1 WHERE packet_key = $2',
          [u.som_cluster_id, u.packet_key]
        );
      }
      upsertedCount += batch.length;

      if ((i + batchSize) % 5000 === 0 || i + batchSize >= updates.length) {
        console.log(`   ⏳ Updated ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
      }
    } catch (err) {
      console.error(`   ❌ Batch error at ${i}:`, err.message);
      throw err;
    }
  }

  console.log(`   ✅ Updated ${upsertedCount} rows\n`);

  return { success: true, upsertedCount };
}

async function main() {
  try {
    const result = await backfillDirect();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Backfill Complete ✅                                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
