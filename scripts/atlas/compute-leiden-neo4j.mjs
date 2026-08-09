#!/usr/bin/env node
/**
 * Phase 8: Compute Leiden community detection via Neo4j GDS
 *
 * Runs Leiden community detection on the codebase graph and records the
 * results in a separate Leiden-specific Postgres table and Redis cache.
 * This keeps the Leiden lane distinct from the existing Louvain lane.
 *
 * Usage:
 *   node scripts/atlas/compute-leiden-neo4j.mjs --dry-run
 *   node scripts/atlas/compute-leiden-neo4j.mjs --apply
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
const GRAPH_NAME = 'packetGraph_leiden';
const REDIS_KEY = 'bitfrost:leiden:community-stats:v1';
const PG_TABLE = 'community_reports_leiden';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 8: Compute Leiden Communities (Neo4j GDS)              ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function ensureTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${PG_TABLE} (
      community_id   INT       PRIMARY KEY,
      member_paths   TEXT[]    NOT NULL DEFAULT '{}',
      member_count   INT       NOT NULL DEFAULT 0,
      summary        TEXT      NOT NULL DEFAULT '',
      purpose        TEXT      NOT NULL DEFAULT '',
      tags           TEXT[]    NOT NULL DEFAULT '{}',
      cohesion_score REAL      NOT NULL DEFAULT 0,
      embedding      vector(768),
      built_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      algorithm      TEXT      NOT NULL DEFAULT 'leiden'
    )
  `);
}

async function ensureProjectionDropped(session) {
  try {
    await session.run(`CALL gds.graph.drop('${GRAPH_NAME}')`);
  } catch {
    // Projection doesn't exist or GDS already cleaned it up.
  }
}

async function computeLeiden() {
  const session = driver.session();
  const redisCtx = await resolveAtlasRedisContext(resolve('.'), process.env);

  try {
    if (!DRY_RUN) {
      await ensureTable();
    }

    console.log('📊 Step 1: Drop existing projection (if any) and create GDS projection\n');
    await ensureProjectionDropped(session);

    const projRes = await session.run(`
      CALL gds.graph.project(
        '${GRAPH_NAME}',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'UNDIRECTED' }
        }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    if (projRes.records.length === 0) {
      throw new Error('Graph projection failed');
    }

    const proj = projRes.records[0].toObject();
    const nodeCount = proj.nodeCount.toNumber ? proj.nodeCount.toNumber() : proj.nodeCount;
    const relCount = proj.relationshipCount.toNumber ? proj.relationshipCount.toNumber() : proj.relationshipCount;
    console.log(`   Projected graph: ${nodeCount} nodes, ${relCount} relationships\n`);

    console.log('🔄 Step 2: Run Leiden community detection\n');

    let leidenRes;
    let stats;

    if (DRY_RUN) {
      leidenRes = await session.run(`
        CALL gds.leiden.stream('${GRAPH_NAME}', {
          randomSeed: 42
        })
        YIELD nodeId, communityId
        RETURN nodeId, communityId
      `);
    } else {
      leidenRes = await session.run(`
        CALL gds.leiden.write('${GRAPH_NAME}', {
          writeProperty: 'leiden_community_id',
          randomSeed: 42
        })
        YIELD nodePropertiesWritten, communityCount
        RETURN nodePropertiesWritten, communityCount
      `);

      if (leidenRes.records.length === 0) {
        throw new Error('Leiden computation failed');
      }

      stats = leidenRes.records[0].toObject();
      const nodesWritten = stats.nodePropertiesWritten.toNumber ? stats.nodePropertiesWritten.toNumber() : stats.nodePropertiesWritten;
      const commCount = stats.communityCount.toNumber ? stats.communityCount.toNumber() : stats.communityCount;
      console.log(`   ✅ Wrote leiden_community_id to ${nodesWritten} Neo4j nodes`);
      console.log(`   ✅ Detected ${commCount} Leiden communities\n`);
    }

    if (DRY_RUN) {
      const streamRows = leidenRes.records;
      const recordCount = streamRows.length;
      const communityStats = {};
      for (const record of streamRows) {
        const { communityId } = record.toObject();
        const idNum = communityId.toNumber ? communityId.toNumber() : parseInt(communityId);
        communityStats[idNum] = (communityStats[idNum] || 0) + 1;
      }
      console.log(`   DRY-RUN: Would assign ${recordCount} nodes to ${Object.keys(communityStats).length} Leiden communities`);
      if (recordCount > 0) {
        const samples = streamRows.slice(0, 3).map((r) => {
          const obj = r.toObject();
          const nodeId = obj.nodeId.toNumber ? obj.nodeId.toNumber() : parseInt(obj.nodeId);
          const commId = obj.communityId.toNumber ? obj.communityId.toNumber() : parseInt(obj.communityId);
          return `node ${nodeId}: Leiden community ${commId}`;
        });
        console.log(`   Sample mappings:\n      ${samples.join('\n      ')}\n`);
      }
      console.log(`   DRY-RUN: Skipping Postgres writes\n`);
      return;
    } else {
      console.log('📝 Step 3: Sync Leiden community IDs to Postgres\n');

      const allRes = await session.run(`
        MATCH (n:Packet)
        WHERE n.leiden_community_id IS NOT NULL AND n.path IS NOT NULL
        RETURN n.path as path, n.leiden_community_id as community_id
      `);

      const recordCount = allRes.records.length;
      console.log(`   Fetched ${recordCount} Leiden community assignments from Neo4j`);

      // Build canonical Leiden community records after the sync pass.
      const communityStats = {};
      const communityMembers = {};
      for (const record of allRes.records) {
        const { path, community_id } = record.toObject();
        const idNum = community_id.toNumber ? community_id.toNumber() : parseInt(community_id);
        communityStats[idNum] = (communityStats[idNum] || 0) + 1;
        if (!communityMembers[idNum]) communityMembers[idNum] = [];
        communityMembers[idNum].push(`sveltekit-frontend/${path}`);
      }

      const commIds = Object.keys(communityStats);
      for (const commId of commIds) {
        const communityId = Number(commId);
        const memberPaths = communityMembers[communityId] ?? [];
        const totalMembers = communityStats[communityId];
        const cohesionScore = 0;
        const record = {
          community_id: communityId,
          member_paths: memberPaths,
          member_count: totalMembers,
          summary: `Leiden community ${communityId} detected across ${totalMembers} packet assignments.`,
          purpose: `Leiden community ${communityId}`,
          tags: ['leiden', 'community', 'graph'],
          cohesion_score: cohesionScore,
          built_at: new Date().toISOString(),
          algorithm: 'leiden',
        };

        await pgPool.query(`
          INSERT INTO ${PG_TABLE}
            (community_id, member_paths, member_count, summary, purpose, tags, cohesion_score, embedding, built_at, algorithm)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULL::vector, $8, $9)
          ON CONFLICT (community_id) DO UPDATE SET
            member_paths   = EXCLUDED.member_paths,
            member_count   = EXCLUDED.member_count,
            summary        = EXCLUDED.summary,
            purpose        = EXCLUDED.purpose,
            tags           = EXCLUDED.tags,
            cohesion_score = EXCLUDED.cohesion_score,
            built_at       = EXCLUDED.built_at,
            algorithm      = EXCLUDED.algorithm
        `, [
          record.community_id,
          record.member_paths,
          record.member_count,
          record.summary,
          record.purpose,
          record.tags,
          record.cohesion_score,
          record.built_at,
          record.algorithm,
        ]);
      }
      console.log(`   ✅ Synced ${commIds.length} Leiden community records to Postgres\n`);

      if (commIds.length > 0 && redisCtx.container) {
        const totalCommunities = commIds.length;
        const totalAssignments = Object.values(communityStats).reduce((sum, count) => sum + count, 0);
        const packetKey = `sha256:${crypto.createHash('sha256').update(`leiden:${totalCommunities}:${totalAssignments}`, 'utf8').digest('hex')}`;
        const packetId = crypto.randomUUID();
        const envelope = {
          packet_id: packetId,
          packet_ulid: null,
          packet_key: packetKey,
          title_id: 'graph.community.stats.leiden',
          feature_id: 'graph.community.clustering.leiden',
          source_ref: 'neo4j://packetGraph_leiden',
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
          summary: `Leiden detected ${totalCommunities} communities across ${totalAssignments} packet assignments.`,
          lexical_nouns: ['leiden', 'community', 'packet', 'graph'],
          lexical_verbs: ['detect', 'cluster', 'sync'],
          lexical_adverbs_ly: ['topologically'],
          routing_hints: ['neo4j', 'bitfrost', 'community', 'graph'],
          used_concepts: ['leiden', 'community detection', 'graph topology'],
          supersedes: [],
          superseded_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          confidence: 1,
          extraction_method: 'neo4j-gds-leiden',
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
          ['SETEX', REDIS_KEY, String(24 * 3600)],
          redisCtx.password,
          payload,
        );
        if (!cacheResult.ok) {
          console.warn(`   ⚠️  Failed to cache Leiden envelope: ${cacheResult.stderr || cacheResult.error || 'unknown error'}`);
        } else {
          console.log(`   ✅ Cached canonical Leiden envelope at ${REDIS_KEY}`);
          console.log(`   Expiry: 24 hours\n`);
        }
      }
    }

  } finally {
    try {
      await ensureProjectionDropped(session);
      console.log('\n🧹 Step 5: Clean up GDS projection');
      console.log('   ✅ GDS projection dropped\n');
    } catch (e) {
      console.error('\n⚠️  Failed to drop projection:', e.message);
    }

    try {
      await session.close();
    } catch {}

    try {
      await pgPool.end();
    } catch {}
  }
}

(async () => {
  try {
    await computeLeiden();
    console.log('✅ Phase 8 Leiden Complete\n');
    await driver.close();
  } catch (e) {
    console.error('Error:', e.message);
    await driver.close();
    process.exit(1);
  }
})();
