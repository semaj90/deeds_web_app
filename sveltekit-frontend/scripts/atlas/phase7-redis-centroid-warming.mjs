#!/usr/bin/env node
/**
 * Phase 7: Redis Centroid Cache Warming
 *
 * Warms Redis with SOM centroids after Phase 6 clustering completes.
 * Centroids cached by (som_row, som_col) for ACP inverse HNSW lookups.
 *
 * Usage:
 *   npm run atlas:phase7:centroid:warm:dry
 *   npm run atlas:phase7:centroid:warm:apply
 *   npm run atlas:phase7:centroid:health
 *
 * Cache key pattern: centroid:{row}:{col} = JSONB { centroid: float32[], embedding_ids: [int] }
 * TTL: 24h (centroids stable across SOM retrains)
 */

import Redis from 'ioredis';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');
const HEALTH_CHECK = process.argv.includes('--health');
const APPLY = process.argv.includes('--apply');

const SOM_ROWS = 20;
const SOM_COLS = 20;
const CENTROID_TTL = 86400; // 24 hours
const BATCH_SIZE = 50;

async function main() {
  console.log('\n🔥 Phase 7: Redis Centroid Cache Warming\n');

  // Redis client
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  // Postgres client
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
      // Health check mode: verify existing centroids
      console.log('[HEALTH] Checking existing centroids...\n');
      let existingCount = 0;

      for (let r = 0; r < SOM_ROWS; r++) {
        for (let c = 0; c < SOM_COLS; c++) {
          const key = `centroid:${r}:${c}`;
          const exists = await redis.exists(key);
          if (exists) existingCount++;
        }
      }

      console.log(`  Existing centroids: ${existingCount}/${SOM_ROWS * SOM_COLS}`);
      console.log(`  Coverage: ${(existingCount / (SOM_ROWS * SOM_COLS) * 100).toFixed(1)}%\n`);

      if (existingCount > 0) {
        const sample = await redis.get(`centroid:0:0`);
        if (sample) {
          const parsed = JSON.parse(sample);
          console.log(`[SAMPLE] Centroid 0:0:\n  embedding_ids: ${parsed.embedding_ids.slice(0, 5).join(',')}...\n  centroid_dim: ${parsed.centroid.length}\n`);
        }
      }

      process.exit(0);
    }

    // Fetch SOM assignments from Postgres
    console.log('[LOAD] Fetching SOM assignments from Postgres...\n');
    const result = await pool.query(`
      SELECT
        som_bmu_row,
        som_bmu_col,
        ARRAY_AGG(DISTINCT id) as chunk_ids,
        COUNT(*) as count
      FROM codebase_chunk_index
      WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL
      GROUP BY som_bmu_row, som_bmu_col
      ORDER BY som_bmu_row, som_bmu_col
    `);

    const somAssignments = result.rows;
    console.log(`  ✓ Loaded ${somAssignments.length} SOM cells\n`);

    if (DRY_RUN) {
      console.log('[DRY-RUN] Preview (first 5 cells):\n');
      for (let i = 0; i < Math.min(5, somAssignments.length); i++) {
        const cell = somAssignments[i];
        console.log(`  Cell (${cell.som_row}, ${cell.som_col}): ${cell.count} chunks`);
      }
      console.log(`\n  Would warm ${somAssignments.length} cells\n`);
      process.exit(0);
    }

    // Load embeddings from Postgres (for centroid computation)
    console.log('[LOAD] Loading embeddings for centroid computation...\n');
    const embeddingResult = await pool.query(`
      SELECT
        id,
        qdrant_id,
        content_embedding
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      LIMIT 52235
    `);

    const embeddingMap = new Map();
    for (const row of embeddingResult.rows) {
      let embedding;
      if (typeof row.content_embedding === 'string') {
        const parsed = row.content_embedding
          .slice(1, -1)
          .split(',')
          .map(s => parseFloat(s.trim()))
          .slice(0, 384);
        embedding = new Float32Array(parsed);
      } else if (Array.isArray(row.content_embedding)) {
        embedding = new Float32Array(row.content_embedding.slice(0, 384));
      }
      if (embedding) {
        embeddingMap.set(row.id, Array.from(embedding));
      }
    }

    console.log(`  ✓ Loaded ${embeddingMap.size} embeddings\n`);

    // Warm Redis with centroids
    console.log('[WARM] Computing and storing centroids...\n');
    let storedCount = 0;
    let failedCount = 0;

    for (const cell of somAssignments) {
      try {
        // Compute centroid as mean of embeddings in cell
        const cellEmbeddings = cell.chunk_ids
          .map(id => embeddingMap.get(id))
          .filter(e => e !== undefined);

        if (cellEmbeddings.length === 0) {
          failedCount++;
          continue;
        }

        // Mean centroid (deterministic)
        const centroid = new Float32Array(384);
        for (const emb of cellEmbeddings) {
          for (let i = 0; i < 384; i++) {
            centroid[i] += emb[i];
          }
        }
        for (let i = 0; i < 384; i++) {
          centroid[i] /= cellEmbeddings.length;
        }

        // Store in Redis
        const key = `centroid:${cell.som_bmu_row}:${cell.som_bmu_col}`;
        const value = JSON.stringify({
          centroid: Array.from(centroid),
          embedding_ids: cell.chunk_ids,
          som_row: cell.som_row,
          som_col: cell.som_col,
          count: cell.count,
          computed_at: new Date().toISOString()
        });

        await redis.setex(key, CENTROID_TTL, value);
        storedCount++;

        if (storedCount % BATCH_SIZE === 0) {
          console.log(`  ✓ Stored ${storedCount}/${somAssignments.length} centroids`);
        }
      } catch (err) {
        failedCount++;
        console.error(`  ❌ Error computing cell (${cell.som_bmu_row}, ${cell.som_bmu_col}): ${err.message}`);
      }
    }

    console.log(`\n✅ Stored ${storedCount} centroids`);
    if (failedCount > 0) {
      console.log(`⚠️  Failed: ${failedCount}`);
    }
    console.log(`\n📊 Coverage: ${(storedCount / (SOM_ROWS * SOM_COLS) * 100).toFixed(1)}%\n`);

    // Verify cache
    console.log('[VERIFY] Checking Redis cache...\n');
    let verifyCount = 0;
    for (let r = 0; r < SOM_ROWS; r++) {
      for (let c = 0; c < SOM_COLS; c++) {
        const key = `centroid:${r}:${c}`;
        const exists = await redis.exists(key);
        if (exists) verifyCount++;
      }
    }

    console.log(`  Total cached centroids: ${verifyCount}/${SOM_ROWS * SOM_COLS}`);
    console.log(`  Cache hit rate: ${(verifyCount / (SOM_ROWS * SOM_COLS) * 100).toFixed(1)}%\n`);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Phase 7 Centroid Cache Warming Complete');
    console.log(`  - ${storedCount} centroids cached in Redis`);
    console.log(`  - TTL: ${CENTROID_TTL}s (24 hours)`);
    console.log(`  - Ready for ACP A2A inverse HNSW queries`);
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
