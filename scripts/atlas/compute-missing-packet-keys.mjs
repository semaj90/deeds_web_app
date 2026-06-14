#!/usr/bin/env node
/**
 * Compute Missing packet_key in Postgres
 *
 * packet_key = source_ref + ':' + md5(source_ref + feature_id)
 * This is the canonical identity hash for every packet.
 *
 * Current state: ~10% of atlas_packets missing packet_key (NULL)
 * After fix: 100% coverage
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

function computePacketKey(sourceRef, featureId) {
  if (!sourceRef || !featureId) return null;
  const hash = crypto.createHash('md5').update(sourceRef + featureId).digest('hex').slice(0, 8);
  return `${sourceRef}:${hash}`;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Compute Missing packet_key in Postgres                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const dryRun = process.argv.includes('--dry-run');
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';

  console.log(`Mode: ${mode}\n`);

  // Check current coverage
  console.log('Checking current packet_key coverage...');
  const coverageRes = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as has_key,
      COUNT(CASE WHEN packet_key IS NULL THEN 1 END) as missing_key
    FROM atlas_packets
  `);

  const { total, has_key, missing_key } = coverageRes.rows[0];
  const coverage = (parseInt(has_key) / parseInt(total) * 100).toFixed(1);

  console.log(`Total packets: ${total}`);
  console.log(`With packet_key: ${has_key} (${coverage}%)`);
  console.log(`Missing packet_key: ${missing_key}\n`);

  if (parseInt(missing_key) === 0) {
    console.log('✅ All packets have packet_key. Nothing to do.\n');
    await pool.end();
    process.exit(0);
  }

  // Fetch packets with NULL packet_key
  console.log(`Fetching ${missing_key} packets with missing packet_key...`);
  const packetsRes = await pool.query(`
    SELECT
      packet_id,
      source_ref,
      feature_id
    FROM atlas_packets
    WHERE packet_key IS NULL
    LIMIT 10000
  `);

  const packetsToUpdate = packetsRes.rows;
  console.log(`Retrieved ${packetsToUpdate.length} packets\n`);

  // Compute keys
  console.log('Computing packet_key hashes...');
  const updates = packetsToUpdate.map(p => ({
    packet_id: p.packet_id,
    source_ref: p.source_ref,
    feature_id: p.feature_id,
    packet_key: computePacketKey(p.source_ref, p.feature_id)
  }));

  // Show sample
  console.log('\nSample of keys to compute:');
  updates.slice(0, 5).forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.source_ref}`);
    console.log(`     packet_key: ${u.packet_key}`);
  });

  if (!dryRun) {
    console.log(`\n📝 Applying ${updates.length} updates to Postgres...\n`);

    // Batch updates (100 at a time)
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const cases = batch.map(u => `('${u.packet_id}', '${u.packet_key}')`).join(',');

      await pool.query(`
        UPDATE atlas_packets SET packet_key = subquery.key
        FROM (VALUES ${cases}) AS subquery(id, key)
        WHERE packet_id = subquery.id
      `);

      const progress = Math.min(i + batchSize, updates.length);
      console.log(`  [${progress}/${updates.length}] packets updated`);
    }

    console.log('\n✅ All packet_key values computed and written to Postgres\n');
  } else {
    console.log(`\n🔍 DRY-RUN: Would update ${updates.length} packets\n`);
  }

  // Verify
  console.log('Verifying coverage...');
  const verifyRes = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as has_key
    FROM atlas_packets
  `);

  const verified = verifyRes.rows[0];
  const finalCoverage = (parseInt(verified.has_key) / parseInt(verified.total) * 100).toFixed(1);

  console.log(`Total packets: ${verified.total}`);
  console.log(`With packet_key: ${verified.has_key} (${finalCoverage}%)`);

  if (finalCoverage === '100.0') {
    console.log('\n✅ GATE PASS: packet_key coverage is 100%\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Coverage is ${finalCoverage}%, run again to catch any remaining\n`);
    process.exit(1);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
