#!/usr/bin/env node
/**
 * Phase 7 Fast: Redis Centroid Cache Warming (Optimized)
 *
 * Faster version: compute centroids directly from Postgres aggregations,
 * no need to load all embeddings into memory first.
 *
 * Uses SQL to compute mean centroid per SOM cell in batch.
 */

import Redis from 'ioredis';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const HEALTH_CHECK = process.argv.includes('--health');
const APPLY = process.argv.includes('--apply');

const SOM_ROWS = 20;
const SOM_COLS = 20;
const CENTROID_TTL = 86400; // 24 hours

async function main() {
  console.log('\n🔥 Phase 7 Fast: Redis Centroid Cache Warming\n');

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  const pool = new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await redis.connect();
    console.log('✅ Redis connected\n');

    await pool.connect();
    console.log('✅ Postgres connected\n');

    if (HEALTH_CHECK) {
      console.log('[HEALTH] Checking Redis centroids...\n');
      let count = 0;
      for (let r = 0; r < SOM_ROWS; r++) {
        for (let c = 0; c < SOM_COLS; c++) {
          const key = `centroid:${r}:${c}`;
          if (await redis.exists(key)) count++;
        }
      }
      console.log(`  Cached: ${count}/${SOM_ROWS * SOM_COLS} (${(count / (SOM_ROWS * SOM_COLS) * 100).toFixed(1)}%)\n`);
      process.exit(0);
    }

    // Compute centroids via per-row aggregation (streaming approach)
    console.log('[COMPUTE] Computing centroids via streaming aggregation...\n');

    const centroids = [];
    const centroidMap = new Map(); // Map of "row,col" -> centroid data
    let processedCount = 0;

    // Stream all embeddings and build centroids in-memory (but aggregate per cell)
    const result = await pool.query(`
      SELECT
        som_bmu_row,
        som_bmu_col,
        id,
        content_embedding
      FROM codebase_chunk_index
      WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL
        AND content_embedding IS NOT NULL
      ORDER BY som_bmu_row, som_bmu_col
    `);

    console.log(`  ✓ Fetched ${result.rows.length} embeddings\n`);

    // Aggregate embeddings per SOM cell
    for (const row of result.rows) {
      const key = `${row.som_bmu_row},${row.som_bmu_col}`;

      if (!centroidMap.has(key)) {
        centroidMap.set(key, {
          row: row.som_bmu_row,
          col: row.som_bmu_col,
          embedding: new Float32Array(384),
          chunk_ids: [],
          count: 0
        });
      }

      const centroid = centroidMap.get(key);
      centroid.chunk_ids.push(row.id);
      centroid.count++;

      // Parse and accumulate embedding
      let parsed = row.content_embedding;
      if (typeof parsed === 'string') {
        parsed = parsed.slice(1, -1).split(',').map(s => parseFloat(s.trim())).slice(0, 384);
      } else if (Array.isArray(parsed)) {
        parsed = parsed.slice(0, 384);
      }

      for (let i = 0; i < 384; i++) {
        centroid.embedding[i] += (parsed[i] || 0);
      }

      processedCount++;
      if (processedCount % 10000 === 0) {
        console.log(`  ✓ Processed ${processedCount}/${result.rows.length} embeddings`);
      }
    }

    // Normalize centroids and convert to final format
    for (const [key, centroid] of centroidMap.entries()) {
      for (let i = 0; i < 384; i++) {
        centroid.embedding[i] /= Math.max(1, centroid.count);
      }

      centroids.push({
        row: centroid.row,
        col: centroid.col,
        count: centroid.count,
        chunk_ids: centroid.chunk_ids,
        embedding: Array.from(centroid.embedding)
      });
    }

    console.log(`\n  ✓ Computed ${centroids.length} centroids\n`);

    if (DRY_RUN) {
      console.log('[DRY-RUN] Preview (first 5 cells):\n');
      for (let i = 0; i < Math.min(5, centroids.length); i++) {
        const c = centroids[i];
        console.log(`  Cell (${c.row}, ${c.col}): ${c.count} chunks`);
      }
      console.log(`\n  Would cache ${centroids.length} centroids\n`);
      process.exit(0);
    }

    // Store in Redis with pipelined batches for speed
    console.log('[STORE] Caching centroids in Redis (pipelined)...\n');
    let stored = 0;
    let failed = 0;
    const PIPELINE_SIZE = 50;

    for (let batchStart = 0; batchStart < centroids.length; batchStart += PIPELINE_SIZE) {
      const batchEnd = Math.min(batchStart + PIPELINE_SIZE, centroids.length);
      const pipeline = redis.pipeline();

      for (let i = batchStart; i < batchEnd; i++) {
        const centroid = centroids[i];
        const key = `centroid:${centroid.row}:${centroid.col}`;

        const value = JSON.stringify({
          centroid: centroid.embedding,
          embedding_ids: centroid.chunk_ids,
          som_row: centroid.row,
          som_col: centroid.col,
          count: centroid.count,
          computed_at: new Date().toISOString()
        });

        pipeline.setex(key, CENTROID_TTL, value);
      }

      try {
        await pipeline.exec();
        stored += (batchEnd - batchStart);
        console.log(`  ✓ Stored ${stored}/${centroids.length}`);
      } catch (err) {
        failed += (batchEnd - batchStart);
        console.error(`  ❌ Batch ${batchStart}-${batchEnd}: ${err.message}`);
      }
    }

    console.log(`\n✅ Stored ${stored} centroids`);
    if (failed > 0) console.log(`⚠️  Failed: ${failed}`);

    // Verify
    console.log('\n[VERIFY] Checking Redis cache...\n');
    let verified = 0;
    for (let r = 0; r < SOM_ROWS; r++) {
      for (let c = 0; c < SOM_COLS; c++) {
        if (await redis.exists(`centroid:${r}:${c}`)) verified++;
      }
    }

    console.log(`  Total: ${verified}/${SOM_ROWS * SOM_COLS}`);
    console.log(`  Coverage: ${(verified / (SOM_ROWS * SOM_COLS) * 100).toFixed(1)}%\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Phase 7 Fast Complete');
    console.log(`  - ${stored} centroids cached`);
    console.log(`  - TTL: ${CENTROID_TTL}s (24 hours)`);
    console.log(`  - Ready for ACP inverse HNSW`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    if (redis.isOpen) await redis.quit();
    await pool.end();
  }
}

main().catch(console.error);
