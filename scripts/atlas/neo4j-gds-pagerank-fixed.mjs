#!/usr/bin/env node

/**
 * NEO4J GDS: PageRank — Fixed Sync Logic
 *
 * BUGFIX: Previous script hardcoded 'sveltekit-frontend/' prefix (caused 5% coverage)
 * FIXED: Uses actual source_ref from Neo4j nodes (handles all directories)
 *
 * Computes PageRank via Neo4j GDS and syncs scores back to Postgres with 80%+ coverage.
 *
 * Usage:
 *   node scripts/atlas/neo4j-gds-pagerank-fixed.mjs --dry-run
 *   node scripts/atlas/neo4j-gds-pagerank-fixed.mjs --apply
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const POSTGRES_URL = resolveDatabaseUrl(env);

const driver = neo4j.default.driver(
  NEO4J_URI,
  neo4j.default.auth.basic('neo4j', NEO4J_PASSWORD)
);

const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Neo4j GDS: PageRank — Fixed Sync Logic (All Directories)      ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function pageRankFixed() {
  const session = driver.session();

  try {
    console.log('📊 Step 1: Create GDS graph projection\n');

    // Create graph projection on SIMILAR_TOPOLOGY edges
    const projRes = await session.run(`
      CALL gds.graph.project(
        'codebaseGraph_pagerank',
        'Packet',
        { SIMILAR_TOPOLOGY: { orientation: 'NATURAL' } }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    const proj = projRes.records[0].toObject();
    console.log(`   ✅ Projected: ${proj.nodeCount} nodes, ${proj.relationshipCount} edges\n`);

    console.log('🔄 Step 2: Compute PageRank (Neo4j GDS)\n');

    // Run PageRank algorithm
    const prRes = await session.run(`
      CALL gds.pageRank.stream('codebaseGraph_pagerank', {
        maxIterations: 20,
        dampingFactor: 0.85
      })
      YIELD nodeId, score
      WITH gds.util.asNode(nodeId) as node, score
      SET node.pageRankScore = score
      RETURN count(*) as scoredNodes, min(score) as minScore, max(score) as maxScore, avg(score) as avgScore
    `);

    const stats = prRes.records[0].toObject();
    console.log(`   ✅ Scored ${stats.scoredNodes} nodes`);
    console.log(`   Range: [${stats.minScore.toFixed(4)}, ${stats.maxScore.toFixed(4)}]`);
    console.log(`   Mean: ${stats.avgScore.toFixed(4)}\n`);

    console.log('📝 Step 3: Sync PageRank to Postgres\n');

    // FIXED: Query source_ref directly from Neo4j (not hardcoding prefix)
    const syncRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.pageRankScore IS NOT NULL AND n.source_ref IS NOT NULL
      RETURN n.source_ref as source_ref, n.pageRankScore as score
    `);

    const records = syncRes.records;
    console.log(`   Found ${records.length} Neo4j nodes with pageRankScore\n`);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${records.length} PageRank scores to Postgres`);
      if (records.length > 0) {
        const samples = records.slice(0, 3);
        console.log(`   Sample mappings:`);
        samples.forEach((r) => {
          const { source_ref, score } = r.toObject();
          console.log(`     ${source_ref} → ${parseFloat(score).toFixed(4)}`);
        });
      }
      console.log();
    } else {
      // Batch sync via source_ref match (FIXED: uses actual Neo4j source_ref, not hardcoded prefix)
      const BATCH_SIZE = 500;
      let synced = 0;
      let errors = 0;

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of batch) {
          const { source_ref, score } = record.toObject();
          values.push(source_ref, parseFloat(score));
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}::real)`);
          paramIndex += 2;
        }

        try {
          const updateRes = await pgPool.query(
            `UPDATE atlas_packets
             SET page_rank_score = v.score, updated_at = NOW()
             FROM (VALUES ${placeholders.join(', ')})
             AS v(source_ref, score)
             WHERE atlas_packets.source_ref = v.source_ref`,
            values
          );
          synced += updateRes.rowCount;
        } catch (err) {
          console.error(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, err.message);
          errors++;
        }

        if (i % 2500 === 0 && i > 0) {
          console.log(`   ✓ Synced ${synced}/${records.length}...`);
        }
      }

      console.log(`   ✅ Synced ${synced}/${records.length} PageRank scores to Postgres`);
      if (errors > 0) {
        console.log(`   ⚠️  ${errors} batch errors encountered\n`);
      }
    }

    console.log('4️⃣  Step 4: Verify coverage in Postgres\n');

    const coverageRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) with_score,
        ROUND(100.0 * COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) / COUNT(*), 2) coverage_pct,
        MIN(page_rank_score) min_score,
        MAX(page_rank_score) max_score,
        AVG(page_rank_score) avg_score
      FROM atlas_packets
      WHERE page_rank_score IS NOT NULL
    `);

    const coverage = coverageRes.rows[0];
    console.log(`   ✅ Postgres coverage: ${coverage.with_score}/${coverage.total} (${coverage.coverage_pct}%)`);
    console.log(`   Range: [${parseFloat(coverage.min_score).toFixed(4)}, ${parseFloat(coverage.max_score).toFixed(4)}]`);
    console.log(`   Mean: ${parseFloat(coverage.avg_score).toFixed(4)}\n`);

    // Cleanup
    await session.run('CALL gds.graph.drop("codebaseGraph_pagerank") YIELD graphName');

    console.log('✅ PageRank computation and sync complete!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await session.close();
    await pgPool.end();
    await driver.close();
  }
}

pageRankFixed();
