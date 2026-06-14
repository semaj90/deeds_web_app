#!/usr/bin/env node

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const dryRun = process.argv.includes('--dry-run');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
  apiKey: process.env.QDRANT_API_KEY
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 3000)),
  enableOfflineQueue: false
});

redis.on('error', () => {});

const LINEAGE_VERSION = 'packet-identity-v2';
const REPORTS_DIR = resolve(ROOT, 'docs/reports');

async function backfillLineageVersion() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill lineage_version (packet-identity-v2)                 ║');
  console.log(`║  Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 45 : 46)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = {
    timestamp: new Date().toISOString(),
    postgres: { packets: 0, missing_before: 0, added: 0 },
    qdrant: { points: 0, missing_before: 0, updated: 0 },
    redis: { keys: 0, updated: 0 },
    mode: dryRun ? 'DRY_RUN' : 'APPLY'
  };

  try {
    // Step 1: Postgres codebase packets
    console.log('Step 1: Postgres atlas_codebase_packets...');
    const pgRes = await pool.query(`
      SELECT packet_key, metadata FROM atlas_codebase_packets
      WHERE lineage_version IS NULL
      LIMIT 1000
    `);

    results.postgres.packets = pgRes.rows.length;
    console.log(`  - Found ${pgRes.rows.length} packets missing lineage_version`);

    if (!dryRun && pgRes.rows.length > 0) {
      const updates = pgRes.rows.map(row => {
        const metadata = row.metadata || {};
        metadata.lineage_version = LINEAGE_VERSION;
        return {
          packet_key: row.packet_key,
          metadata: JSON.stringify(metadata)
        };
      });

      for (const upd of updates) {
        await pool.query(
          'UPDATE atlas_codebase_packets SET metadata = $1 WHERE packet_key = $2',
          [upd.metadata, upd.packet_key]
        );
      }
      results.postgres.added = updates.length;
      console.log(`  ✅ Updated ${updates.length} codebase packets\n`);
    } else if (dryRun) {
      console.log(`  DRY-RUN: Would update ${pgRes.rows.length} packets\n`);
    }

    // Step 2: Qdrant backfill (streaming, no memory accumulation)
    console.log('Step 2: Qdrant codebase_chunks_768...');
    let offset = null;
    const limit = 100;
    let totalMissing = 0;
    let scannedCount = 0;
    const BATCH_SIZE = 50;
    let batchBuffer = [];

    while (true) {
      const scroll = await qdrant.scroll('codebase_chunks_768', {
        limit,
        offset,
        with_payload: true,
        with_vectors: false
      });

      if (!scroll.points || scroll.points.length === 0) break;

      for (const point of scroll.points) {
        scannedCount++;
        if (!point.payload?.lineage_version) {
          totalMissing++;
          batchBuffer.push(point);

          // Upsert immediately when batch fills (don't accumulate in memory)
          if (batchBuffer.length >= BATCH_SIZE) {
            if (!dryRun) {
              const pointIds = batchBuffer.map(p => p.id);
              await qdrant.setPayload('codebase_chunks_768', {
                payload: { lineage_version: LINEAGE_VERSION },
                points: pointIds
              });
              results.qdrant.updated += batchBuffer.length;
            }
            batchBuffer = [];
          }
        }
      }

      // Use next_page_offset from Qdrant response to continue scrolling
      offset = scroll.next_page_offset;
      console.log(`  Scanned ${scannedCount} points, found ${totalMissing} missing so far...`);
    }

    // Upsert remaining batch
    if (batchBuffer.length > 0) {
      if (!dryRun) {
        const pointIds = batchBuffer.map(p => p.id);
        await qdrant.setPayload('codebase_chunks_768', {
          payload: { lineage_version: LINEAGE_VERSION },
          points: pointIds
        });
        results.qdrant.updated += batchBuffer.length;
      }
    }

    results.qdrant.missing_before = totalMissing;
    console.log(`  - Found ${totalMissing} points missing lineage_version`);

    if (!dryRun && results.qdrant.updated > 0) {
      console.log(`  ✅ Updated ${results.qdrant.updated} points\n`);
    } else if (dryRun) {
      console.log(`  DRY-RUN: Would update ${totalMissing} points\n`);
    }

    // Step 3: Redis backfill (Karpathy scores)
    console.log('Step 3: Redis gpu:karpathy:scores...');
    await redis.connect();

    const redisKeys = await redis.hgetall('gpu:karpathy:scores');
    results.redis.keys = Object.keys(redisKeys).length;
    console.log(`  - Sampled ${results.redis.keys} Karpathy scores`);

    if (!dryRun && results.redis.keys > 0) {
      for (const [file, jsonStr] of Object.entries(redisKeys)) {
        try {
          const data = JSON.parse(jsonStr);
          data.lineage_version = LINEAGE_VERSION;
          await redis.hset('gpu:karpathy:scores', file, JSON.stringify(data));
          results.redis.updated++;
        } catch {
          // Skip corrupted entries
        }
      }
      console.log(`  ✅ Updated ${results.redis.updated} keys\n`);
    } else if (dryRun) {
      console.log(`  DRY-RUN: Would update ${results.redis.keys} keys\n`);
    }

    // Step 4: Write report
    console.log('Step 4: Writing report...');
    mkdirSync(REPORTS_DIR, { recursive: true });

    writeFileSync(
      resolve(REPORTS_DIR, 'lineage-version-backfill.json'),
      JSON.stringify(results, null, 2)
    );

    console.log(`✅ Report: docs/reports/lineage-version-backfill.json\n`);

    // Step 5: Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  BACKFILL SUMMARY                                              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Postgres: ${results.postgres.added} packets updated`);
    console.log(`Qdrant:   ${results.qdrant.updated} points updated`);
    console.log(`Redis:    ${results.redis.updated} keys updated`);
    console.log(`Status:   ${dryRun ? 'DRY-RUN COMPLETE' : 'BACKFILL COMPLETE'}\n`);

  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    await redis.quit().catch(() => {});
  }
}

backfillLineageVersion();
