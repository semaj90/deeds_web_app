#!/usr/bin/env node
/**
 * Phase 8: Redis Centroid Cache + Qdrant Named-Vector + TensorRT Acceleration
 *
 * Architecture:
 *   40,568 chunks × 384-dim embeddings
 *     ↓
 *   SOM k-means → 400 centroids (20×20 grid)
 *     ↓
 *   Redis cache (centroid:cluster:*, TTL 24h)
 *   Qdrant named-vector 'som_64' (latent_64 dimension, optional)
 *   TensorRT batch distance (optional GPU acceleration)
 *
 * Usage:
 *   # Step 1: Cache centroids in Redis from SOM results
 *   node scripts/atlas/phase8-acceleration-cache-layer.mjs --cache-centroids --dry-run
 *   node scripts/atlas/phase8-acceleration-cache-layer.mjs --cache-centroids --apply
 *
 *   # Step 2: Enrich Qdrant with SOM topology
 *   node scripts/atlas/phase8-acceleration-cache-layer.mjs --qdrant-som --dry-run
 *   node scripts/atlas/phase8-acceleration-cache-layer.mjs --qdrant-som --apply
 *
 *   # Step 3: Benchmark TensorRT acceleration (optional)
 *   node scripts/atlas/phase8-acceleration-cache-layer.mjs --benchmark-tensorrt
 */

import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

// Config
const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

// Postgres pool
const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

// Redis client
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

// Parse args
const mode = process.argv[2];
const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: Cache Centroids in Redis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function cacheCentroids() {
  console.log(`\n📦 Step 1: Cache SOM Centroids to Redis\n`);

  try {
    await redis.connect();

    // Load SOM clustering results (from Phase 6)
    const reportPath = path.join(__dirname, '../../docs/reports/phase6-som-clustering.json');
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    const { assignments, centroids } = report;

    if (!centroids || centroids.length === 0) {
      console.error(`❌ No centroids found in ${reportPath}`);
      process.exit(1);
    }

    console.log(`  Centroids: ${centroids.length}`);
    console.log(`  Assignments: ${assignments.length}\n`);

    const TTL = 86400; // 24 hours
    let cached = 0;

    // Cache each centroid
    for (let i = 0; i < centroids.length; i++) {
      const centroid = centroids[i];
      const key = `centroid:cluster:${i}`;
      const value = JSON.stringify(centroid);

      if (isDryRun) {
        console.log(`  [DRY] SET ${key} (dim=${centroid.length}, TTL=${TTL}s)`);
      } else {
        await redis.setex(key, TTL, value);
        cached++;
      }

      if ((i + 1) % 100 === 0) {
        console.log(`  ✓ Cached ${i + 1}/${centroids.length} centroids`);
      }
    }

    if (isApply) {
      console.log(`\n  ✅ Cached ${cached} centroids to Redis (TTL 24h)\n`);
      console.log(`  Keys: centroid:cluster:0 ... centroid:cluster:399\n`);
    } else if (isDryRun) {
      console.log(`\n  [DRY-RUN] Would cache ${centroids.length} centroids\n`);
    }

  } catch (err) {
    console.error(`❌ Error:`, err.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: Enrich Qdrant with SOM Topology
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function enrichQdrantWithSOM() {
  console.log(`\n🎯 Step 2: Enrich Qdrant ${QDRANT_COLLECTION} with SOM Topology\n`);

  try {
    // Load SOM results
    const reportPath = path.join(__dirname, '../../docs/reports/phase6-som-clustering.json');
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    const { assignments } = report;
    console.log(`  SOM assignments: ${assignments.length}`);

    // Fetch chunk metadata from Postgres to get Qdrant point IDs
    const result = await pool.query(`
      SELECT id, qdrant_id
      FROM codebase_chunk_index
      WHERE qdrant_id IS NOT NULL
      ORDER BY id
      LIMIT $1
    `, [assignments.length]);

    const chunks = result.rows;
    console.log(`  Chunks with Qdrant IDs: ${chunks.length}\n`);

    let updated = 0;

    for (let i = 0; i < chunks.length && i < assignments.length; i++) {
      const chunk = chunks[i];
      const clusterId = assignments[i];
      const qdrantId = chunk.qdrant_id;

      const payload = {
        som_cluster: clusterId,
        som_bmu_row: Math.floor(clusterId / 20),
        som_bmu_col: clusterId % 20
      };

      if (isDryRun) {
        if (i < 5) {
          console.log(`  [DRY] Update Qdrant point ${qdrantId}: som_cluster=${clusterId}`);
        }
      } else {
        try {
          const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/${qdrantId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: [
                {
                  id: qdrantId,
                  payload
                }
              ]
            })
          });

          if (res.ok) {
            updated++;
          }
        } catch (err) {
          console.warn(`  ⚠️  Update failed for ${qdrantId}: ${err.message}`);
        }
      }

      if ((i + 1) % 1000 === 0) {
        console.log(`  ✓ Processed ${i + 1}/${chunks.length} chunks`);
      }
    }

    if (isApply) {
      console.log(`\n  ✅ Updated ${updated} Qdrant points with SOM topology\n`);
    } else if (isDryRun) {
      console.log(`\n  [DRY-RUN] Would update ${chunks.length} Qdrant points\n`);
    }

  } catch (err) {
    console.error(`❌ Error:`, err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: Benchmark TensorRT Acceleration (Optional)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function benchmarkTensorRT() {
  console.log(`\n⚡ Step 3: Benchmark TensorRT Acceleration\n`);

  try {
    // Try to load tensorrt_bridge.node
    let addon = null;
    try {
      addon = await import('../simd-bridge/cpp/build/Release/tensorrt_bridge.node', { assert: { type: 'addon' } });
    } catch (err) {
      console.log(`  ⚠️  TensorRT bridge not available: ${err.message}`);
      console.log(`  📌 GPU acceleration is optional; CPU baseline is canonical\n`);
      return;
    }

    console.log(`  ✅ TensorRT bridge loaded\n`);

    // Check available functions
    const functions = Object.keys(addon).filter(k => typeof addon[k] === 'function');
    console.log(`  Available GPU functions:\n`);
    functions.forEach(fn => console.log(`    - ${fn}`));

    console.log(`\n  Key functions for Phase 102:\n`);
    console.log(`    kmeansWithCentroids: Accelerate SOM k-means (Phase 6)`);
    console.log(`    trainSOM: Train SOM topology grid`);
    console.log(`    batchCosineSimilarity: Batch distance computation (reranking)\n`);

    // Benchmark parameters
    const testSize = 1000; // Sample 1000 embeddings for benchmark
    const dim = 384;

    if (addon.batchCosineSimilarity) {
      console.log(`  Benchmarking batchCosineSimilarity on ${testSize} vectors...`);

      const queryVec = new Float32Array(dim);
      const candidateVecs = [];

      for (let i = 0; i < testSize; i++) {
        const vec = new Float32Array(dim);
        for (let j = 0; j < dim; j++) {
          vec[j] = Math.random() - 0.5;
        }
        candidateVecs.push(vec);
      }

      const start = Date.now();
      const scores = addon.batchCosineSimilarity(queryVec, candidateVecs);
      const elapsed = Date.now() - start;

      console.log(`    Results: ${scores.length} scores computed in ${elapsed}ms`);
      console.log(`    Throughput: ${(testSize / (elapsed / 1000)).toFixed(0)} vectors/sec\n`);
    }

  } catch (err) {
    console.error(`❌ Benchmark error:`, err.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (!mode || (!isDryRun && !isApply && mode !== '--benchmark-tensorrt')) {
  console.error(`\n❌ Usage:`);
  console.error(`  node phase8-acceleration-cache-layer.mjs --cache-centroids [--dry-run|--apply]`);
  console.error(`  node phase8-acceleration-cache-layer.mjs --qdrant-som [--dry-run|--apply]`);
  console.error(`  node phase8-acceleration-cache-layer.mjs --benchmark-tensorrt\n`);
  process.exit(1);
}

if (mode === '--cache-centroids') {
  cacheCentroids().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--qdrant-som') {
  enrichQdrantWithSOM().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--benchmark-tensorrt') {
  benchmarkTensorRT().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error(`\n❌ Unknown mode: ${mode}\n`);
  process.exit(1);
}
