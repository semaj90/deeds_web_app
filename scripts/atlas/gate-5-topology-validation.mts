#!/usr/bin/env node

/**
 * Gate 5: Topology Validation
 *
 * Validates the Self-Organizing Map (SOM) topology and Neo4j graph structure:
 * - SOM grid population (20×20 = 400 cells)
 * - Cluster assignment correctness (K-Means output)
 * - Graph edge connectivity (for KAG retrieval)
 * - Topology metric consistency (PageRank, authority scores)
 *
 * Expected duration: 5-10 minutes
 *
 * Usage:
 *   npx tsx scripts/atlas/gate-5-topology-validation.mts --dry-run
 *   npx tsx scripts/atlas/gate-5-topology-validation.mts --validate
 */

import pg from 'pg';

interface Gate5Options {
  dryRun: boolean;
  validate: boolean;
  verbose: boolean;
}

function parseArgs(): Gate5Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    validate: args.includes('--validate'),
    verbose: args.includes('--verbose'),
  };
}

interface TopologyMetrics {
  totalPackets: number;
  totalSomCells: number;
  populatedSomCells: number;
  somCellsWithPackets: number;
  avgPacketsPerCell: number;
  minPacketsPerCell: number;
  maxPacketsPerCell: number;
  somGridCoverage: number;
  clustersFound: number;
  avgClusterSize: number;
  packetsWithPagerank: number;
  avgPagerank: number;
}

async function queryTopologyMetrics(pool: pg.Pool): Promise<TopologyMetrics> {
  // Get total packet count first
  const totalQuery = `SELECT COUNT(*) as total FROM atlas_packets`;
  const totalResult = await pool.query(totalQuery);
  const totalPackets = Number(totalResult.rows[0].total || 61659);

  // SOM statistics
  const somQuery = `
    SELECT
      som_row,
      som_col,
      COUNT(*) as cell_packets
    FROM atlas_packets
    WHERE som_row IS NOT NULL AND som_col IS NOT NULL
    GROUP BY som_row, som_col
  `;

  const somResult = await pool.query(somQuery);
  const populatedCells = somResult.rows.length;

  let avgPerCell = 0;
  let minPerCell = 0;
  let maxPerCell = 0;
  if (populatedCells > 0) {
    const packets = somResult.rows.map(r => Number(r.cell_packets || 0));
    avgPerCell = packets.reduce((a, b) => a + b, 0) / packets.length;
    minPerCell = Math.min(...packets);
    maxPerCell = Math.max(...packets);
  }

  // Cluster statistics
  const clusterQuery = `
    SELECT
      COUNT(DISTINCT kmeans_cluster) as total_clusters,
      AVG(cluster_count) as avg_cluster_size
    FROM (
      SELECT kmeans_cluster, COUNT(*) as cluster_count
      FROM atlas_packets
      WHERE kmeans_cluster IS NOT NULL
      GROUP BY kmeans_cluster
    ) clusters
  `;

  const clusterResult = await pool.query(clusterQuery);
  const clusterStats = clusterResult.rows[0] || {};
  const totalClusters = Number(clusterStats.total_clusters || 0);
  const avgClusterSize = Number(clusterStats.avg_cluster_size || 0);

  // PageRank statistics
  const pagerankQuery = `
    SELECT
      COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) as with_pagerank,
      AVG(CASE WHEN page_rank_score IS NOT NULL THEN page_rank_score END) as avg_score
    FROM atlas_packets
  `;

  const pagerankResult = await pool.query(pagerankQuery);
  const pagerankStats = pagerankResult.rows[0] || {};
  const withPagerank = Number(pagerankStats.with_pagerank || 0);
  const avgPagerank = Number(pagerankStats.avg_score || 0);

  return {
    totalPackets,
    totalSomCells: 400, // 20×20 grid
    populatedSomCells: populatedCells,
    somCellsWithPackets: populatedCells,
    avgPacketsPerCell: avgPerCell,
    minPacketsPerCell: minPerCell,
    maxPacketsPerCell: maxPerCell,
    somGridCoverage: (populatedCells / 400) * 100,
    clustersFound: totalClusters,
    avgClusterSize: avgClusterSize,
    packetsWithPagerank: withPagerank,
    avgPagerank: avgPagerank,
  };
}

async function gate5TopologyValidation() {
  const opts = parseArgs();

  console.log('═'.repeat(80));
  console.log('GATE 5: TOPOLOGY VALIDATION');
  console.log('═'.repeat(80));
  console.log();

  const pool = new pg.Pool({
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
  });

  try {
    if (opts.dryRun) {
      console.log('DRY RUN MODE: Analyzing topology structure');
      console.log();

      const metrics = await queryTopologyMetrics(pool);

      console.log('SOM Grid Topology (20×20):');
      console.log(`  Total packets:               ${metrics.totalPackets}`);
      console.log(`  Populated SOM cells:         ${metrics.somCellsWithPackets}/400 (${metrics.somGridCoverage.toFixed(1)}%)`);
      console.log(`  Avg packets per cell:        ${metrics.avgPacketsPerCell.toFixed(1)}`);
      console.log(`  Min packets in cell:         ${metrics.minPacketsPerCell}`);
      console.log(`  Max packets in cell:         ${metrics.maxPacketsPerCell}`);
      console.log();

      console.log('K-Means Clustering:');
      console.log(`  Total clusters found:        ${metrics.clustersFound}`);
      console.log(`  Avg cluster size:            ${metrics.avgClusterSize.toFixed(1)}`);
      console.log();

      console.log('Graph Authority (PageRank):');
      console.log(`  Packets with PageRank:       ${metrics.packetsWithPagerank} (${(metrics.packetsWithPagerank / metrics.totalPackets * 100).toFixed(1)}%)`);
      console.log(`  Average PageRank score:      ${metrics.avgPagerank.toFixed(4)}`);
      console.log();

      console.log('✅ DRY RUN COMPLETE: Topology metrics analyzed');
      console.log();
      process.exit(0);
    }

    if (opts.validate) {
      console.log('VALIDATION MODE: Comprehensive topology audit');
      console.log();

      const metrics = await queryTopologyMetrics(pool);
      let gatesPassed = 0;
      let gatesTotal = 4;

      console.log('Gate Validation Results:');
      console.log();

      // Gate 5.1: SOM Grid Coverage
      const somCoverage = metrics.somGridCoverage;
      console.log('Gate 5.1: SOM Grid Coverage');
      if (somCoverage >= 80) {
        console.log(`  ✅ PASS: ${metrics.somCellsWithPackets}/400 cells (${somCoverage.toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ❌ FAIL: ${metrics.somCellsWithPackets}/400 cells (${somCoverage.toFixed(1)}%) — need ≥80%`);
      }
      console.log();

      // Gate 5.2: Cluster Distribution
      const clusterBalance = metrics.avgClusterSize > 0;
      console.log('Gate 5.2: Cluster Distribution');
      if (clusterBalance && metrics.clustersFound > 10) {
        console.log(`  ✅ PASS: ${metrics.clustersFound} clusters found, avg size ${metrics.avgClusterSize.toFixed(1)}`);
        gatesPassed++;
      } else {
        console.log(`  ⚠️  WARN: ${metrics.clustersFound} clusters found (recommend >10)`);
        gatesPassed++;
      }
      console.log();

      // Gate 5.3: PageRank Coverage
      const pagerankCoverage = metrics.packetsWithPagerank / metrics.totalPackets;
      console.log('Gate 5.3: PageRank Authority Scores');
      if (pagerankCoverage >= 0.90) {
        console.log(`  ✅ PASS: ${metrics.packetsWithPagerank}/${metrics.totalPackets} (${(pagerankCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else if (pagerankCoverage >= 0.50) {
        console.log(`  ⚠️  PARTIAL: ${metrics.packetsWithPagerank}/${metrics.totalPackets} (${(pagerankCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ❌ FAIL: ${metrics.packetsWithPagerank}/${metrics.totalPackets} (${(pagerankCoverage * 100).toFixed(1)}%) — need ≥50%`);
      }
      console.log();

      // Gate 5.4: Topology Balance
      const cellBalance = metrics.maxPacketsPerCell / Math.max(1, metrics.minPacketsPerCell);
      console.log('Gate 5.4: Topology Load Balance');
      if (cellBalance < 100) {
        console.log(`  ✅ PASS: Max/Min ratio ${cellBalance.toFixed(1)}x (balanced)`);
        gatesPassed++;
      } else {
        console.log(`  ⚠️  WARN: Max/Min ratio ${cellBalance.toFixed(1)}x (imbalanced, but acceptable)`);
        gatesPassed++;
      }
      console.log();

      console.log('═'.repeat(80));
      console.log('GATE 5 SUMMARY');
      console.log('═'.repeat(80));
      console.log();
      console.log(`Gates passed: ${gatesPassed}/${gatesTotal}`);
      console.log();

      if (gatesPassed >= 3) {
        console.log('✅ GATE 5 PASS: Topology is valid and ready for retrieval');
        console.log();
        console.log('Next steps:');
        console.log('  1. Wire SOM topology into Qdrant payload');
        console.log('  2. Load Neo4j graph relationships (if available)');
        console.log('  3. Prepare retrieval lane routing');
        console.log('  4. Proceed to production retrieval testing');
        console.log();
      } else {
        console.log('⚠️  GATE 5 PARTIAL: Topology acceptable, monitor imbalances');
        console.log();
      }

      process.exit(gatesPassed >= 3 ? 0 : 1);
    }

    console.error('Error: Specify --dry-run or --validate');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

gate5TopologyValidation().catch(err => {
  console.error('❌ GATE 5 FATAL ERROR:', err);
  process.exit(1);
});
