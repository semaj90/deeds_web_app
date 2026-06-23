#!/usr/bin/env node
/**
 * SOM Clustering: Train 20×20 Self-Organizing Map on Qdrant embeddings
 * Assigns each packet to nearest SOM cell (BMU = Best Matching Unit)
 * Backfills som_bmu_row, som_bmu_col to Postgres
 *
 * Usage:
 *   node scripts/atlas/train-som-backfill-coordinates.mjs --dry-run
 *   node scripts/atlas/train-som-backfill-coordinates.mjs --apply
 *   node scripts/atlas/train-som-backfill-coordinates.mjs --apply --verbose
 */

import pg from 'pg';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'codebase_chunks_768';
const SOM_GRID_SIZE = 20; // 20×20 = 400 cells
const SOM_DIMS = 768;
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  SOM Clustering: Train 20×20 Grid + Backfill Coordinates      ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Initialize SOM weights: 400 cells × 768 dimensions
// Initialize with small random values to break symmetry
function initializeSomWeights() {
  const weights = [];
  for (let i = 0; i < SOM_GRID_SIZE * SOM_GRID_SIZE; i++) {
    const cell = [];
    for (let j = 0; j < SOM_DIMS; j++) {
      cell.push(Math.random() * 0.01); // Small random init
    }
    weights.push(cell);
  }
  return weights;
}

// L2 distance between two vectors
function euclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Find Best Matching Unit (BMU) — closest SOM cell
function findBmu(embedding, weights) {
  let minDist = Infinity;
  let bmuIdx = 0;
  for (let i = 0; i < weights.length; i++) {
    const dist = euclideanDistance(embedding, weights[i]);
    if (dist < minDist) {
      minDist = dist;
      bmuIdx = i;
    }
  }
  const row = Math.floor(bmuIdx / SOM_GRID_SIZE);
  const col = bmuIdx % SOM_GRID_SIZE;
  return { row, col, idx: bmuIdx, distance: minDist };
}

// Convert linear index to grid coordinates
function indexToCoords(idx) {
  return { row: Math.floor(idx / SOM_GRID_SIZE), col: idx % SOM_GRID_SIZE };
}

// Neighborhood function: Gaussian decay around BMU
function neighborhood(bmuRow, bmuCol, nodeRow, nodeCol, sigma) {
  const distSq = (bmuRow - nodeRow) ** 2 + (bmuCol - nodeCol) ** 2;
  return Math.exp(-distSq / (2 * sigma ** 2));
}

// Training iteration
function trainSomEpoch(embeddings, weights, epoch, totalEpochs) {
  const learningRate = 0.5 * Math.exp(-(epoch / totalEpochs) * 5);
  const sigma = SOM_GRID_SIZE / 2 * Math.exp(-(epoch / totalEpochs) * 5);

  let updates = 0;
  for (const embedding of embeddings) {
    const { row: bmuRow, col: bmuCol } = findBmu(embedding, weights);

    // Update all SOM weights based on neighborhood
    for (let i = 0; i < SOM_GRID_SIZE; i++) {
      for (let j = 0; j < SOM_GRID_SIZE; j++) {
        const idx = i * SOM_GRID_SIZE + j;
        const nh = neighborhood(bmuRow, bmuCol, i, j, sigma);
        const delta = learningRate * nh;

        for (let d = 0; d < SOM_DIMS; d++) {
          weights[idx][d] += delta * (embedding[d] - weights[idx][d]);
        }
        updates++;
      }
    }
  }
  return updates;
}

// Fetch embeddings from Qdrant
async function fetchEmbeddingsFromQdrant() {
  console.log('📥 Step 1: Fetch embeddings from Qdrant\n');

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?limit=100000`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Qdrant fetch failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const embeddings = [];
  const pointIds = [];

  for (const point of data.result.points) {
    if (point.vector && Array.isArray(point.vector)) {
      embeddings.push(point.vector);
      pointIds.push(point.id);
    }
  }

  console.log(`   Fetched ${embeddings.length} embeddings from Qdrant`);
  if (embeddings.length === 0) {
    throw new Error('No embeddings found in Qdrant');
  }

  // Verify dimension
  if (embeddings[0].length !== SOM_DIMS) {
    throw new Error(`Expected ${SOM_DIMS}-dim embeddings, got ${embeddings[0].length}`);
  }

  return { embeddings, pointIds };
}

// Train SOM
function trainSom(embeddings) {
  console.log('🧠 Step 2: Train 20×20 SOM grid\n');

  const weights = initializeSomWeights();
  const epochs = 50; // Conservative: 50 epochs for stability

  for (let epoch = 0; epoch < epochs; epoch++) {
    const updates = trainSomEpoch(embeddings, weights, epoch, epochs);
    const progress = ((epoch + 1) / epochs * 100).toFixed(1);
    process.stdout.write(
      `\r   Epoch ${epoch + 1}/${epochs} (${progress}%) — ${updates} weight updates`
    );
  }
  console.log('\n');

  return weights;
}

// Assign all embeddings to SOM cells
function assignToCells(embeddings, pointIds, weights) {
  console.log('📍 Step 3: Assign embeddings to SOM cells\n');

  const assignments = [];
  const cellCount = new Map();

  for (let i = 0; i < embeddings.length; i++) {
    const { row, col } = findBmu(embeddings[i], weights);
    assignments.push({
      pointId: pointIds[i],
      somBmuRow: row,
      somBmuCol: col,
    });

    const key = `${row},${col}`;
    cellCount.set(key, (cellCount.get(key) || 0) + 1);
  }

  // Stats
  const populatedCells = cellCount.size;
  const totalCells = SOM_GRID_SIZE * SOM_GRID_SIZE;
  const avgPerCell = (assignments.length / populatedCells).toFixed(2);

  console.log(`   Assigned ${assignments.length} embeddings to ${populatedCells}/${totalCells} SOM cells`);
  console.log(`   Average embedding per cell: ${avgPerCell}`);
  console.log(`   Min per cell: ${Math.min(...cellCount.values())}`);
  console.log(`   Max per cell: ${Math.max(...cellCount.values())}\n`);

  return assignments;
}

// Backfill to Postgres
async function backfillToPostgres(assignments) {
  if (DRY_RUN) {
    console.log('💾 Step 4: Backfill to Postgres\n');
    console.log(`   DRY-RUN: Would update ${assignments.length} rows`);
    console.log(`   Sample: ${JSON.stringify(assignments.slice(0, 3), null, 2)}\n`);
    return;
  }

  console.log('💾 Step 4: Backfill to Postgres\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let updated = 0;
    const batchSize = 500;

    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);

      // Prepare VALUES clause: (qdrant_point_id, som_bmu_row, som_bmu_col)
      const values = batch
        .map((_, idx) => `($${idx * 3 + 1}::bigint, $${idx * 3 + 2}::int, $${idx * 3 + 3}::int)`)
        .join(', ');

      const params = [];
      for (const { pointId, somBmuRow, somBmuCol } of batch) {
        params.push(pointId, somBmuRow, somBmuCol);
      }

      const query = `
        UPDATE atlas_feature_map
        SET som_bmu_row = v.som_bmu_row, som_bmu_col = v.som_bmu_col
        FROM (VALUES ${values}) AS v(qdrant_point_id, som_bmu_row, som_bmu_col)
        WHERE atlas_feature_map.qdrant_point_id = v.qdrant_point_id
      `;

      const result = await client.query(query, params);
      updated += result.rowCount;

      const progress = ((i + batch.length) / assignments.length * 100).toFixed(1);
      process.stdout.write(`\r   Updated ${updated}/${assignments.length} rows (${progress}%)`);
    }

    console.log('\n');
    console.log(`   ✅ Backfill complete: ${updated} rows updated\n`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Verify backfill
async function verifyBackfill() {
  console.log('✅ Step 5: Verify backfill\n');

  const result = await pool.query(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(som_bmu_row) AS rows_with_row,
      COUNT(som_bmu_col) AS rows_with_col,
      COUNT(DISTINCT CONCAT(som_bmu_row, ',', som_bmu_col)) AS unique_cells
    FROM atlas_feature_map
    WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL
  `);

  const { total_rows, rows_with_row, rows_with_col, unique_cells } = result.rows[0];

  console.log(`   Total atlas_feature_map rows: ${total_rows}`);
  console.log(`   Rows with som_bmu_row: ${rows_with_row}`);
  console.log(`   Rows with som_bmu_col: ${rows_with_col}`);
  console.log(`   Unique SOM cells populated: ${unique_cells}\n`);

  if (rows_with_row > 0 && rows_with_col > 0) {
    console.log('✅ Backfill verified — SOM coordinates are now in Postgres\n');
    return true;
  } else {
    console.log('⚠️  WARNING: Backfill did not update any rows\n');
    return false;
  }
}

(async () => {
  try {
    const { embeddings, pointIds } = await fetchEmbeddingsFromQdrant();
    const weights = trainSom(embeddings);
    const assignments = assignToCells(embeddings, pointIds, weights);

    await backfillToPostgres(assignments);
    const verified = await verifyBackfill();

    if (!verified && !DRY_RUN) {
      console.log('⚠️  Backfill verification failed — check SQL JOIN logic\n');
      process.exit(1);
    }

    console.log('✅ SOM Clustering + Backfill Complete\n');
    console.log('   Next steps:');
    console.log('   1. Run: npm run atlas:neo4j:backfill:cell-id');
    console.log('   2. Run: npm run atlas:graph:pagerank:apply');
    console.log('   3. Run: npm run atlas:graph:attention:apply');
    console.log('   4. Run: npm run atlas:karpathy:gpu\n');

    await pool.end();
  } catch (e) {
    console.error('❌ Error:', e.message);
    if (VERBOSE) console.error(e.stack);
    await pool.end();
    process.exit(1);
  }
})();
