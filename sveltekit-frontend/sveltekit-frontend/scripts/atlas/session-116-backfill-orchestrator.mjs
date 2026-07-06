#!/usr/bin/env node

/**
 * Session 116: Backfill Orchestrator
 * Backfill identity_lane and identity_confidence for 58K packets
 *
 * Usage:
 *   node scripts/atlas/session-116-backfill-orchestrator.mjs --dry-run
 *   node scripts/atlas/session-116-backfill-orchestrator.mjs --apply
 *   node scripts/atlas/session-116-backfill-orchestrator.mjs --verify
 */

import pg from 'pg';
import { performance } from 'perf_hooks';

const { Pool } = pg;
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');
const isVerify = args.includes('--verify');
const batchSize = 1000;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  connectionTimeoutMillis: 5000
});

async function getPacketCount() {
  const result = await pool.query('SELECT COUNT(*) as count FROM atlas_packets');
  return parseInt(result.rows[0].count);
}

async function analyzePackets() {
  console.log('[analyze] Analyzing packet identity coverage...');

  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL AND packet_key != '' THEN 1 END) as has_packet_key,
      COUNT(CASE WHEN source_ref IS NOT NULL AND source_ref != '' THEN 1 END) as has_source_ref,
      COUNT(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 END) as has_feature_id,
      COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL AND feature_id IS NOT NULL THEN 1 END) as fully_identified
    FROM atlas_packets
  `);

  const stats = result.rows[0];
  console.log(`
[stats] Packet Identity Coverage:
  Total packets: ${stats.total}
  Has packet_key: ${stats.has_packet_key} (${(stats.has_packet_key / stats.total * 100).toFixed(1)}%)
  Has source_ref: ${stats.has_source_ref} (${(stats.has_source_ref / stats.total * 100).toFixed(1)}%)
  Has feature_id: ${stats.has_feature_id} (${(stats.has_feature_id / stats.total * 100).toFixed(1)}%)
  Fully identified (3/3): ${stats.fully_identified} (${(stats.fully_identified / stats.total * 100).toFixed(1)}%)
  `);

  return stats;
}

async function assignIdentityLanes(batchNum, batchSize) {
  /**
   * Lane assignment logic:
   * - canonical: packet_key + source_ref + feature_id all present
   * - recoverable: source_ref + feature_id present (can reconstruct packet_key)
   * - quarantine: insufficient identity fields
   */

  const offset = (batchNum - 1) * batchSize;
  const result = await pool.query(
    `
    UPDATE atlas_packets
    SET
      identity_lane = CASE
        WHEN packet_key IS NOT NULL AND packet_key != ''
             AND source_ref IS NOT NULL AND source_ref != ''
             AND feature_id IS NOT NULL AND feature_id != ''
        THEN 'canonical'

        WHEN (source_ref IS NOT NULL AND source_ref != '')
             AND (feature_id IS NOT NULL AND feature_id != '')
        THEN 'recoverable'

        ELSE 'quarantine'
      END,

      identity_confidence = CASE
        WHEN packet_key IS NOT NULL AND packet_key != ''
             AND source_ref IS NOT NULL AND source_ref != ''
             AND feature_id IS NOT NULL AND feature_id != ''
        THEN 1.0

        WHEN (source_ref IS NOT NULL AND source_ref != '')
             AND (feature_id IS NOT NULL AND feature_id != '')
        THEN 0.85

        ELSE 0.0
      END,

      recovery_lane = CASE
        WHEN packet_key IS NOT NULL AND packet_key != ''
             AND source_ref IS NOT NULL AND source_ref != ''
             AND feature_id IS NOT NULL AND feature_id != ''
        THEN 'canonical'

        WHEN (source_ref IS NOT NULL AND source_ref != '')
             AND (feature_id IS NOT NULL AND feature_id != '')
        THEN 'deterministic_reconstruction'

        ELSE 'lost'
      END,

      updated_at = NOW()
    WHERE id > (
      SELECT COALESCE(MAX(id), 0) FROM atlas_packets
      WHERE identity_lane IS NOT NULL AND identity_lane != ''
      LIMIT $1 OFFSET $2
    )
    RETURNING COUNT(*) as updated
    `,
    [batchSize, offset]
  );

  return result.rowCount;
}

async function backfillBatch(batchNum, batchSize) {
  const offset = (batchNum - 1) * batchSize;

  const query = `
    UPDATE atlas_packets
    SET
      identity_lane = CASE
        WHEN packet_key IS NOT NULL AND packet_key != ''
             AND source_ref IS NOT NULL AND source_ref != ''
             AND feature_id IS NOT NULL AND feature_id != ''
        THEN 'canonical'

        WHEN (source_ref IS NOT NULL AND source_ref != '')
             AND (feature_id IS NOT NULL AND feature_id != '')
        THEN 'recoverable'

        ELSE 'quarantine'
      END,

      identity_confidence = CASE
        WHEN packet_key IS NOT NULL AND packet_key != ''
             AND source_ref IS NOT NULL AND source_ref != ''
             AND feature_id IS NOT NULL AND feature_id != ''
        THEN 1.0::REAL

        WHEN (source_ref IS NOT NULL AND source_ref != '')
             AND (feature_id IS NOT NULL AND feature_id != '')
        THEN 0.85::REAL

        ELSE 0.0::REAL
      END,

      recovery_lane = CASE
        WHEN packet_key IS NOT NULL AND packet_key != ''
             AND source_ref IS NOT NULL AND source_ref != ''
             AND feature_id IS NOT NULL AND feature_id != ''
        THEN 'canonical'

        WHEN (source_ref IS NOT NULL AND source_ref != '')
             AND (feature_id IS NOT NULL AND feature_id != '')
        THEN 'deterministic_reconstruction'

        ELSE 'lost'
      END,

      updated_at = NOW()
    WHERE id IN (
      SELECT id FROM atlas_packets
      WHERE identity_lane IS NULL OR identity_lane = ''
      ORDER BY id
      LIMIT $1
      OFFSET $2
    )
  `;

  const result = await pool.query(query, [batchSize, offset]);
  return result.rowCount;
}

async function verifyBackfill() {
  console.log('[verify] Verifying backfill coverage...');

  const result = await pool.query(`
    SELECT
      identity_lane,
      COUNT(*) as count,
      ROUND(AVG(identity_confidence), 4) as avg_confidence,
      MIN(identity_confidence) as min_confidence,
      MAX(identity_confidence) as max_confidence
    FROM atlas_packets
    WHERE identity_lane IS NOT NULL
    GROUP BY identity_lane
    ORDER BY count DESC
  `);

  console.log('\n[verify] Identity Lane Distribution:');
  let total = 0;
  for (const row of result.rows) {
    const pct = (row.count / 58365 * 100).toFixed(1);
    console.log(`  ${row.identity_lane.padEnd(12)} ${row.count.toString().padStart(6)} packets (${pct}%) | confidence: ${row.avg_confidence}`);
    total += row.count;
  }

  console.log(`\n[verify] Total assigned: ${total} / 58365 (${(total / 58365 * 100).toFixed(1)}%)`);

  // Check for nulls
  const nullResult = await pool.query(`
    SELECT COUNT(*) as null_count FROM atlas_packets
    WHERE identity_lane IS NULL OR identity_lane = ''
  `);

  const nullCount = nullResult.rows[0].null_count;
  if (nullCount > 0) {
    console.log(`\n[warning] ${nullCount} packets still have NULL identity_lane (${(nullCount / 58365 * 100).toFixed(1)}%)`);
  } else {
    console.log('\n[success] All 58365 packets have assigned identity_lane');
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Session 116: Backfill Orchestrator');
  console.log('='.repeat(60));

  try {
    // Verify connection
    await pool.query('SELECT 1');
    console.log('[connect] Connected to Postgres');

    // Step 1: Analyze current state
    const startTime = performance.now();
    const stats = await analyzePackets();

    if (isVerify) {
      await verifyBackfill();
      await pool.end();
      return;
    }

    if (isDryRun) {
      console.log('\n[dry-run] Would backfill identity_lane for 58365 packets');
      console.log(`[dry-run] Using batch size: ${batchSize}`);
      console.log('[dry-run] Expected result: all packets assigned to canonical/recoverable/quarantine');

      const expectedCanonical = Math.floor(stats.fully_identified);
      const expectedRecoverable = Math.floor(stats.has_source_ref) - expectedCanonical;
      const expectedQuarantine = Math.floor(stats.total) - expectedCanonical - expectedRecoverable;

      console.log(`\n[dry-run] Expected distribution:`);
      console.log(`  canonical: ${expectedCanonical} (${(expectedCanonical / stats.total * 100).toFixed(1)}%)`);
      console.log(`  recoverable: ${expectedRecoverable} (${(expectedRecoverable / stats.total * 100).toFixed(1)}%)`);
      console.log(`  quarantine: ${expectedQuarantine} (${(expectedQuarantine / stats.total * 100).toFixed(1)}%)`);

      await pool.end();
      return;
    }

    if (isApply) {
      console.log(`\n[apply] Starting backfill of 58365 packets in batches of ${batchSize}...`);

      const totalBatches = Math.ceil(58365 / batchSize);
      let totalUpdated = 0;

      for (let batch = 1; batch <= totalBatches; batch++) {
        const updated = await backfillBatch(batch, batchSize);
        totalUpdated += updated;

        const progress = (batch / totalBatches * 100).toFixed(1);
        console.log(`[batch ${batch}/${totalBatches}] Updated ${updated} packets (${progress}% complete)`);
      }

      const elapsed = (performance.now() - startTime) / 1000;
      console.log(`\n[apply] Backfill complete: ${totalUpdated} packets updated in ${elapsed.toFixed(1)}s`);

      // Verify
      console.log('\n[post-apply] Verifying backfill...');
      await verifyBackfill();
    }

    await pool.end();
    console.log('\n[done] Session 116 backfill orchestrator complete');
  } catch (err) {
    console.error('[error]', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();
