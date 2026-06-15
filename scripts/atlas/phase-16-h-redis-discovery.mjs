#!/usr/bin/env node

/**
 * Phase 16-H.6: Redis Discovery
 *
 * Discovers hot cache keys from Redis:
 * - bifrost:sem:packet:* (semantic cache)
 * - gpu:karpathy:scores (GPU authority ranking)
 * Populates bifrost_key, gpu_karpathy_key in bridge table
 *
 * Time: ~25 min
 * Blocker: Phase 16-H.1
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const log = {
  info: (msg) => console.log(`[phase-16-h-6] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.6: Redis Discovery ==========');
    log.info('');

    const redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    try {
      await redis.connect();
      log.ok('Connected to Redis');
    } catch (err) {
      log.error(`Failed to connect to Redis: ${err.message}`);
      log.info('Continuing with discovery (Redis is optional)');
    }

    const client = await pool.connect();

    try {
      let bifrostDiscovered = 0;
      let karpathyDiscovered = 0;

      // Step 1: Discover Bifrost cache keys
      log.progress('Discovering Bifrost semantic cache keys...');

      try {
        const bifrostKeys = await redis.keys('bifrost:sem:packet:*');
        log.ok(`Found ${bifrostKeys.length} Bifrost cache keys`);

        for (const key of bifrostKeys) {
          const parts = key.split(':');
          const packetKey = parts.slice(3).join(':'); // Handle colons in packet_key

          const score = await redis.get(key);

          const updateResult = await client.query(
            `UPDATE atlas_higher_hop_index
             SET bifrost_key = $1, bifrost_score = $2
             WHERE packet_key = $3 AND bifrost_key IS NULL`,
            [key, parseFloat(score) || 1.0, packetKey]
          );

          if (updateResult.rowCount > 0) {
            bifrostDiscovered++;
          }
        }

        log.ok(`Linked ${bifrostDiscovered} Bifrost keys to bridge table`);
      } catch (err) {
        log.info(`Bifrost discovery skipped: ${err.message}`);
      }

      log.info('');

      // Step 2: Discover GPU Karpathy ranking
      log.progress('Discovering GPU Karpathy ranking keys...');

      try {
        const karpathyScores = await redis.hgetall('gpu:karpathy:scores');
        log.ok(`Found ${Object.keys(karpathyScores).length} Karpathy score entries`);

        let rank = 1;
        for (const [fileKey, scoreJson] of Object.entries(karpathyScores)) {
          const scoreData = JSON.parse(scoreJson);
          const blend = scoreData.blend || 0;

          // Try to match file path to packet_key (fuzzy matching)
          const matchResult = await client.query(
            `SELECT packet_key FROM atlas_higher_hop_index
             WHERE file_path ILIKE $1 LIMIT 1`,
            [`%${fileKey}%`]
          );

          if (matchResult.rows.length > 0) {
            const packetKey = matchResult.rows[0].packet_key;

            const updateResult = await client.query(
              `UPDATE atlas_higher_hop_index
               SET gpu_karpathy_key = $1, gpu_karpathy_rank = $2
               WHERE packet_key = $3 AND gpu_karpathy_key IS NULL`,
              [`gpu:karpathy:scores`, rank, packetKey]
            );

            if (updateResult.rowCount > 0) {
              karpathyDiscovered++;
            }
          }

          rank++;
        }

        log.ok(`Linked ${karpathyDiscovered} Karpathy entries to bridge table`);
      } catch (err) {
        log.info(`Karpathy discovery skipped: ${err.message}`);
      }

      log.info('');

      // Audit results
      const auditResult = await client.query(`
        SELECT
          COUNT(CASE WHEN bifrost_key IS NOT NULL THEN 1 END) as bifrost_linked,
          COUNT(CASE WHEN gpu_karpathy_key IS NOT NULL THEN 1 END) as karpathy_linked,
          COUNT(*) as total
        FROM atlas_higher_hop_index
      `);

      const audit = auditResult.rows[0];
      log.ok(`Redis discovery audit:`);
      log.ok(`  Bifrost cached: ${audit.bifrost_linked}/${audit.total}`);
      log.ok(`  Karpathy ranked: ${audit.karpathy_linked}/${audit.total}`);
      log.ok(`  Note: Uncached rows are expected (not all packets in hot cache)`);

      log.ok('');
      log.ok('========== Phase 16-H.6 COMPLETE ==========');
      log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    } finally {
      await client.release();
    }

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
