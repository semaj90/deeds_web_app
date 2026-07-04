#!/usr/bin/env node
/**
 * Phase 8: Compute Louvain community detection via Neo4j GDS
 *
 * Runs Louvain community detection on the codebase graph and syncs results to Postgres.
 * Communities are stored in atlas_packets.community_id, with caching in Redis.
 *
 * Usage:
 *   node scripts/atlas/compute-louvain-neo4j.mjs --dry-run
 *   node scripts/atlas/compute-louvain-neo4j.mjs --apply
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
console.log('║  Phase 8: Compute Louvain Communities (Neo4j GDS)             ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function computeLouvain() {
  const session = driver.session();
  const redisCtx = await resolveAtlasRedisContext(resolve('.'), process.env);
  const redisKey = 'bitfrost:louvain:community-stats:v1';

  try {
    console.log('📊 Step 1: Drop existing projection (if any) and create GDS projection\n');

    // Drop existing projection
    try {
      await session.run(`CALL gds.graph.drop('packetGraph')`);
      console.log(`   ✓ Dropped existing packetGraph projection\n`);
    } catch (e) {
      // Projection doesn't exist, that's fine
      console.log(`   ℹ️  No existing projection to drop\n`);
    }

    // Create graph projection — only SIMILAR_TOPOLOGY exists at volume (51K edges)
    const projRes = await session.run(`
      CALL gds.graph.project(
        'packetGraph',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'UNDIRECTED' }
        }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    if (projRes.records.length === 0) {
      console.error('❌ Graph projection failed');
      process.exit(1);
    }

    const proj = projRes.records[0].toObject();
    console.log(`   Projected graph: ${proj.nodeCount.toNumber()} nodes, ${proj.relationshipCount.toNumber()} relationships\n`);

    console.log('🔄 Step 2: Run Louvain community detection\n');

    let louvainRes;
    let stats;

    if (DRY_RUN) {
      // DRY-RUN: Use stream only (no mutation)
      louvainRes = await session.run(`
        CALL gds.louvain.stream('packetGraph', {
          maxIterations: 10,
          tolerance: 0.0001
        })
        YIELD nodeId, communityId
        RETURN count(*) as nodeCount, count(DISTINCT communityId) as communityCount
      `);

      stats = louvainRes.records[0].toObject();
      console.log(`   DRY-RUN: Would assign ${stats.nodeCount.toNumber()} nodes to ${stats.communityCount.toNumber()} communities\n`);
      console.log(`   DRY-RUN: Would sync to Postgres atlas_packets.community_id\n`);

    } else {
      // APPLY: Use write to mutate Neo4j AND stream for stats
      louvainRes = await session.run(`
        CALL gds.louvain.write('packetGraph', {
          writeProperty: 'community_id',
          maxIterations: 10,
          tolerance: 0.0001
        })
        YIELD nodePropertiesWritten, communityCount
        RETURN nodePropertiesWritten, communityCount
      `);

      if (louvainRes.records.length === 0) {
        console.error('❌ Louvain computation failed');
        process.exit(1);
      }

      stats = louvainRes.records[0].toObject();
      const nodesWritten = stats.nodePropertiesWritten.toNumber ? stats.nodePropertiesWritten.toNumber() : stats.nodePropertiesWritten;
      const commCount = stats.communityCount.toNumber ? stats.communityCount.toNumber() : stats.communityCount;

      console.log(`   ✅ Wrote community_id to ${nodesWritten} Neo4j nodes`);
      console.log(`   ✅ Detected ${commCount} communities\n`);
    }

    console.log('📝 Step 3: Sync community IDs to Postgres\n');

    // Verify atlas_packets.community_id column exists
    const schemaRes = await pgPool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='atlas_packets' AND column_name='community_id'
    `);

    if (schemaRes.rows.length === 0) {
      console.error('❌ Column atlas_packets.community_id does not exist');
      console.error('   Run: npm run phase8:create-schema:apply');
      process.exit(1);
    }

    // Fetch ALL community assignments from Neo4j — join via path (= source_ref without prefix)
    // Neo4j nodes use n.path = 'src/...' which maps to Postgres source_ref = 'sveltekit-frontend/src/...'
    const allRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.community_id IS NOT NULL AND n.path IS NOT NULL
      RETURN n.path as path, n.community_id as community_id
    `);

    const recordCount = allRes.records.length;
    console.log(`   Fetched ${recordCount} community assignments from Neo4j`);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${recordCount} community assignments to Postgres`);
      if (recordCount > 0) {
        const samples = allRes.records.slice(0, 3).map(r => {
          const obj = r.toObject();
          const commId = obj.community_id.toNumber ? obj.community_id.toNumber() : parseInt(obj.community_id);
          return `sveltekit-frontend/${obj.path}: community ${commId}`;
        });
        console.log(`   Sample mappings:\n      ${samples.join('\n      ')}\n`);
      }
      console.log(`   DRY-RUN: Skipping Postgres writes\n`);
    } else {
      // APPLY: Batch Postgres updates — join by prefixed source_ref
      const BATCH_SIZE = 500;
      let synced = 0;

      for (let i = 0; i < recordCount; i += BATCH_SIZE) {
        const batch = allRes.records.slice(i, i + BATCH_SIZE);

        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of batch) {
          const { path, community_id } = record.toObject();
          const communityIdNum = community_id.toNumber ? community_id.toNumber() : parseInt(community_id);
          // Postgres stores 'sveltekit-frontend/src/...' while Neo4j has 'src/...'
          const sourceRef = 'sveltekit-frontend/' + path;
          values.push(sourceRef, communityIdNum);
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}::integer)`);
          paramIndex += 2;
        }

        const res = await pgPool.query(
          `UPDATE atlas_packets AS p
           SET community_id = v.community_id,
               updated_at = NOW()
           FROM (VALUES ${placeholders.join(', ')})
           AS v(source_ref, community_id)
           WHERE p.source_ref = v.source_ref`,
          values
        );

        synced += res.rowCount;
        if (i % 5000 === 0 && i > 0) {
          console.log(`   ✓ Synced ${synced}/${recordCount} assignments...`);
        }
      }

      console.log(`   ✅ Synced ${synced} community assignments to Postgres\n`);
    }

    console.log('💾 Step 4: Cache community statistics in Redis\n');

    if (!DRY_RUN && allRes.records.length > 0) {
      // Compute community statistics and cache as a canonical envelope-shaped JSON blob
      const communityStats = {};
      for (const record of allRes.records) {
        const { community_id } = record.toObject();
        const idNum = community_id.toNumber ? community_id.toNumber() : parseInt(community_id);
        communityStats[idNum] = (communityStats[idNum] || 0) + 1;
      }

      const commIds = Object.keys(communityStats);
      if (commIds.length > 0 && redisCtx.container) {
        const totalCommunities = commIds.length;
        const totalAssignments = Object.values(communityStats).reduce((sum, count) => sum + count, 0);
        const packetKey = `sha256:${crypto.createHash('sha256').update(`louvain:${totalCommunities}:${totalAssignments}`, 'utf8').digest('hex')}`;
        const packetId = crypto.randomUUID();
        const envelope = {
          packet_id: packetId,
          packet_ulid: null,
          packet_key: packetKey,
          title_id: 'graph.community.stats',
          feature_id: 'graph.community.clustering',
          source_ref: 'neo4j://packetGraph',
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
          summary: `Louvain detected ${totalCommunities} communities across ${totalAssignments} packet assignments.`,
          lexical_nouns: ['louvain', 'community', 'packet', 'graph'],
          lexical_verbs: ['detect', 'cluster', 'sync'],
          lexical_adverbs_ly: ['topologically'],
          routing_hints: ['neo4j', 'bitfrost', 'community', 'graph'],
          used_concepts: ['louvain', 'community detection', 'graph topology'],
          supersedes: [],
          superseded_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          confidence: 1,
          extraction_method: 'neo4j-gds-louvain',
          provenance: {
            node_count: recordCount,
            community_count: totalCommunities,
            assignment_count: totalAssignments,
            source: 'neo4j-gds',
          },
        };

        const payload = JSON.stringify({
          envelope,
          community_stats: communityStats,
        });
        const cacheResult = runRedisCli(
          redisCtx.container,
          ['SETEX', redisKey, String(24 * 3600)],
          redisCtx.password,
          payload,
        );
        if (!cacheResult.ok) {
          console.warn(`   ⚠️  Failed to cache Louvain envelope: ${cacheResult.stderr || cacheResult.error || 'unknown error'}`);
        } else {
          console.log(`   ✅ Cached canonical Louvain envelope at ${redisKey}`);
          console.log(`   Expiry: 24 hours\n`);
        }
      }
    } else if (DRY_RUN) {
      console.log(`   DRY-RUN: Would cache community statistics\n`);
    }

  } finally {
    // Always drop projection, even if error occurred
    try {
      await session.run(`CALL gds.graph.drop('packetGraph')`);
      console.log('\n🧹 Step 5: Clean up GDS projection');
      console.log('   ✅ GDS projection dropped\n');
    } catch (e) {
      console.error('\n⚠️  Failed to drop projection:', e.message);
    }

    // Cleanup connections
    try {
      await session.close();
    } catch (e) {
      // Session already closed
    }

    try {
      await pgPool.end();
    } catch (e) {
      // Pool already closed
    }
  }
}

(async () => {
  try {
    await computeLouvain();
    console.log('✅ Phase 8 Louvain Complete\n');
    await driver.close();
  } catch (e) {
    console.error('Error:', e.message);
    await driver.close();
    process.exit(1);
  }
})();
