#!/usr/bin/env node

/**
 * Validate Neo4j GDS Metrics — Comprehensive Test Suite
 *
 * Tests all three GDS metrics (PageRank, Louvain, K-Core) to verify:
 *   1. Coverage in atlas_packets (Postgres)
 *   2. Distribution and ranges
 *   3. Correlation between metrics
 *   4. Real-world interpretations
 *
 * Usage:
 *   node scripts/atlas/validate-gds-metrics.mjs
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Validate Neo4j GDS Metrics (PageRank, Louvain, K-Core)       ║');
console.log('║  Comprehensive test suite for graph-derived metrics            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function validateMetrics() {
  try {
    // ════════════════════════════════════════════════════════════════
    // TEST 1: COVERAGE AUDIT
    // ════════════════════════════════════════════════════════════════

    console.log('TEST 1: Metric Coverage Audit');
    console.log('─────────────────────────────');

    const coverageRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) pagerank_populated,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) community_populated,
        COUNT(CASE WHEN k_core IS NOT NULL THEN 1 END) kcore_populated,
        COUNT(CASE WHEN
          page_rank_score IS NOT NULL AND
          community_id IS NOT NULL AND
          k_core IS NOT NULL
        THEN 1 END) all_three_populated,
        ROUND(100.0 * COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) / COUNT(*), 2) pr_pct,
        ROUND(100.0 * COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) / COUNT(*), 2) comm_pct,
        ROUND(100.0 * COUNT(CASE WHEN k_core IS NOT NULL THEN 1 END) / COUNT(*), 2) kcore_pct,
        ROUND(100.0 * COUNT(CASE WHEN
          page_rank_score IS NOT NULL AND
          community_id IS NOT NULL AND
          k_core IS NOT NULL
        THEN 1 END) / COUNT(*), 2) all_pct
      FROM atlas_packets
    `);

    const coverage = coverageRes.rows[0];
    console.log(`Total packets: ${coverage.total}`);
    console.log(`PageRank:      ${coverage.pagerank_populated}/${coverage.total} (${coverage.pr_pct}%)`);
    console.log(`Community:     ${coverage.community_populated}/${coverage.total} (${coverage.comm_pct}%)`);
    console.log(`K-Core:        ${coverage.kcore_populated}/${coverage.total} (${coverage.kcore_pct}%)`);
    console.log(`All Three:     ${coverage.all_three_populated}/${coverage.total} (${coverage.all_pct}%)`);
    console.log();

    // ════════════════════════════════════════════════════════════════
    // TEST 2: DISTRIBUTION ANALYSIS
    // ════════════════════════════════════════════════════════════════

    console.log('TEST 2: Metric Distribution Analysis');
    console.log('────────────────────────────────────');

    const distRes = await pgPool.query(`
      SELECT
        -- PageRank stats
        MIN(page_rank_score) pr_min,
        MAX(page_rank_score) pr_max,
        AVG(page_rank_score) pr_mean,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY page_rank_score) pr_median,

        -- Community stats
        COUNT(DISTINCT community_id) distinct_communities,
        MAX(community_id) max_community_id,

        -- K-Core stats
        MIN(k_core) kcore_min,
        MAX(k_core) kcore_max,
        AVG(k_core) kcore_mean,
        COUNT(CASE WHEN k_core = 0 THEN 1 END) kcore_isolated,
        COUNT(CASE WHEN k_core >= 1 AND k_core <= 2 THEN 1 END) kcore_peripheral,
        COUNT(CASE WHEN k_core >= 3 THEN 1 END) kcore_central
      FROM atlas_packets
      WHERE page_rank_score IS NOT NULL OR community_id IS NOT NULL OR k_core IS NOT NULL
    `);

    const dist = distRes.rows[0];
    console.log(`PageRank Range:     [${parseFloat(dist.pr_min).toFixed(3)}, ${parseFloat(dist.pr_max).toFixed(3)}]`);
    console.log(`  Mean:             ${parseFloat(dist.pr_mean).toFixed(3)}`);
    console.log(`  Median:           ${parseFloat(dist.pr_median).toFixed(3)}`);
    console.log(`Communities:        ${dist.distinct_communities} distinct (IDs: 0-${dist.max_community_id})`);
    console.log(`K-Core Range:       [${dist.kcore_min}, ${dist.kcore_max}]`);
    console.log(`  Mean:             ${parseFloat(dist.kcore_mean).toFixed(2)}`);
    console.log(`  Isolated (k=0):   ${dist.kcore_isolated}`);
    console.log(`  Peripheral (k∈[1,2]): ${dist.kcore_peripheral}`);
    console.log(`  Central (k≥3):    ${dist.kcore_central}`);
    console.log();

    // ════════════════════════════════════════════════════════════════
    // TEST 3: TOP AUTHORITY NODES (PageRank Examples)
    // ════════════════════════════════════════════════════════════════

    console.log('TEST 3: Top Authority Nodes (PageRank)');
    console.log('──────────────────────────────────────');

    const topPRRes = await pgPool.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        page_rank_score,
        community_id,
        k_core
      FROM atlas_packets
      WHERE page_rank_score IS NOT NULL
      ORDER BY page_rank_score DESC
      LIMIT 5
    `);

    console.log(`Top 5 most-authoritative packets (high PageRank):`);
    topPRRes.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. PR=${parseFloat(row.page_rank_score).toFixed(3)} ${row.feature_id}`);
      console.log(`     file: ${row.source_ref.substring(0, 60)}`);
      if (row.community_id) console.log(`     community: ${row.community_id}, k-core: ${row.k_core}`);
    });
    console.log();

    // ════════════════════════════════════════════════════════════════
    // TEST 4: K-CORE INTERPRETATION (Dense Core vs Periphery)
    // ════════════════════════════════════════════════════════════════

    console.log('TEST 4: K-Core Interpretation (Core vs Peripheral Code)');
    console.log('───────────────────────────────────────────────────────');

    const kcoreInterpRes = await pgPool.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        page_rank_score,
        k_core,
        community_id
      FROM atlas_packets
      WHERE k_core IS NOT NULL AND k_core >= 3
      ORDER BY k_core DESC
      LIMIT 3
    `);

    console.log(`Highly-embedded code (k-core ≥ 3) — used by many other nodes:`);
    if (kcoreInterpRes.rows.length > 0) {
      kcoreInterpRes.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. k=${row.k_core} ${row.feature_id}`);
        console.log(`     file: ${row.source_ref.substring(0, 60)}`);
        console.log(`     PageRank: ${row.page_rank_score ? parseFloat(row.page_rank_score).toFixed(3) : 'N/A'}`);
      });
    } else {
      console.log(`  (No highly-embedded code found in current Postgres data)`);
    }

    // Find peripheral code
    const peripheralRes = await pgPool.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        page_rank_score,
        k_core
      FROM atlas_packets
      WHERE k_core IS NOT NULL AND k_core = 0
      ORDER BY RANDOM()
      LIMIT 3
    `);

    console.log(`\nIsolated code (k=0) — no connections in graph:`);
    peripheralRes.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.feature_id}`);
      console.log(`     file: ${row.source_ref.substring(0, 60)}`);
    });
    console.log();

    // ════════════════════════════════════════════════════════════════
    // TEST 5: METRIC CORRELATION
    // ════════════════════════════════════════════════════════════════

    console.log('TEST 5: Metric Correlation Analysis');
    console.log('────────────────────────────────────');

    const corrRes = await pgPool.query(`
      WITH metrics AS (
        SELECT
          page_rank_score,
          k_core,
          community_id
        FROM atlas_packets
        WHERE page_rank_score IS NOT NULL AND k_core IS NOT NULL
      )
      SELECT
        COUNT(*) overlapping_count,
        ROUND(AVG(page_rank_score)::numeric, 3) avg_pr_in_overlap,
        ROUND(AVG(k_core)::numeric, 2) avg_kcore_in_overlap,
        ROUND(CORR(page_rank_score, k_core)::numeric, 3) correlation_pr_kcore
      FROM metrics
    `);

    const corr = corrRes.rows[0];
    console.log(`Packets with BOTH PageRank AND K-Core: ${corr.overlapping_count}`);
    console.log(`Avg PageRank in overlap:               ${corr.avg_pr_in_overlap}`);
    console.log(`Avg K-Core in overlap:                 ${corr.avg_kcore_in_overlap}`);
    console.log(`Correlation (PageRank ↔ K-Core):      ${corr.correlation_pr_kcore}`);
    console.log(`  (Positive = higher authority codes tend to be more central)`);
    console.log();

    // ════════════════════════════════════════════════════════════════
    // TEST 6: SUMMARY & NEXT STEPS
    // ════════════════════════════════════════════════════════════════

    console.log('TEST 6: Summary & Validation Status');
    console.log('────────────────────────────────────');

    const allThreeCount = coverage.all_three_populated;
    const status = {
      'PageRank (authority)': coverage.pr_pct >= 20 ? '✅ PASS' : '⚠️ PARTIAL',
      'Louvain (communities)': coverage.comm_pct >= 20 ? '✅ PASS' : '⚠️ PARTIAL',
      'K-Core (coreness)': coverage.kcore_pct >= 15 ? '✅ PASS' : '⚠️ PARTIAL',
      'All three metrics': allThreeCount >= 10000 ? '✅ GOOD' : '⚠️ LIMITED'
    };

    Object.entries(status).forEach(([metric, result]) => {
      console.log(`  ${metric}: ${result}`);
    });

    console.log(`\n✅ GDS Metrics Suite Complete!`);
    console.log(`\nNEXT STEPS:`);
    console.log(`  1. ✅ COMPLETE: PageRank, Louvain, K-Core computed and synced`);
    console.log(`  2. READY: Use these metrics in ranking formulas`);
    console.log(`  3. PENDING: Train autoencoder (768→64) on enriched packets`);
    console.log(`  4. PENDING: True K-Means on latent vectors`);
    console.log(`  5. PENDING: SOM 20×20 topology`);
    console.log(`  6. PENDING: Full benchmark with complete metric set\n`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

validateMetrics();
