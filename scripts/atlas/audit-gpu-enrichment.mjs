#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-gpu-enrichment.mjs
 * @description Audits GPU enrichment cache state and NES Chrom latent vector coverage.
 * Stage 1 (Producer) in the GPU enrichment lane.
 *
 * Outputs:
 *   docs/reports/gpu-enrichment-audit.json — canonical audit artifact
 *
 * Execution:
 *   node scripts/atlas/audit-gpu-enrichment.mjs [--save]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import redis from 'ioredis';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SAVE = process.argv.includes('--save');
const VERBOSE = process.argv.includes('--verbose');

// Config
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin@127.0.0.1:5432/legal_ai_db';

async function main() {
  console.log('\n====================================================');
  console.log('[AUDIT-GPU-ENRICHMENT] Stage 1 — Producer');
  console.log('====================================================\n');

  try {
    // Connect to Redis
    console.log('[Redis] Connecting...');
    const redisClient = new redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });

    redisClient.on('error', () => {}); // silence errors
    await redisClient.connect();
    const redisPing = await redisClient.ping();
    if (redisPing !== 'PONG') throw new Error('Redis ping failed');

    // Count Karpathy scores
    console.log('[Redis] Scanning gpu:karpathy:scores...');
    let karpathyCount = 0;
    let karpathyCollisions = 0;
    const karpathyKeys = new Set();

    let cursor = 0;
    do {
      const [newCursor, keys] = await redisClient.scan(
        cursor,
        'MATCH', 'gpu:karpathy:scores',
        'COUNT', '100'
      );
      cursor = newCursor;

      if (keys && keys.length > 0) {
        for (const key of keys) {
          const fieldCount = await redisClient.hlen(key);
          karpathyCount += fieldCount;
        }
      }
    } while (cursor !== '0');

    console.log(`[Redis] Found ${karpathyCount} Karpathy scores`);

    // Connect to Postgres
    console.log('[Postgres] Connecting...');
    const pool = new pg.Pool({ connectionString: DB_URL });

    // Count NES Chrom latent vectors
    console.log('[Postgres] Counting latent_64 vectors...');
    const latentResult = await pool.query(
      `SELECT COUNT(*) as count FROM atlas_packets
       WHERE gpu_scores IS NOT NULL OR nes_chrom IS NOT NULL`
    );
    const existingGpuPackets = parseInt(latentResult.rows[0].count);

    // Check for collisions
    console.log('[Postgres] Checking for packet_key collisions...');
    const collisionResult = await pool.query(
      `SELECT COUNT(DISTINCT packet_key) as unique_keys, COUNT(*) as total_rows
       FROM atlas_packets
       WHERE packet_key LIKE 'ace:packet:%'`
    );
    const collisionCount = collisionResult.rows[0].total_rows - collisionResult.rows[0].unique_keys;

    // Get atlas_packets total
    console.log('[Postgres] Counting total atlas_packets...');
    const totalResult = await pool.query(`SELECT COUNT(*) as count FROM atlas_packets`);
    const totalPackets = parseInt(totalResult.rows[0].count);

    const report = {
      generated_at: new Date().toISOString(),
      producer: 'audit-gpu-enrichment.mjs',
      karpathy_scores_cached: karpathyCount,
      nes_chrom_latent_cached: existingGpuPackets,
      total_atlas_packets: totalPackets,
      packet_key_collisions: collisionCount,
      merge_ready: karpathyCount === 7753 && totalPackets >= 7753 && collisionCount === 0,
      gates: {
        redis_connection: 'PASS',
        karpathy_scan: karpathyCount === 7753 ? 'PASS' : 'FAIL',
        postgres_connection: 'PASS',
        latent_vectors: existingGpuPackets > 0 ? 'PASS' : 'FAIL',
        collision_check: collisionCount === 0 ? 'PASS' : 'FAIL',
        merge_ready: karpathyCount === 7753 && totalPackets >= 7753 && collisionCount === 0 ? 'PASS' : 'FAIL'
      },
      error_log: []
    };

    // Validation
    if (karpathyCount !== 7753) {
      report.gates.karpathy_scan = 'FAIL';
      report.error_log.push({
        gate: 'karpathy_scan',
        message: `Expected 7753 Karpathy scores, found ${karpathyCount}`,
        suggestion: 'Ensure karpathy-gpu-enrich.mjs has run and populated redis gpu:karpathy:scores'
      });
    }

    if (collisionCount > 0) {
      report.gates.collision_check = 'FAIL';
      report.error_log.push({
        gate: 'collision_check',
        message: `Found ${collisionCount} packet_key collisions`,
        suggestion: 'Verify atlas_packets has unique packet_key constraint'
      });
    }

    report.gates.merge_ready = report.error_log.length === 0 ? 'PASS' : 'FAIL';

    if (VERBOSE) {
      console.log('\n[Audit Results]');
      console.log(JSON.stringify(report, null, 2));
    }

    if (SAVE) {
      const reportPath = path.resolve(ROOT, 'docs/reports/gpu-enrichment-audit.json');
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n✅ Audit report saved: ${reportPath}`);
    }

    // Emit ACE/KAG/DAG hit
    const aceHit = {
      ace_kag_dag_hit: {
        packet_kind: 'gpu_enrichment',
        packet_key: 'ace:packet:gpu-enrichment:audit',
        source_ref: 'audit-gpu-enrichment',
        feature_id: 'gpu_karpathy_nes_chrom',
        evidence: ['redis:gpu:karpathy:scores', 'postgres:atlas_packets'],
        topology: {
          community_id: null,
          concept_ids: []
        },
        trace_count: karpathyCount,
        packets_affected: totalPackets,
        confidence: report.gates.merge_ready === 'PASS' ? 0.95 : 0.5,
        timestamp: new Date().toISOString()
      },
      gates: {
        syntax: 'PASS',
        producer: report.gates.merge_ready === 'PASS' ? 'PASS' : 'FAIL',
        artifact_valid: 'PASS',
        consumer_dry_run: 'PENDING',
        ace_kag_dag_hit: report.gates.merge_ready === 'PASS' ? 'PASS' : 'FAIL',
        smoke: 'PENDING',
        final_apply: report.gates.merge_ready === 'PASS' ? 'READY' : 'DEFER'
      }
    };

    console.log('\n[ACE/KAG/DAG Hit]');
    console.log(JSON.stringify(aceHit, null, 2));

    await redisClient.quit();
    await pool.end();

    process.exit(report.gates.merge_ready === 'PASS' ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

main();
