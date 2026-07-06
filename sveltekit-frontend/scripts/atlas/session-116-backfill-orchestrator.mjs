#!/usr/bin/env node

/**
 * Session 116: Backfill Orchestrator
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
  database: process.env.POSTGRES_DB || 'legal_ai_db'
});

async function analyzePackets() {
  console.log('[analyze] Analyzing packet identity coverage...');
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL AND packet_key != '' THEN 1 END) as has_packet_key,
      COUNT(CASE WHEN source_ref IS NOT NULL AND source_ref != '' THEN 1 END) as has_source_ref,
      COUNT(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 END) as has_feature_id,
      COUNT(CASE WHEN identity_lane IS NOT NULL AND identity_lane != '' THEN 1 END) as assigned
    FROM atlas_packets
  `);
  const stats = result.rows[0];
  console.log(`  Total: ${stats.total}, Assigned: ${stats.assigned}, Has source_ref: ${stats.has_source_ref}`);
  return stats;
}

async function backfillBatch() {
  console.log('[backfill] Starting identity_lane backfill...');
  const result = await pool.query(`
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
        THEN 'canonical'
        WHEN source_ref IS NOT NULL
        THEN 'deterministic_reconstruction'
        ELSE 'lost'
      END,
      updated_at = NOW()
    WHERE identity_lane IS NULL OR identity_lane = ''
  `);
  console.log(`[backfill] Updated ${result.rowCount} packets`);
  return result.rowCount;
}

async function verifyBackfill() {
  console.log('[verify] Verifying backfill...');
  const result = await pool.query(`
    SELECT
      identity_lane,
      COUNT(*) as count
    FROM atlas_packets
    WHERE identity_lane IS NOT NULL
    GROUP BY identity_lane
    ORDER BY count DESC
  `);
  for (const row of result.rows) {
    console.log(`  ${row.identity_lane}: ${row.count}`);
  }
}

async function main() {
  try {
    await pool.query('SELECT 1');
    console.log('Session 116: Backfill Orchestrator');
    
    const stats = await analyzePackets();
    
    if (isDryRun) {
      console.log('[dry-run] Would backfill all unassigned packets');
    } else if (isApply) {
      const updated = await backfillBatch();
      console.log(`[apply] Backfill complete: ${updated} packets`);
      await verifyBackfill();
    } else if (isVerify) {
      await verifyBackfill();
    }
    
    await pool.end();
  } catch (err) {
    console.error('[error]', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();
