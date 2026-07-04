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
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

const redis = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  password: process.env.REDIS_PASSWORD || 'redis',
});

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
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

    // Create graph projection (using only SIMILAR_TOPOLOGY which exists in the DB)
    const projRes = await session.run(`
      CALL gds.graph.project(
        'codebaseGraph',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'NATURAL' }
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

    console.log('📝 Step 3: Sync PageRank scores to Postgres\n');

    // Fetch ALL scores (not just top-100) to sync to canonical Postgres
    const allRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.pageRankScore IS NOT NULL AND n.packet_key IS NOT NULL
      RETURN n.packet_key as packet_key, n.pageRankScore as score
    `);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${allRes.records.length} PageRank scores to Postgres`);
      console.log(`   Top score: ${allRes.records[0]?.toObject().score.toFixed(4) ?? 'N/A'}`);
    } else {
      // Sync to Postgres
      for (const record of allRes.records) {
        const { packet_key, score } = record.toObject();
        await pgPool.query(
          `UPDATE atlas_packets SET page_rank_score = $2, updated_at = NOW() WHERE packet_key = $1`,
          [packet_key, parseFloat(score)]
        );
      }
      console.log(`   ✅ Synced ${allRes.records.length} scores to Postgres\n`);
    }

    console.log('💾 Step 4: Cache top-100 scores in Redis\n');

    // Fetch top-100 for Redis cache (using canonical packet_key, not Neo4j internal ID)
    const topRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.pageRankScore IS NOT NULL AND n.packet_key IS NOT NULL
      RETURN n.packet_key as key, n.pageRankScore as score
      ORDER BY score DESC
      LIMIT 100
    `);

    if (!DRY_RUN) {
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

      console.log(`   ✅ Cached ${Object.keys(scoreMap).length} top scores to Redis`);
      console.log(`   Expiry: 6 hours\n`);
    } else {
      console.log(`   DRY-RUN: Would cache ${topRes.records.length} top scores to Redis\n`);
    }

    console.log('🧹 Step 5: Clean up GDS projection\n');

    await session.run(`CALL gds.graph.drop('codebaseGraph')`);
    console.log('   ✅ GDS projection dropped\n');

  } finally {
    await session.close();
    if (redis.isOpen) await redis.quit();
    await pgPool.end();
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
