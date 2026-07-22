#!/usr/bin/env node
/**
 * Phase 2, Step 10: SOM (Self-Organizing Map) 20×20 Training
 *
 * - Train 20×20 grid (400 cells) on 5K vectors
 * - Store BMU (Best Matching Unit) mappings to Redis
 * - Use learning rate decay and Gaussian neighborhood
 *
 * Usage:
 *   npx tsx train-som-384.mts [--verbose]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'duckdb-async';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, '../../data/atlas-ml/snapshot_5k_384dim.parquet');

const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;
const TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT;

interface SOMMembership {
  packet_key: string;
  bmu_row: number;
  bmu_col: number;
}

/**
 * Euclidean distance
 */
function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

async function trainSOM(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');

  const db = new Database(':memory:');
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
  });

  try {
    if (verbose) console.log('[SOM] Loading vectors from snapshot...');

    const pointsQuery = `
      SELECT
        packet_key,
        embedding
      FROM read_parquet('${SNAPSHOT_PATH}')
      GROUP BY packet_key, embedding
      ORDER BY packet_key
    `;

    const rows = (await db.all(pointsQuery)) as any[];

    if (rows.length === 0) {
      throw new Error('No points found in snapshot');
    }

    if (verbose) console.log(`[SOM] Loaded ${rows.length} points`);

    const points = rows.map((r) => ({ packet_key: r.packet_key, vector: r.embedding as number[] }));

    // Initialize SOM grid with random vectors
    if (verbose) console.log(`[SOM] Initializing ${TOTAL_CELLS} grid cells...`);

    const som = new Array(GRID_HEIGHT);
    for (let i = 0; i < GRID_HEIGHT; i++) {
      som[i] = new Array(GRID_WIDTH);
      for (let j = 0; j < GRID_WIDTH; j++) {
        // Random initialization from first 100 points
        const randomPoint = points[Math.floor(Math.random() * Math.min(100, points.length))];
        som[i][j] = [...randomPoint.vector];
      }
    }

    // SOM training
    const maxEpochs = 100;
    const initialLearningRate = 0.5;
    const initialSigma = Math.sqrt(GRID_WIDTH * GRID_WIDTH + GRID_HEIGHT * GRID_HEIGHT) / 2;

    if (verbose) console.log(`[SOM] Training ${maxEpochs} epochs with ${points.length} points...`);

    for (let epoch = 0; epoch < maxEpochs; epoch++) {
      const learningRate = initialLearningRate * Math.exp(-epoch / maxEpochs);
      const sigma = initialSigma * Math.exp(-epoch / maxEpochs);

      for (const point of points) {
        // Find BMU (Best Matching Unit)
        let minDist = Infinity;
        let bmuRow = 0;
        let bmuCol = 0;

        for (let i = 0; i < GRID_HEIGHT; i++) {
          for (let j = 0; j < GRID_WIDTH; j++) {
            const dist = distance(point.vector, som[i][j]);
            if (dist < minDist) {
              minDist = dist;
              bmuRow = i;
              bmuCol = j;
            }
          }
        }

        // Update grid cells
        for (let i = 0; i < GRID_HEIGHT; i++) {
          for (let j = 0; j < GRID_WIDTH; j++) {
            const gridDist = Math.sqrt((i - bmuRow) * (i - bmuRow) + (j - bmuCol) * (j - bmuCol));
            const influence = Math.exp(-(gridDist * gridDist) / (2 * sigma * sigma));
            const rate = learningRate * influence;

            for (let d = 0; d < point.vector.length; d++) {
              som[i][j][d] += rate * (point.vector[d] - som[i][j][d]);
            }
          }
        }
      }

      if (verbose && (epoch + 1) % 20 === 0) {
        console.log(`  - Epoch ${epoch + 1} / ${maxEpochs}`);
      }
    }

    // Compute final BMU assignments
    if (verbose) console.log('[SOM] Computing final BMU assignments...');

    const assignments: SOMMembership[] = [];

    for (const point of points) {
      let minDist = Infinity;
      let bmuRow = 0;
      let bmuCol = 0;

      for (let i = 0; i < GRID_HEIGHT; i++) {
        for (let j = 0; j < GRID_WIDTH; j++) {
          const dist = distance(point.vector, som[i][j]);
          if (dist < minDist) {
            minDist = dist;
            bmuRow = i;
            bmuCol = j;
          }
        }
      }

      assignments.push({
        packet_key: point.packet_key,
        bmu_row: bmuRow,
        bmu_col: bmuCol,
      });
    }

    // Store BMU assignments and centroids to Redis
    if (verbose) console.log('[SOM] Storing SOM to Redis...');

    // Store grid centroids
    for (let i = 0; i < GRID_HEIGHT; i++) {
      for (let j = 0; j < GRID_WIDTH; j++) {
        const key = `som:centroid:${i}:${j}`;
        const value = JSON.stringify(som[i][j]);
        await redis.setex(key, 86400, value);
      }
    }

    // Store BMU mappings
    const pipeline = redis.pipeline();
    for (const assignment of assignments) {
      const key = `som:bmu:${assignment.packet_key}`;
      const value = `${assignment.bmu_row},${assignment.bmu_col}`;
      pipeline.setex(key, 86400, value);
    }
    await pipeline.exec();

    // Store metadata
    const cellCount = new Set(assignments.map((a) => `${a.bmu_row},${a.bmu_col}`)).size;
    await redis.hset(
      'som:metadata',
      'grid_width',
      `${GRID_WIDTH}`,
      'grid_height',
      `${GRID_HEIGHT}`,
      'total_cells',
      `${TOTAL_CELLS}`,
      'populated_cells',
      `${cellCount}`,
      'total_points',
      `${points.length}`,
      'timestamp',
      new Date().toISOString()
    );

    console.log('\n=== SOM Training Complete ===');
    console.log(`Grid: ${GRID_WIDTH}×${GRID_HEIGHT} (${TOTAL_CELLS} cells)`);
    console.log(`Points: ${points.length}`);
    console.log(`Populated cells: ${cellCount}`);
    console.log(`Utilization: ${((cellCount / TOTAL_CELLS) * 100).toFixed(1)}%`);
    console.log(`✅ Step 10 complete`);

    await redis.quit();
    await db.close();
  } catch (err) {
    console.error('❌ Step 10 failed:', err);
    process.exit(1);
  }
}

trainSOM();
