#!/usr/bin/env node

/**
 * Phase 16: Train 20x20 Self-Organizing Map (SOM)
 *
 * Trains SOM on Qdrant embeddings, produces:
 *   - 400 cluster centroids (20×20 grid)
 *   - Redis som:cell:* (centroid storage)
 *   - atlas_topology_index: som_cluster, som_x, som_y
 *   - Qdrant payload: som_cluster tag
 *
 * Created: June 15, 2026
 * Lane: Phase 16 SOM Topology (P2)
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

redis.on('error', () => {});

const log = {
  info: (msg) => console.log(`[phase-16-som] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

const SOM_GRID_SIZE = 20; // 20x20 = 400 cells
const LEARNING_RATE = 0.1;
const NEIGHBORHOOD_SIZE = 5;
const EPOCHS = 10;

/**
 * Step 1: Fetch embeddings from Qdrant
 */
async function fetchQdrantEmbeddings() {
  log.progress('Fetching embeddings from Qdrant...');

  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const response = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Qdrant fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  const embeddings = [];
  const packetMap = new Map(); // index → packet_key

  for (const point of data.result.points || []) {
    if (point.vector && point.payload?.packet_key) {
      const idx = embeddings.length;
      embeddings.push(point.vector);
      packetMap.set(idx, point.payload.packet_key);
    }
  }

  log.ok(`Fetched ${embeddings.length} embeddings`);
  return { embeddings, packetMap };
}

/**
 * Initialize SOM grid with random centroids (Xavier init)
 */
function initializeSomGrid(embeddingDim) {
  log.progress('Initializing SOM grid...');

  const grid = [];
  const variance = Math.sqrt(1 / embeddingDim); // Xavier variance

  for (let x = 0; x < SOM_GRID_SIZE; x++) {
    for (let y = 0; y < SOM_GRID_SIZE; y++) {
      const centroid = new Array(embeddingDim)
        .fill(0)
        .map(() => (Math.random() - 0.5) * variance);

      grid.push({
        x,
        y,
        centroid,
        count: 0,
        sumVector: new Array(embeddingDim).fill(0),
      });
    }
  }

  log.ok(`Initialized ${grid.length} SOM cells`);
  return grid;
}

/**
 * Find Best Matching Unit (BMU) for a vector
 */
function findBmu(vector, grid) {
  let bestDistance = Infinity;
  let bestCell = null;

  for (const cell of grid) {
    const distance = euclideanDistance(vector, cell.centroid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCell = cell;
    }
  }

  return bestCell;
}

/**
 * Euclidean distance
 */
function euclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Train SOM using batch learning
 */
function trainSom(embeddings, grid) {
  log.progress(`Training SOM for ${EPOCHS} epochs...`);

  const embeddingDim = embeddings[0].length;
  let epoch = 0;

  for (epoch = 0; epoch < EPOCHS; epoch++) {
    // Reset batch accumulators
    for (const cell of grid) {
      cell.count = 0;
      cell.sumVector = new Array(embeddingDim).fill(0);
    }

    // Assign vectors to BMUs
    for (const vector of embeddings) {
      const bmu = findBmu(vector, grid);

      // Update BMU and neighbors
      for (const cell of grid) {
        const distance = Math.sqrt(
          Math.pow(cell.x - bmu.x, 2) + Math.pow(cell.y - bmu.y, 2)
        );

        if (distance <= NEIGHBORHOOD_SIZE) {
          const influence = Math.exp(-(distance * distance) / (2 * NEIGHBORHOOD_SIZE * NEIGHBORHOOD_SIZE));
          const lr = LEARNING_RATE * influence;

          for (let i = 0; i < embeddingDim; i++) {
            cell.sumVector[i] += lr * vector[i];
          }
          cell.count += lr;
        }
      }
    }

    // Update centroids
    for (const cell of grid) {
      if (cell.count > 0) {
        for (let i = 0; i < embeddingDim; i++) {
          cell.centroid[i] = cell.sumVector[i] / cell.count;
        }
      }
    }

    if ((epoch + 1) % Math.ceil(EPOCHS / 3) === 0) {
      log.progress(`Epoch ${epoch + 1}/${EPOCHS}`);
    }
  }

  log.ok(`SOM training complete (${EPOCHS} epochs)`);
  return grid;
}

/**
 * Map each embedding to its BMU cell
 */
function mapEmbeddingsToSom(embeddings, grid, packetMap) {
  log.progress('Mapping embeddings to SOM cells...');

  const assignments = [];

  for (let idx = 0; idx < embeddings.length; idx++) {
    const vector = embeddings[idx];
    const bmu = findBmu(vector, grid);
    const packetKey = packetMap.get(idx);

    assignments.push({
      packetKey,
      som_cluster: bmu.x + bmu.y * SOM_GRID_SIZE, // Linear index
      som_x: bmu.x,
      som_y: bmu.y,
    });
  }

  log.ok(`Mapped ${assignments.length} embeddings to SOM`);
  return assignments;
}

/**
 * Step 2: Persist SOM centroids to Redis
 */
async function persistSomToRedis(grid) {
  log.progress('Persisting SOM centroids to Redis...');

  await redis.connect();

  try {
    for (const cell of grid) {
      const key = `som:cell:${cell.x}:${cell.y}`;
      const value = JSON.stringify({
        x: cell.x,
        y: cell.y,
        centroid: cell.centroid,
      });

      await redis.setex(key, 86400, value); // 24h TTL
    }

    log.ok(`Persisted ${grid.length} SOM centroids to Redis`);
  } finally {
    await redis.quit();
  }
}

/**
 * Step 3: Update atlas_topology_index with SOM assignments
 */
async function updateTopologyIndexWithSom(assignments) {
  log.progress('Updating atlas_topology_index with SOM assignments...');

  const client = await pool.connect();

  try {
    for (const { packetKey, som_cluster, som_x, som_y } of assignments) {
      await client.query(
        `UPDATE atlas_topology_index
         SET som_cluster = $1, som_x = $2, som_y = $3, updated_at = NOW()
         WHERE packet_key = $4`,
        [som_cluster, som_x, som_y, packetKey]
      );
    }

    log.ok(`Updated ${assignments.length} rows in atlas_topology_index`);
  } finally {
    await client.release();
  }
}

/**
 * Step 4: Update Qdrant payloads with som_cluster tag
 */
async function updateQdrantWithSom(assignments) {
  log.progress('Updating Qdrant payloads with som_cluster...');

  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

  // Create packet_key → som_cluster map
  const somMap = new Map();
  for (const { packetKey, som_cluster } of assignments) {
    somMap.set(packetKey, som_cluster);
  }

  // Fetch all points and update in batches
  const response = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json();
  const updates = [];

  for (const point of data.result.points || []) {
    const packetKey = point.payload?.packet_key;
    const somCluster = somMap.get(packetKey);

    if (somCluster !== undefined) {
      updates.push({
        id: point.id,
        payload: {
          ...point.payload,
          som_cluster: somCluster,
        },
      });
    }
  }

  // Upsert updates (batches of 100)
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);

    const upsertResponse = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: batch.map((u) => ({
          id: u.id,
          payload: u.payload,
        })),
      }),
    });

    if (!upsertResponse.ok) {
      throw new Error(`Qdrant upsert failed: ${upsertResponse.statusText}`);
    }

    log.progress(`Upserted ${Math.min(100, updates.length - i)} Qdrant points`);
  }

  log.ok(`Updated ${updates.length} Qdrant points with som_cluster tag`);
}

/**
 * Verify SOM integrity
 */
async function verifySom() {
  log.progress('Verifying SOM integrity...');

  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT som_cluster) as unique_clusters,
        COUNT(DISTINCT som_x) as unique_x,
        COUNT(DISTINCT som_y) as unique_y,
        MIN(som_cluster) as min_cluster,
        MAX(som_cluster) as max_cluster
      FROM atlas_topology_index
      WHERE som_cluster IS NOT NULL
    `);

    const row = result.rows[0];
    log.ok(`SOM Verification: ${row.total} packets, ${row.unique_clusters} clusters, grid ${row.unique_x}×${row.unique_y}`);

    if (row.max_cluster >= SOM_GRID_SIZE * SOM_GRID_SIZE) {
      log.error(`WARNING: cluster index out of bounds (max ${row.max_cluster} >= ${SOM_GRID_SIZE * SOM_GRID_SIZE})`);
    }

    return row;
  } finally {
    await client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16 Train SOM 20×20 ==========');

    // Step 1: Fetch embeddings
    const { embeddings, packetMap } = await fetchQdrantEmbeddings();

    // Step 2: Initialize and train SOM
    let grid = initializeSomGrid(embeddings[0].length);
    grid = trainSom(embeddings, grid);

    // Step 3: Map embeddings to SOM
    const assignments = mapEmbeddingsToSom(embeddings, grid, packetMap);

    // Step 4: Persist to Redis
    await persistSomToRedis(grid);

    // Step 5: Update Postgres
    await updateTopologyIndexWithSom(assignments);

    // Step 6: Update Qdrant payloads
    await updateQdrantWithSom(assignments);

    // Verify
    await verifySom();

    log.ok('========== Phase 16 SOM Training Complete ==========');
    log.info(`Total time: ${(Date.now() - startTime) / 1000}s`);
    log.info(`Grid: ${SOM_GRID_SIZE}×${SOM_GRID_SIZE} = ${grid.length} cells`);
    log.info(`Packets mapped: ${assignments.length}`);

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
