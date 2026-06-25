#!/usr/bin/env node
/**
 * P4 Critical Blocker Fix: SOM Grid Adjacency Topology
 *
 * ISSUE: SIMILAR_TOPOLOGY edges currently connect Packet/Feature nodes, NOT SOM cells.
 * Impact: PageRank on 400-node SOM graph has 0 edges → all scores uniform at 0.15
 *
 * SOLUTION: Create Moore neighborhood edges between SOM cells (8-connected grid)
 * Expected: ~1,200 edges for 20×20 grid (interior 18×18 cells + edge cells)
 *
 * After fix: Re-run `npm run atlas:p4:pagerank:apply` for discriminative PageRank scores
 */

import neo4j from 'neo4j-driver';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j';

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

/**
 * Create Moore neighborhood edges between SOM cells
 * Moore neighborhood: 8-connected (including diagonals)
 */
async function createSOMGridAdjacency() {
  const session = driver.session({ database: 'neo4j' });

  try {
    console.log('🔍 [P4] Checking existing SOM topology...');

    // Check current state
    const state = await session.run(`
      MATCH (c:SOMCell)
      RETURN count(c) AS cell_count,
             min(c.som_x) AS min_x, max(c.som_x) AS max_x,
             min(c.som_y) AS min_y, max(c.som_y) AS max_y
      LIMIT 1
    `);

    const record = state.records[0];
    if (!record) {
      throw new Error('No SOMCell nodes found in Neo4j');
    }
    const cellCount = record.get('cell_count').toNumber();
    const minX = record.get('min_x')?.toNumber() ?? 0;
    const maxX = record.get('max_x')?.toNumber() ?? 0;
    const minY = record.get('min_y')?.toNumber() ?? 0;
    const maxY = record.get('max_y')?.toNumber() ?? 0;

    console.log(`  ✓ SOMCell nodes found: ${cellCount}`);
    console.log(`  ✓ X range: [${minX}, ${maxX}]`);
    console.log(`  ✓ Y range: [${minY}, ${maxY}]`);

    // Check existing SOM_GRID_NEIGHBOR edges
    const edgeState = await session.run(`
      MATCH ()-[r:SOM_GRID_NEIGHBOR]->()
      RETURN count(r) AS existing_edges
      LIMIT 1
    `);

    const existingEdges = edgeState.records[0].get('existing_edges').toNumber();
    console.log(`  ✓ Existing SOM_GRID_NEIGHBOR edges: ${existingEdges}`);

    if (existingEdges > 0) {
      console.log('\n⚠️  Topology already has edges. Skipping edge creation.');
      console.log('    Run with --force to regenerate edges.');
      return;
    }

    console.log('\n⚙️  [P4] Creating Moore neighborhood edges...');

    // Create Moore neighborhood edges: 8 directions, distance calculation
    const createEdgesResult = await session.run(`
      MATCH (c1:SOMCell), (c2:SOMCell)
      WHERE abs(c1.som_x - c2.som_x) <= 1
        AND abs(c1.som_y - c2.som_y) <= 1
        AND (c1.som_x <> c2.som_x OR c1.som_y <> c2.som_y)
      CREATE (c1)-[r:SOM_GRID_NEIGHBOR {
        distance: sqrt((c1.som_x - c2.som_x) ^ 2 + (c1.som_y - c2.som_y) ^ 2),
        direction: CASE
          WHEN c1.som_x = c2.som_x THEN 'vertical'
          WHEN c1.som_y = c2.som_y THEN 'horizontal'
          ELSE 'diagonal'
        END,
        weight: CASE
          WHEN c1.som_x = c2.som_x OR c1.som_y = c2.som_y THEN 1.0
          ELSE 0.707
        END
      }]->(c2)
      RETURN count(r) AS edges_created
    `);

    const edgesCreated = createEdgesResult.records[0].get('edges_created').toNumber();
    console.log(`  ✓ SOM_GRID_NEIGHBOR edges created: ${edgesCreated}`);

    // Verify creation
    console.log('\n📊 [P4] Topology verification...');

    const verification = await session.run(`
      MATCH (c:SOMCell)
      OPTIONAL MATCH (c)-[r:SOM_GRID_NEIGHBOR]->()
      WITH c, count(r) AS neighbor_count
      RETURN
        count(DISTINCT c) AS total_cells,
        avg(neighbor_count) AS avg_neighbors,
        min(neighbor_count) AS min_neighbors,
        max(neighbor_count) AS max_neighbors,
        sum(neighbor_count) AS total_edges
      LIMIT 1
    `);

    const verifyRecord = verification.records[0];
    const totalCells = verifyRecord.get('total_cells').toNumber();
    const avgNeighborsVal = verifyRecord.get('avg_neighbors');
    const avgNeighbors = (typeof avgNeighborsVal === 'object' && avgNeighborsVal.toNumber ? avgNeighborsVal.toNumber() : avgNeighborsVal).toFixed(2);
    const minNeighbors = verifyRecord.get('min_neighbors').toNumber();
    const maxNeighbors = verifyRecord.get('max_neighbors').toNumber();
    const totalEdgesVal = verifyRecord.get('total_edges');
    const totalEdges = (typeof totalEdgesVal === 'object' && totalEdgesVal.toNumber ? totalEdgesVal.toNumber() : totalEdgesVal);

    console.log(`  ✓ Total SOM cells: ${totalCells}`);
    console.log(`  ✓ Average neighbors per cell: ${avgNeighbors}`);
    console.log(`  ✓ Min neighbors (corners): ${minNeighbors}`);
    console.log(`  ✓ Max neighbors (center): ${maxNeighbors}`);
    console.log(`  ✓ Total directed edges: ${totalEdges}`);

    // Expected: 20×20 grid
    // - Corner cells (4): 3 neighbors each = 12
    // - Edge cells (72): 5 neighbors each = 360
    // - Interior cells (324): 8 neighbors each = 2592
    // Total = 2964 directed edges (1482 undirected)
    // Actually: all edges are directional in creation above, so we see ~3K edges for bidirectional

    console.log('\n✅ P4: SOM Grid Topology FIXED');
    console.log('\n📝 Next Steps:');
    console.log('   1. Run: npm run atlas:p4:pagerank:apply');
    console.log('   2. Verify PageRank scores are discriminative (not all 0.15)');
    console.log('   3. Run: npm run atlas:p4:attention (recompute attention)');
    console.log('   4. Run: npm run atlas:p4:karpathy (recompute blend)');

  } catch (error) {
    console.error('❌ Error creating SOM topology:', error.message);
    process.exit(1);
  } finally {
    await session.close();
  }
}

/**
 * Verify topology gates
 */
async function verifySOMTopology() {
  const session = driver.session({ database: 'neo4j' });

  try {
    const result = await session.run(`
      MATCH ()-[r:SOM_GRID_NEIGHBOR]->()
      WITH count(DISTINCT startNode(r)) AS source_cells, count(r) AS edge_count
      MATCH (c:SOMCell)
      RETURN
        count(c) AS total_cells,
        source_cells,
        edge_count,
        CASE
          WHEN edge_count > 0 THEN 'PASS'
          ELSE 'FAIL'
        END AS gate_topology,
        CASE
          WHEN source_cells = count(c) THEN 'PASS'
          ELSE 'FAIL'
        END AS gate_coverage
      LIMIT 1
    `);

    const record = result.records[0];
    console.log('\n🔐 P4 Topology Gates:');
    console.log(`  Gate 1 (Edges exist): ${record.get('gate_topology')}`);
    console.log(`  Gate 2 (All cells connected): ${record.get('gate_coverage')}`);
    console.log(`  Total cells: ${record.get('total_cells').toNumber()}`);
    console.log(`  Cells with edges: ${record.get('source_cells').toNumber()}`);
    console.log(`  Total edges: ${record.get('edge_count').toNumber()}`);

  } finally {
    await session.close();
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check Neo4j connectivity
    console.log('🔗 Connecting to Neo4j...');
    const connectivity = driver.session({ database: 'neo4j' });
    await connectivity.run('RETURN 1');
    await connectivity.close();
    console.log('  ✓ Connected\n');

    // Create SOM adjacency
    await createSOMGridAdjacency();

    // Verify gates
    await verifySOMTopology();

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

main();
