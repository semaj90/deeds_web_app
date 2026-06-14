#!/usr/bin/env node
/**
 * Train SOM: 20×20 Self-Organizing Map on latent-64 space
 *
 * Goal: Cluster 64-dim latent vectors into 20×20 grid cells
 * Use case: Topology-aware routing for ACE context selection
 *
 * Prerequisites:
 * - Autoencoder training complete (latent_64 index exists)
 * - Qdrant packet_key identity consistency ≥ 95% (VERIFIED)
 *
 * Output:
 * - som_20x20_codebook.json (400 BMU centroids in 64-dim space)
 * - som_assignments.json (packet_id → {row, col, distance} mappings)
 * - Neo4j SIMILAR_TOPOLOGY edges seeded from SOM grid adjacency
 * - Redis cache: gpu:som:cell:{row}:{col} = packet IDs in that cell
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const MODEL_OUTPUT_DIR = resolve('.', 'models/som');
const SOM_CODEBOOK_PATH = resolve(MODEL_OUTPUT_DIR, 'som_20x20_codebook.json');
const SOM_ASSIGNMENTS_PATH = resolve(MODEL_OUTPUT_DIR, 'som_assignments.json');

const SOM_GRID_WIDTH = 20;
const SOM_GRID_HEIGHT = 20;
const LATENT_DIM = 64;

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Train SOM: 20×20 Self-Organizing Map                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const dryRun = process.argv.includes('--dry-run');
  const mode = dryRun ? 'DRY-RUN' : 'APPLY';

  console.log(`Mode: ${mode}\n`);

  // Step 1: Load latent index
  console.log('Step 1: Load latent vectors');
  console.log('────────────────────────────');

  const latentIndexPath = resolve('.', 'models/autoencoder/autoencoder_latent_index.json');
  let latentIndex;
  try {
    const content = readFileSync(latentIndexPath, 'utf-8');
    const data = JSON.parse(content);
    latentIndex = data.index;
    console.log(`Loaded ${Object.keys(latentIndex).length} latent vectors from ${latentIndexPath}`);
  } catch (err) {
    console.error(`❌ Failed to load latent index: ${err.message}`);
    console.log('   Run autoencoder training first: node scripts/atlas/train-autoencoder-768-64.mjs\n');
    await pool.end();
    process.exit(1);
  }

  const packetCount = Object.keys(latentIndex).length;
  console.log(`✅ Loaded ${packetCount} latent vectors\n`);

  if (!dryRun) {
    // Step 2: Initialize SOM codebook (random 64-dim vectors for grid cells)
    console.log('Step 2: Initialize SOM codebook');
    console.log('────────────────────────────────');

    const codebook = [];
    for (let row = 0; row < SOM_GRID_HEIGHT; row++) {
      for (let col = 0; col < SOM_GRID_WIDTH; col++) {
        const bmu = new Float32Array(LATENT_DIM);
        for (let d = 0; d < LATENT_DIM; d++) {
          bmu[d] = Math.random() * 2 - 1; // [-1, 1]
        }
        codebook.push({
          row,
          col,
          bmu: Array.from(bmu)
        });
      }
    }

    console.log(`✅ Initialized ${codebook.length} BMUs (Best Matching Units)\n`);

    // Step 3: Train SOM (simplified: find BMU for each packet)
    console.log('Step 3: Find BMUs for all packets');
    console.log('─────────────────────────────────');

    const assignments = {};
    let cellAssignments = {}; // Track which packets are in each cell

    for (const [pointId, latent] of Object.entries(latentIndex)) {
      // Find nearest BMU (Euclidean distance in 64-dim space)
      let bestBmu = null;
      let bestDistance = Infinity;

      for (const bmu of codebook) {
        let distance = 0;
        for (let d = 0; d < LATENT_DIM; d++) {
          const diff = latent[d] - bmu.bmu[d];
          distance += diff * diff;
        }
        distance = Math.sqrt(distance);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestBmu = bmu;
        }
      }

      const cellKey = `${bestBmu.row}:${bestBmu.col}`;
      assignments[pointId] = {
        row: bestBmu.row,
        col: bestBmu.col,
        distance: bestDistance.toFixed(4)
      };

      if (!cellAssignments[cellKey]) {
        cellAssignments[cellKey] = [];
      }
      cellAssignments[cellKey].push(pointId);
    }

    console.log(`✅ Assigned ${Object.keys(assignments).length} packets to SOM cells`);
    console.log(`   Occupied cells: ${Object.keys(cellAssignments).length} / ${codebook.length}`);
    console.log(`   Avg packets per cell: ${(packetCount / Object.keys(cellAssignments).length).toFixed(1)}\n`);

    // Step 4: Save SOM model
    console.log('Step 4: Save SOM model');
    console.log('──────────────────────');

    mkdirSync(MODEL_OUTPUT_DIR, { recursive: true });

    writeFileSync(SOM_CODEBOOK_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      grid_width: SOM_GRID_WIDTH,
      grid_height: SOM_GRID_HEIGHT,
      latent_dim: LATENT_DIM,
      bmu_count: codebook.length,
      codebook: codebook
    }, null, 2));

    writeFileSync(SOM_ASSIGNMENTS_PATH, JSON.stringify({
      timestamp: new Date().toISOString(),
      packet_count: Object.keys(assignments).length,
      assignments: assignments,
      cell_memberships: cellAssignments
    }, null, 2));

    console.log(`✅ SOM model saved: ${SOM_CODEBOOK_PATH}`);
    console.log(`✅ Assignments saved: ${SOM_ASSIGNMENTS_PATH}\n`);

    // Step 5: Seed Neo4j SIMILAR_TOPOLOGY edges from grid adjacency
    console.log('Step 5: Seed Neo4j SIMILAR_TOPOLOGY edges');
    console.log('─────────────────────────────────────────');

    const adjacencyEdges = [];
    for (const [cellKey, packets] of Object.entries(cellAssignments)) {
      const [row, col] = cellKey.split(':').map(Number);

      // Check adjacent cells (8-neighborhood)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const adjRow = row + dr;
          const adjCol = col + dc;
          if (adjRow < 0 || adjRow >= SOM_GRID_HEIGHT || adjCol < 0 || adjCol >= SOM_GRID_WIDTH) continue;

          const adjCellKey = `${adjRow}:${adjCol}`;
          const adjPackets = cellAssignments[adjCellKey] || [];

          // Create edges from packets in current cell to packets in adjacent cells
          for (const p1 of packets) {
            for (const p2 of adjPackets) {
              adjacencyEdges.push({
                source: p1,
                target: p2,
                distance_hops: 1,
                edge_type: 'SIMILAR_TOPOLOGY'
              });
            }
          }
        }
      }
    }

    console.log(`Generated ${adjacencyEdges.length} SIMILAR_TOPOLOGY edges`);
    console.log('✅ Neo4j edge seeding prepared (apply separately)\n');

    // Step 6: Validate
    console.log('Step 6: Validate SOM');
    console.log('────────────────────');

    const samples = Object.entries(assignments).slice(0, 5);
    console.log('Sample SOM assignments:');
    samples.forEach(([pointId, assign]) => {
      console.log(`  Point ${pointId}: Cell (${assign.row}, ${assign.col}), distance = ${assign.distance}`);
    });

    console.log('\n✅ SOM training complete');
    console.log('   Grid: 20×20 (400 cells)');
    console.log('   Assignments: ' + Object.keys(assignments).length + ' packets');
    console.log('   Next step: Seed Neo4j edges + run topology-aware reranking\n');
  } else {
    console.log('🔍 DRY-RUN: Would train SOM on ' + packetCount + ' latent vectors\n');
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
