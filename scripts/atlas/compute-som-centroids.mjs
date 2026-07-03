#!/usr/bin/env node
/**
 * Compute SOM cell centroids from packet embeddings
 *
 * Purpose:
 *   Groups packets by SOM cell (som_row, som_col), computes mean embedding
 *   per cell, and stores centroids in Redis for BitFrost pre-filtering.
 *
 * Centroids enable:
 *   - L1 quick-reject: query vector vs centroid (fast approximate distance)
 *   - L2 semantic cache: centroid-keyed Bifrost cache for re-ranked results
 *   - L3 reranking: GPU cosine similarity within top cells only
 *
 * Usage:
 *   node scripts/atlas/compute-som-centroids.mjs [--apply] [--verbose] [--ttl=3600]
 */

import pg from 'pg';
import redis from 'ioredis';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;
const TTL_ARG = argv.find(a => a.startsWith('--ttl='));
const TTL = TTL_ARG ? parseInt(TTL_ARG.split('=')[1]) : 3600; // 1 hour default

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });
const redisClient = new redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

function embeddingToFloat32(embeddingJson) {
  try {
    const arr = JSON.parse(embeddingJson);
    return new Float32Array(arr);
  } catch (e) {
    return null;
  }
}

function computeMean(embeddings) {
  if (embeddings.length === 0) return null;

  const dim = embeddings[0].length;
  const mean = new Float32Array(dim);

  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (const emb of embeddings) {
      sum += emb[i];
    }
    mean[i] = sum / embeddings.length;
  }

  return mean;
}

async function getCellEmbeddings() {
  const result = await db.query(`
    SELECT som_row, som_col, latent_64 as embedding
    FROM atlas_packets
    WHERE latent_64 IS NOT NULL
      AND som_row IS NOT NULL
      AND som_col IS NOT NULL
    ORDER BY som_row, som_col
  `);

  // Group by (som_row, som_col)
  const cellMap = new Map();
  for (const row of result.rows) {
    const key = `${row.som_row}:${row.som_col}`;
    if (!cellMap.has(key)) {
      cellMap.set(key, { som_row: row.som_row, som_col: row.som_col, embeddings: [] });
    }

    const emb = embeddingToFloat32(row.embedding);
    if (emb) {
      cellMap.get(key).embeddings.push(emb);
    }
  }

  return cellMap;
}

async function storeCentroids(cellMap) {
  if (!APPLY) {
    log(`   [Dry-run] Would store ${cellMap.size} centroids`);
    return cellMap.size;
  }

  await redisClient.connect();
  let stored = 0;

  for (const [key, { som_row, som_col, embeddings }] of cellMap.entries()) {
    const centroid = computeMean(embeddings);
    if (!centroid) continue;

    const redisKey = `centroid:som_cell:${som_row}:${som_col}`;
    const value = JSON.stringify(Array.from(centroid));

    try {
      await redisClient.setex(redisKey, TTL, value);
      stored++;

      if (stored % 50 === 0) {
        process.stdout.write(`\r   Stored ${stored}/${cellMap.size}`);
      }
    } catch (e) {
      vlog(`❌ Failed to store ${redisKey}: ${e.message}`);
    }
  }

  process.stdout.write('\n');
  await redisClient.quit();
  return stored;
}

async function computeCentroids() {
  log(`\n═══ Compute SOM Cell Centroids ═══\n`);

  try {
    // Step 1: Group embeddings by SOM cell
    log(`1. Grouping embeddings by SOM cell...`);
    const cellMap = await getCellEmbeddings();
    log(`   ✅ Found ${cellMap.size} SOM cells with embeddings`);

    // Step 2: Compute mean per cell
    log(`\n2. Computing cell centroids...`);
    let cellsWithCentroid = 0;
    for (const cell of cellMap.values()) {
      const centroid = computeMean(cell.embeddings);
      if (centroid) {
        cell.centroid = centroid;
        cellsWithCentroid++;
      }
    }
    log(`   ✅ Computed: ${cellsWithCentroid} centroids`);

    // Step 3: Store in Redis
    log(`\n3. Storing centroids in Redis (TTL: ${TTL}s)...`);
    const stored = await storeCentroids(cellMap);
    log(`   ✅ Stored: ${stored} centroids`);

    // Step 4: Verify
    log(`\n4. Verifying storage...`);
    if (APPLY) {
      try {
        const centroidKeys = await redisClient.keys('centroid:som_cell:*');
        log(`   Centroid keys: ${centroidKeys.length}`);
      } catch (e) {
        vlog(`   (verification skipped: ${e.message})`);
      }
    }

    log(`\n✨ Done.`);
    process.exit(0);
  } catch (e) {
    log(`❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    await db.end();
  }
}

computeCentroids();
