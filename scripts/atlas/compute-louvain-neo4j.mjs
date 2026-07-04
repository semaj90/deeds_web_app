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
console.log('║  Phase 8: Compute Louvain Communities (Neo4j GDS)             ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function computeLouvain() {
  const session = driver.session();

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

    // Create graph projection with multiple relationship types
    const projRes = await session.run(`
      CALL gds.graph.project(
        'packetGraph',
        'Packet',
        {
          SIMILAR_TOPOLOGY: { orientation: 'UNDIRECTED' },
          DEPENDS_ON: { orientation: 'NATURAL' },
          SAME_FEATURE: { orientation: 'UNDIRECTED' }
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

    // Fetch ALL community assignments from Neo4j
    const allRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.community_id IS NOT NULL AND n.packet_key IS NOT NULL
      RETURN n.packet_key as packet_key, n.community_id as community_id
    `);

    const recordCount = allRes.records.length;
    console.log(`   Fetched ${recordCount} community assignments from Neo4j`);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${recordCount} community assignments to Postgres`);
      if (recordCount > 0) {
        const samples = allRes.records.slice(0, 3).map(r => {
          const obj = r.toObject();
          return `${obj.packet_key}: community ${obj.community_id}`;
        });
        console.log(`   Sample mappings:\n      ${samples.join('\n      ')}\n`);
      }
      console.log(`   DRY-RUN: Skipping Postgres writes\n`);
    } else {
      // APPLY: Batch Postgres updates
      const BATCH_SIZE = 500;
      let synced = 0;

      for (let i = 0; i < recordCount; i += BATCH_SIZE) {
        const batch = allRes.records.slice(i, i + BATCH_SIZE);

        // Build VALUES clause for batch update
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of batch) {
          const { packet_key, community_id } = record.toObject();
          const communityIdNum = community_id.toNumber ? community_id.toNumber() : parseInt(community_id);
          values.push(packet_key, communityIdNum);
          placeholders.push(`($${paramIndex}, $${paramIndex + 1})`);
          paramIndex += 2;
        }

        // Batch update with VALUES
        await pgPool.query(
          `UPDATE atlas_packets AS p
           SET community_id = v.community_id,
               updated_at = NOW()
           FROM (VALUES ${placeholders.join(', ')})
           AS v(packet_key, community_id)
           WHERE p.packet_key = v.packet_key`,
          values
        );

        synced += batch.length;
        if (synced % 1000 === 0) {
          console.log(`   ✓ Synced ${synced}/${recordCount} assignments...`);
        }
      }

      console.log(`   ✅ Synced ${synced} community assignments to Postgres\n`);
    }

    console.log('💾 Step 4: Cache community statistics in Redis\n');

    if (!DRY_RUN && allRes.records.length > 0) {
      // Compute community statistics and cache
      const communityStats = {};
      for (const record of allRes.records) {
        const { community_id } = record.toObject();
        const idNum = community_id.toNumber ? community_id.toNumber() : parseInt(community_id);
        communityStats[idNum] = (communityStats[idNum] || 0) + 1;
      }

      const statMap = {};
      for (const [communityId, count] of Object.entries(communityStats)) {
        statMap[`community:${communityId}:count`] = count.toString();
      }

      if (Object.keys(statMap).length > 0) {
        await redis.connect();
        await redis.hSet('louvain:community_stats', statMap);
        await redis.expire('louvain:community_stats', 24 * 3600); // 24 hour TTL
        console.log(`   ✅ Cached statistics for ${Object.keys(statMap).length} communities`);
        console.log(`   Expiry: 24 hours\n`);
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

    if (redis.isOpen) {
      try {
        await redis.quit();
      } catch (e) {
        // Redis already closed
      }
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
