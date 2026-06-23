#!/usr/bin/env node
/**
 * P4 Phase 1: Create SIMILAR_TOPOLOGY edges in Neo4j
 *
 * Creates edges between SOM grid neighbors (Moore neighborhood: 8 adjacent cells).
 * Uses som_row and som_col from atlas_packets to determine adjacency.
 *
 * Usage:
 *   node scripts/atlas/create-som-topology-edges.mjs --dry-run
 *   node scripts/atlas/create-som-topology-edges.mjs --apply
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  P4 Phase 1: Create SIMILAR_TOPOLOGY Edges (SOM Grid)         ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Get SOM cells and their neighbors
async function getSOMNeighbors() {
  const result = await pool.query(`
    SELECT DISTINCT
      som_row, som_col
    FROM atlas_packets
    WHERE som_row IS NOT NULL AND som_col IS NOT NULL
    ORDER BY som_row, som_col
  `);

  const cells = result.rows;
  const cellMap = new Map();

  // Build map for O(1) lookup
  for (const cell of cells) {
    cellMap.set(`${cell.som_row},${cell.som_col}`, cell);
  }

  // For each cell, find its 8 neighbors (Moore neighborhood)
  const edges = [];
  for (const cell of cells) {
    const r = cell.som_row;
    const c = cell.som_col;

    // 8 neighbors: N, NE, E, SE, S, SW, W, NW
    const neighbors = [
      [r-1, c], [r-1, c+1], [r, c+1], [r+1, c+1],
      [r+1, c], [r+1, c-1], [r, c-1], [r-1, c-1]
    ];

    for (const [nr, nc] of neighbors) {
      if (cellMap.has(`${nr},${nc}`)) {
        // Create edge only one way to avoid duplicates
        if (`${r},${c}` < `${nr},${nc}`) {
          edges.push({ from: `${r},${c}`, to: `${nr},${nc}`, confidence: 0.95 });
        }
      }
    }
  }

  return { cells: cells.length, edges };
}

async function createNeo4jEdges(neighbors) {
  const session = driver.session();

  try {
    let edgeCount = 0;

    // Batch create edges
    const batchSize = 100;
    for (let i = 0; i < neighbors.edges.length; i += batchSize) {
      const batch = neighbors.edges.slice(i, i + batchSize);

      for (const edge of batch) {
        const [r1, c1] = edge.from.split(',').map(Number);
        const [r2, c2] = edge.to.split(',').map(Number);

        const cypher = `
          MATCH (p1:Packet {som_row: $r1, som_col: $c1})
          MATCH (p2:Packet {som_row: $r2, som_col: $c2})
          MERGE (p1)-[r:SIMILAR_TOPOLOGY {confidence: $confidence}]->(p2)
          RETURN r
        `;

        await session.run(cypher, { r1, c1, r2, c2, confidence: edge.confidence });
        edgeCount++;
      }

      process.stdout.write(`\r  Created: ${edgeCount}/${neighbors.edges.length} edges`);
    }

    console.log(`\n  ✅ ${edgeCount} edges created`);
    return edgeCount;
  } finally {
    await session.close();
  }
}

(async () => {
  try {
    console.log('📊 Step 1: Discover SOM cells and neighbors\n');
    const neighbors = await getSOMNeighbors();
    console.log(`   Found ${neighbors.cells} unique SOM cells`);
    console.log(`   Potential edges: ${neighbors.edges.length}\n`);

    if (DRY_RUN) {
      console.log('   DRY-RUN: Would create edges for all neighbors');
      console.log('   (Run with --apply to proceed)\n');
      await pool.end();
      await driver.close();
      process.exit(0);
    }

    console.log('🔗 Step 2: Create edges in Neo4j\n');
    const count = await createNeo4jEdges(neighbors);

    console.log('\n✅ P4 Phase 1 Complete\n');
    await pool.end();
    await driver.close();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
    await driver.close();
    process.exit(1);
  }
})();
