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
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

config({ path: resolve('.', '.env') });

const driver = neo4j.default.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.default.auth.basic('neo4j', process.env.NEO4J_PASSWORD || 'password')
);

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
  const redisCtx = await resolveAtlasRedisContext(resolve('.'), process.env);
  const redisKey = 'bitfrost:pagerank:top-scores:v1';

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

    // Fetch ALL scores — join via n.path → atlas_packets.source_ref
    // Neo4j nodes have path='src/...' which maps to source_ref='sveltekit-frontend/src/...'
    const allRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.pageRankScore IS NOT NULL AND n.path IS NOT NULL
      RETURN n.path as path, n.pageRankScore as score
    `);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${allRes.records.length} PageRank scores to Postgres`);
      const topScore = allRes.records[0]?.toObject().score;
      console.log(`   Top score: ${topScore != null ? parseFloat(topScore).toFixed(4) : 'N/A'}`);
    } else {
      // Batch UPDATE via path → source_ref join (same pattern as Louvain sync)
      const BATCH_SIZE = 500;
      let synced = 0;
      const records = allRes.records;

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of batch) {
          const { path, score } = record.toObject();
          const sourceRef = 'sveltekit-frontend/' + path;
          values.push(sourceRef, parseFloat(score));
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}::real)`);
          paramIndex += 2;
        }

        const res = await pgPool.query(
          `UPDATE atlas_packets AS p
           SET page_rank_score = v.score,
               updated_at = NOW()
           FROM (VALUES ${placeholders.join(', ')})
           AS v(source_ref, score)
           WHERE p.source_ref = v.source_ref`,
          values
        );
        synced += res.rowCount;
        if (i % 5000 === 0 && i > 0) {
          console.log(`   ✓ Synced ${synced}/${records.length} scores...`);
        }
      }
      console.log(`   ✅ Synced ${synced} scores to Postgres\n`);
    }

    console.log('💾 Step 4: Cache top-100 scores in Redis\n');

    // Fetch top-100 for Redis cache keyed by source_ref (canonical path)
    const topRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.pageRankScore IS NOT NULL AND n.path IS NOT NULL
      RETURN n.path as path, n.pageRankScore as score
      ORDER BY score DESC
      LIMIT 100
    `);

    if (!DRY_RUN) {
      const scoreMap = {};
      for (const record of topRes.records) {
        const { path, score } = record.toObject();
        const key = path ? 'sveltekit-frontend/' + path : null;
        if (key) {
          scoreMap[key] = parseFloat(score).toFixed(6);
        }
      }

      const topEntries = Object.entries(scoreMap).sort(([a], [b]) => a.localeCompare(b));
      const packetKey = `sha256:${crypto
        .createHash('sha256')
        .update(JSON.stringify({ limit: 100, topEntries }))
        .digest('hex')}`;
      const envelope = {
        packet_id: crypto.randomUUID(),
        packet_ulid: null,
        packet_key: packetKey,
        title_id: 'graph.authority.pagerank',
        feature_id: 'graph.authority',
        source_ref: 'neo4j://codebaseGraph',
        directory_path: 'neo4j',
        community_id: null,
        som_row: null,
        som_col: null,
        som_cluster: null,
        kmeans_cluster_id: null,
        latent_64: null,
        manifold_4d: null,
        qdrant_point_id: null,
        neo4j_neighbors: [],
        page_rank_score: null,
        summary: `PageRank top-100 cache for ${topEntries.length} packet keys.`,
        lexical_nouns: ['pagerank', 'score', 'packet', 'graph'],
        lexical_verbs: ['rank', 'score', 'cache'],
        lexical_adverbs_ly: ['graphically'],
        routing_hints: ['neo4j', 'bitfrost', 'pagerank', 'authority'],
        used_concepts: ['pagerank', 'graph authority', 'retrieval ranking'],
        supersedes: [],
        superseded_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        confidence: 1,
        extraction_method: 'neo4j-gds-pagerank',
        provenance: {
          node_count: allRes.records.length,
          top_score_count: topEntries.length,
          source: 'neo4j-gds',
        },
      };
      const payload = JSON.stringify({
        envelope,
        top_scores: scoreMap,
      });
      const cacheResult = runRedisCli(
        redisCtx.container,
        ['SETEX', redisKey, String(6 * 3600)],
        redisCtx.password,
        payload,
      );
      if (!cacheResult.ok) {
        console.warn(`   ⚠️  Failed to cache PageRank envelope: ${cacheResult.stderr || cacheResult.error || 'unknown error'}`);
      } else {
        console.log(`   ✅ Cached canonical PageRank envelope at ${redisKey}`);
        console.log(`   Expiry: 6 hours\n`);
      }

      console.log(`   ✅ Cached ${Object.keys(scoreMap).length} top scores to Redis`);
    } else {
      console.log(`   DRY-RUN: Would cache ${topRes.records.length} top scores to Redis\n`);
    }

    console.log('🧹 Step 5: Clean up GDS projection\n');

    await session.run(`CALL gds.graph.drop('codebaseGraph')`);
    console.log('   ✅ GDS projection dropped\n');

  } finally {
    await session.close();
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
