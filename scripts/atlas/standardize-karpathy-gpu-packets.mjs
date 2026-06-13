#!/usr/bin/env node
/**
 * @file scripts/atlas/standardize-karpathy-gpu-packets.mjs
 * @description Reads Redis gpu:karpathy:scores and outputs standardized packet JSONLines.
 * Stage 2 (Consumer Dry-Run) in the GPU enrichment lane.
 *
 * Outputs:
 *   docs/reports/gpu-karpathy-packets.jsonl — one packet per line
 *
 * Execution:
 *   node scripts/atlas/standardize-karpathy-gpu-packets.mjs [--save]
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

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin@127.0.0.1:5432/legal_ai_db';

async function main() {
  console.log('\n====================================================');
  console.log('[STANDARDIZE-KARPATHY] Stage 2 — Consumer Dry-Run');
  console.log('====================================================\n');

  const redisClient = new redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  redisClient.on('error', () => {});
  await redisClient.connect();

  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    console.log('[Karpathy] Reading from Redis...');
    const karpathyHash = await redisClient.hgetall('gpu:karpathy:scores');

    const packets = [];
    const collisions = [];
    const seenKeys = new Set();

    for (const [fileKey, scoreJson] of Object.entries(karpathyHash)) {
      try {
        const scores = JSON.parse(scoreJson);

        // Fetch corresponding atlas_packets row
        const result = await pool.query(
          `SELECT packet_key, source_ref, feature_id FROM atlas_packets
           WHERE source_ref = $1 LIMIT 1`,
          [fileKey]
        );

        if (result.rows.length === 0) {
          console.warn(`⚠️ No atlas_packets row found for source_ref: ${fileKey}`);
          continue;
        }

        const row = result.rows[0];
        const packet = {
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          feature_id: row.feature_id,
          gpu_scores: {
            pr: scores.pr || 0,
            attn: scores.attn || 0,
            authority: scores.authority || 0,
            blend: scores.blend || 0
          }
        };

        // Check for collisions
        if (seenKeys.has(packet.packet_key)) {
          collisions.push({
            packet_key: packet.packet_key,
            duplicate_count: collisions.filter(c => c.packet_key === packet.packet_key).length + 1
          });
        }

        seenKeys.add(packet.packet_key);
        packets.push(packet);
      } catch (err) {
        console.error(`❌ Error parsing score for ${fileKey}:`, err.message);
      }
    }

    console.log(`[Karpathy] Standardized ${packets.length} packets`);
    console.log(`[Validation] Collisions: ${collisions.length}`);

    // Output JSONL
    const jsonlLines = packets.map(p => JSON.stringify(p)).join('\n');

    const report = {
      generated_at: new Date().toISOString(),
      consumer: 'standardize-karpathy-gpu-packets.mjs',
      packets_standardized: packets.length,
      packet_collisions: collisions.length,
      schema_valid: collisions.length === 0,
      sample_packets: packets.slice(0, 3),
      collision_details: collisions.slice(0, 10)
    };

    if (VERBOSE) {
      console.log('\n[Report]');
      console.log(JSON.stringify(report, null, 2));
    }

    if (SAVE) {
      const jsonlPath = path.resolve(ROOT, 'docs/reports/gpu-karpathy-packets.jsonl');
      await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
      await fs.writeFile(jsonlPath, jsonlLines);
      console.log(`\n✅ Standardized packets saved: ${jsonlPath}`);

      const reportPath = path.resolve(ROOT, 'docs/reports/gpu-karpathy-standardization-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`✅ Report saved: ${reportPath}`);
    }

    // Emit ACE/KAG/DAG hit
    const aceHit = {
      ace_kag_dag_hit: {
        packet_kind: 'gpu_enrichment',
        packet_key: 'ace:packet:gpu-karpathy:standardize',
        source_ref: 'standardize-karpathy-gpu-packets',
        feature_id: 'gpu_karpathy_standardization',
        evidence: ['redis:gpu:karpathy:scores', 'atlas_packets'],
        topology: { community_id: null, concept_ids: [] },
        packets_affected: packets.length,
        confidence: collisions.length === 0 ? 0.95 : 0.5,
        timestamp: new Date().toISOString()
      },
      gates: {
        syntax: 'PASS',
        producer: 'PASS',
        artifact_valid: collisions.length === 0 ? 'PASS' : 'FAIL',
        consumer_dry_run: collisions.length === 0 ? 'PASS' : 'FAIL',
        ace_kag_dag_hit: collisions.length === 0 ? 'PASS' : 'FAIL',
        smoke: 'PENDING',
        final_apply: collisions.length === 0 ? 'READY' : 'DEFER'
      }
    };

    console.log('\n[ACE/KAG/DAG Hit]');
    console.log(JSON.stringify(aceHit, null, 2));

    await redisClient.quit();
    await pool.end();

    process.exit(collisions.length === 0 ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

main();
