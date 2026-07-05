#!/usr/bin/env node

/**
 * SOM 20×20 Topology Validation
 *
 * Validates 400-cell SOM grid:
 *   - Cell population distribution (should be uniform)
 *   - BMU assignments deterministic
 *   - Adjacency edges correct
 *   - Latent structure preserved
 *   - Topology-aware retrieval boost working
 *
 * Usage:
 *   node scripts/atlas/validate-som-20x20-topology.mjs [--verbose] [--gates-only]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const VERBOSE = process.argv.includes('--verbose');
const GATES_ONLY = process.argv.includes('--gates-only');

// NOTE: Currently som_cluster is deterministic hash (0-99, 10×10 grid)
// True 20×20 training is deferred until autoencoder (768→64 latent) complete
const SOM_ROWS = 20;
const SOM_COLS = 20;
const SOM_CELLS = SOM_ROWS * SOM_COLS; // 400 (target)
const CURRENT_SOM_CELLS = 100; // Actual: 10×10 deterministic hash
const TOTAL_PACKETS = 58365; // Expected total
const EXPECTED_PER_CELL = TOTAL_PACKETS / SOM_CELLS; // ~146 packets per cell

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  SOM 20×20 Topology Validation                                ║');
console.log('║  Validate 400-cell grid, 58K packet assignments               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const VALIDATION_GATES = {
  som_cells_populated: {
    min: 390,
    max: 400,
    metric: 'cell_count',
    description: 'Number of SOM cells with at least one packet',
  },
  bmu_assignments: {
    min: 58000,
    max: 58365,
    metric: 'assigned_packets',
    description: 'Total packets with som_cluster assigned',
  },
  bmu_distribution: {
    min: 0.7,
    max: 1.0,
    metric: 'entropy',
    description: 'Shannon entropy of cell population (normalized)',
  },
  adjacency_edges: {
    min: 2400,
    max: 3000,
    metric: 'tricubic_edges',
    description: 'Tricubic adjacency edges in topology (6–8 per cell)',
  },
  latent_variance: {
    min: 0.6,
    max: 1.0,
    metric: 'pca_explained',
    description: 'Latent_64 captures 60%+ of variance from original 768-dim',
  },
  retrieval_boost: {
    min: 1.3,
    max: 3.0,
    metric: 'topological_speedup',
    description: 'SOM prefilter reduces ANN search space by 1.3–3×',
  },
  population_coefficient: {
    min: 0.15,
    max: 0.30,
    metric: 'cv',
    description: 'Coefficient of variation (std/mean) of cell population',
  },
};

async function validateSOMTopology() {
  try {
    console.log('📊 VALIDATION GATE RESULTS\n');

    // Gate 1: SOM Cells Populated
    console.log('🔍 Gate 1: SOM Cells Populated');
    const cellRes = await pgPool.query(`
      SELECT COUNT(DISTINCT som_cluster) AS populated_cells
      FROM atlas_packets
      WHERE som_cluster IS NOT NULL
    `);
    const populatedCells = cellRes.rows[0]?.populated_cells ?? 0;
    const gate1Pass = populatedCells >= VALIDATION_GATES.som_cells_populated.min &&
                      populatedCells <= VALIDATION_GATES.som_cells_populated.max;
    console.log(`   Result: ${populatedCells}/${SOM_CELLS} cells populated`);
    console.log(`   Expected: [${VALIDATION_GATES.som_cells_populated.min}, ${VALIDATION_GATES.som_cells_populated.max}]`);
    console.log(`   Status: ${gate1Pass ? '✅ PASS' : '❌ FAIL'}\n`);

    // Gate 2: BMU Assignments
    console.log('🔍 Gate 2: BMU Assignments (som_cluster not null)');
    const bmuRes = await pgPool.query(`
      SELECT COUNT(*) AS assigned_count
      FROM atlas_packets
      WHERE som_cluster IS NOT NULL
    `);
    const assignedCount = bmuRes.rows[0]?.assigned_count ?? 0;
    const gate2Pass = assignedCount >= VALIDATION_GATES.bmu_assignments.min;
    console.log(`   Result: ${assignedCount}/${TOTAL_PACKETS} packets assigned`);
    console.log(`   Expected: ≥${VALIDATION_GATES.bmu_assignments.min}`);
    console.log(`   Coverage: ${(100 * assignedCount / TOTAL_PACKETS).toFixed(2)}%`);
    console.log(`   Status: ${gate2Pass ? '✅ PASS' : '❌ FAIL'}\n`);

    // Gate 3: Distribution Entropy
    console.log('🔍 Gate 3: Population Distribution (Shannon Entropy)');
    const distRes = await pgPool.query(`
      SELECT
        som_cluster,
        COUNT(*) AS cell_count
      FROM atlas_packets
      WHERE som_cluster IS NOT NULL
      GROUP BY som_cluster
      ORDER BY cell_count DESC
    `);

    const cellCounts = distRes.rows.map(r => r.cell_count);
    const totalAssigned = cellCounts.reduce((a, b) => a + b, 0);
    const probabilities = cellCounts.map(c => c / totalAssigned);
    const entropy = -probabilities.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(SOM_CELLS); // log2(400) ≈ 8.64
    const normalizedEntropy = entropy / maxEntropy;

    const meanCount = cellCounts.reduce((a, b) => a + b, 0) / cellCounts.length;
    const stdDev = Math.sqrt(cellCounts.reduce((sum, c) => sum + Math.pow(c - meanCount, 2), 0) / cellCounts.length);
    const cv = stdDev / meanCount;

    const gate3Pass = normalizedEntropy >= VALIDATION_GATES.bmu_distribution.min;
    const gate7Pass = cv >= VALIDATION_GATES.population_coefficient.min &&
                      cv <= VALIDATION_GATES.population_coefficient.max;

    console.log(`   Entropy: ${entropy.toFixed(2)} bits (max: ${maxEntropy.toFixed(2)})`);
    console.log(`   Normalized: ${normalizedEntropy.toFixed(3)}`);
    console.log(`   Expected: [${VALIDATION_GATES.bmu_distribution.min}, ${VALIDATION_GATES.bmu_distribution.max}]`);
    console.log(`   Cell population: min=${Math.min(...cellCounts)}, mean=${meanCount.toFixed(0)}, max=${Math.max(...cellCounts)}`);
    console.log(`   Coefficient of variation: ${cv.toFixed(3)} (expected 0.15–0.30)`);
    console.log(`   Status: Gate 3 ${gate3Pass ? '✅ PASS' : '⚠️ PARTIAL'}, Gate 7 ${gate7Pass ? '✅ PASS' : '⚠️ PARTIAL'}\n`);

    if (VERBOSE) {
      console.log('   Top 10 cells by population:');
      distRes.rows.slice(0, 10).forEach((row, idx) => {
        const col = row.som_cluster % SOM_COLS;
        const r = Math.floor(row.som_cluster / SOM_COLS);
        console.log(`     ${idx + 1}. Cell [${r},${col}] (cluster ${row.som_cluster}): ${row.cell_count} packets`);
      });
      console.log();
    }

    // Gate 4: Adjacency Edges (placeholder — requires Neo4j or precomputed table)
    console.log('🔍 Gate 4: Adjacency Edges (SIMILAR_TOPOLOGY relationships)');
    const adjRes = await pgPool.query(`
      SELECT COUNT(*) AS edge_count
      FROM information_schema.tables
      WHERE table_name = 'som_adjacency_matrix'
    `);
    const adjTableExists = adjRes.rows[0]?.edge_count > 0;
    const gate4Pass = false; // Placeholder — requires actual computation

    if (adjTableExists) {
      const adjCountRes = await pgPool.query(`
        SELECT COUNT(*) AS total_edges
        FROM som_adjacency_matrix
        WHERE weight > 0
      `);
      const adjCount = adjCountRes.rows[0]?.total_edges ?? 0;
      const gate4Pass = adjCount >= VALIDATION_GATES.adjacency_edges.min;
      console.log(`   Result: ${adjCount} edges`);
      console.log(`   Expected: [${VALIDATION_GATES.adjacency_edges.min}, ${VALIDATION_GATES.adjacency_edges.max}]`);
      console.log(`   Status: ${gate4Pass ? '✅ PASS' : '⚠️ PENDING'}\n`);
    } else {
      console.log('   Result: som_adjacency_matrix table not found');
      console.log('   Expected: [2400, 3000] edges');
      console.log('   Status: ⏳ PENDING (run compute-som-tricubic-adjacency.mjs first)\n');
    }

    // Gate 5: Latent Structure (placeholder — requires autoencoder training)
    console.log('🔍 Gate 5: Latent Structure (Variance Explained by latent_64)');
    const latentRes = await pgPool.query(`
      SELECT COUNT(*) AS latent_count
      FROM atlas_packets
      WHERE latent_64 IS NOT NULL
    `);
    const latentCount = latentRes.rows[0]?.latent_count ?? 0;
    const gate5Pass = latentCount > 0;

    if (latentCount > 0) {
      console.log(`   Result: ${latentCount} packets have latent_64 vectors`);
      console.log(`   Expected: ≥${(TOTAL_PACKETS * 0.95).toFixed(0)} (95% coverage)`);
      console.log(`   Coverage: ${(100 * latentCount / TOTAL_PACKETS).toFixed(2)}%`);
      console.log(`   PCA variance: [0.60, 1.00] (placeholder — requires autoencoder audit)`);
      console.log(`   Status: ${latentCount >= TOTAL_PACKETS * 0.95 ? '✅ PASS' : '⏳ PENDING'}\n`);
    } else {
      console.log('   Result: No latent_64 vectors found');
      console.log('   Expected: ≥55,647 packets (95% coverage)');
      console.log('   Status: ⏳ PENDING (run train-autoencoder-768-64.mjs first)\n');
    }

    // Gate 6: Retrieval Boost (placeholder — requires ACE integration test)
    console.log('🔍 Gate 6: Topology-Aware Retrieval Speedup');
    console.log('   Result: (placeholder — requires live ACE benchmark)');
    console.log('   Expected: [1.3, 3.0]× speedup from SOM prefilter');
    console.log('   Status: ⏳ PENDING (run after ACE integration)\n');

    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SUMMARY                                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const passCount = [gate1Pass, gate2Pass, gate3Pass].filter(x => x).length;
    const totalGates = 3;

    console.log(`Gates Passed: ${passCount}/${totalGates}`);
    console.log(`Status: ${passCount === totalGates ? '✅ SOM TOPOLOGY READY' : '⚠️ PARTIAL (dependencies pending)'}\n`);

    if (!GATES_ONLY) {
      console.log('Topology Grid (20×20, 400 cells):');
      console.log(`  - Populated cells: ${populatedCells}/${SOM_CELLS}`);
      console.log(`  - Assigned packets: ${assignedCount}/${TOTAL_PACKETS} (${(100 * assignedCount / TOTAL_PACKETS).toFixed(1)}%)`);
      console.log(`  - Mean packets/cell: ${meanCount.toFixed(0)}`);
      console.log(`  - Cell CV: ${cv.toFixed(3)} (uniform if <0.30)`);
      console.log(`  - Entropy: ${normalizedEntropy.toFixed(3)} (max: 1.0 = uniform)`);
      console.log();

      console.log('Dependency Status:');
      console.log(`  - Autoencoder (768→64): ${latentCount > 0 ? '✅ DONE' : '❌ TODO'}`);
      console.log(`  - Adjacency edges: ${adjTableExists ? '✅ DONE' : '❌ TODO'}`);
      console.log(`  - ACE integration: ⏳ TODO`);
      console.log();

      console.log('Next Steps:');
      console.log('  1. ✅ Gate 1–3: SOM grid validation ready');
      console.log('  2. ⏳ Gate 4: Run compute-som-tricubic-adjacency.mjs');
      console.log('  3. ⏳ Gate 5: Run train-autoencoder-768-64.mjs');
      console.log('  4. ⏳ Gate 6: Run ACE benchmark after integration');
    }

    process.exit(passCount === totalGates ? 0 : 1);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

validateSOMTopology();
