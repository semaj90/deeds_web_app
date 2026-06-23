#!/usr/bin/env node
/**
 * P4 Phase 2: Compute PageRank scores via Neo4j GDS
 *
 * Computes PageRank on the codebase graph and caches top-100 scores in Redis.
 *
 * Usage:
 *   node scripts/atlas/compute-pagerank-neo4j.mjs --dry-run
 *   node scripts/atlas/compute-pagerank-neo4j.mjs --apply
 */

import neo4j from 'neo4j-driver';
import { createClient } from 'redis';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

const redis = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
  password: process.env.REDIS_PASSWORD || undefined
});

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  P4 Phase 2: Compute PageRank (Neo4j GDS)                     ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function computePageRank() {
  const session = driver.session();

  try {
    console.log('📊 Step 1: Create GDS projection\n');

    // Create graph projection
    const projRes = await session.run(`
      CALL gds.graph.project(
        'codebaseGraph',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'NATURAL' },
          IMPORTS: { orientation: 'NATURAL' }
        }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    const proj = projRes.records[0].toObject();
    console.log(`   Projected graph: ${proj.nodeCount} nodes, ${proj.relationshipCount} relationships\n`);

    console.log('🔄 Step 2: Run PageRank algorithm\n');

    // Run PageRank
    const prRes = await session.run(`
      CALL gds.pageRank.stream('codebaseGraph', {
        maxIterations: 20,
        dampingFactor: 0.85
      })
      YIELD nodeId, score
      WITH gds.util.asNode(nodeId) as node, score
      SET node.pageRankScore = score
      RETURN count(*) as nodeCount, min(score) as minScore, max(score) as maxScore, avg(score) as avgScore
    `);

    const stats = prRes.records[0].toObject();
    console.log(`   Updated ${stats.nodeCount} nodes`);
    console.log(`   Scores: min=${stats.minScore.toFixed(4)}, max=${stats.maxScore.toFixed(4)}, avg=${stats.avgScore.toFixed(4)}\n`);

    console.log('💾 Step 3: Cache top-100 scores in Redis\n');

    // Fetch top-100 and cache
    const topRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.pageRankScore IS NOT NULL
      RETURN n.stableKey as key, n.pageRankScore as score
      ORDER BY score DESC
      LIMIT 100
    `);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would cache ${topRes.records.length} top scores to Redis`);
      console.log(`   Top score: ${topRes.records[0]?.toObject().score.toFixed(4) ?? 'N/A'}`);
      return;
    }

    // Cache to Redis
    await redis.connect();
    const scoreMap = {};
    for (const record of topRes.records) {
      const { key, score } = record.toObject();
      if (key) {
        scoreMap[key] = score.toFixed(6);
      }
    }

    await redis.hSet('couchdb:pagerank_scores', scoreMap);
    await redis.expire('couchdb:pagerank_scores', 6 * 3600); // 6 hour TTL

    console.log(`   ✅ Cached ${Object.keys(scoreMap).length} scores to Redis`);
    console.log(`   Expiry: 6 hours\n`);

    console.log('🧹 Step 4: Clean up GDS projection\n');

    await session.run(`CALL gds.graph.drop('codebaseGraph')`);
    console.log('   ✅ GDS projection dropped\n');

  } finally {
    await session.close();
    if (redis.isOpen) await redis.quit();
  }
}

(async () => {
  try {
    await computePageRank();
    console.log('✅ P4 Phase 2 Complete\n');
    await driver.close();
  } catch (e) {
    console.error('Error:', e.message);
    await driver.close();
    process.exit(1);
  }
})();
