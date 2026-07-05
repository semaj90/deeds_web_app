#!/usr/bin/env node

/**
 * Neo4j GDS: Louvain Community Detection
 *
 * Detects communities in the codebase graph using Louvain modularity optimization.
 * Syncs community_id back to Postgres with same fix as PageRank (uses source_ref, not hardcoded prefix).
 *
 * Usage:
 *   node scripts/atlas/neo4j-gds-louvain.mjs --dry-run
 *   node scripts/atlas/neo4j-gds-louvain.mjs --apply
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
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
console.log('║  Neo4j GDS: Louvain Community Detection                        ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function louvainCommunities() {
  const session = driver.session();

  try {
    console.log('📊 Step 1: Cleanup and create GDS graph projection\n');

    // Cleanup any leftover graphs
    try {
      await session.run('CALL gds.graph.drop("codebaseGraph_louvain") YIELD graphName');
    } catch (e) {
      // OK if doesn't exist
    }

    const projRes = await session.run(`
      CALL gds.graph.project(
        'codebaseGraph_louvain',
        'Packet',
        { SIMILAR_TOPOLOGY: { orientation: 'UNDIRECTED' } }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    const proj = projRes.records[0].toObject();
    console.log(`   ✅ Projected: ${proj.nodeCount} nodes, ${proj.relationshipCount} edges`);
    console.log(`   (Note: UNDIRECTED for modularity optimization)\n`);

    console.log('🔄 Step 2: Run Louvain algorithm\n');

    // Run Louvain with modularity optimization
    const louRes = await session.run(`
      CALL gds.louvain.stream('codebaseGraph_louvain', {
        maxIterations: 10,
        includeIntermediateCommunities: false
      })
      YIELD nodeId, communityId
      WITH gds.util.asNode(nodeId) as node, communityId
      SET node.louvainCommunityId = communityId
      RETURN count(*) as scoredNodes, count(DISTINCT communityId) as communityCount
    `);

    const louStats = louRes.records[0].toObject();
    console.log(`   ✅ Detected ${louStats.communityCount} communities`);
    console.log(`   ✅ Assigned ${louStats.scoredNodes} nodes\n`);

    console.log('📝 Step 3: Sync Louvain communities to Postgres\n');

    // Fetch community assignments with source_ref
    const syncRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.louvainCommunityId IS NOT NULL AND n.source_ref IS NOT NULL
      RETURN n.source_ref as source_ref, n.louvainCommunityId as community_id
    `);

    const records = syncRes.records;
    console.log(`   Found ${records.length} Neo4j nodes with louvainCommunityId\n`);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${records.length} community IDs to Postgres`);
      if (records.length > 0) {
        const samples = records.slice(0, 3);
        console.log(`   Sample mappings:`);
        samples.forEach((r) => {
          const { source_ref, community_id } = r.toObject();
          console.log(`     ${source_ref} → community ${community_id}`);
        });
      }
      console.log();
    } else {
      // Batch sync
      const BATCH_SIZE = 500;
      let synced = 0;
      let errors = 0;

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const record of batch) {
          const { source_ref, community_id } = record.toObject();
          values.push(source_ref, parseInt(community_id.toNumber ? community_id.toNumber() : community_id));
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}::integer)`);
          paramIndex += 2;
        }

        try {
          const updateRes = await pgPool.query(
            `UPDATE atlas_packets
             SET community_id = v.community_id, updated_at = NOW()
             FROM (VALUES ${placeholders.join(', ')})
             AS v(source_ref, community_id)
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

      console.log(`   ✅ Synced ${synced}/${records.length} community IDs to Postgres`);
      if (errors > 0) {
        console.log(`   ⚠️  ${errors} batch errors encountered\n`);
      }
    }

    console.log('4️⃣  Step 4: Verify coverage in Postgres\n');

    const coverageRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) with_community,
        ROUND(100.0 * COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) / COUNT(*), 2) coverage_pct,
        COUNT(DISTINCT community_id) distinct_communities,
        MIN(community_id) min_id,
        MAX(community_id) max_id
      FROM atlas_packets
      WHERE community_id IS NOT NULL
    `);

    const coverage = coverageRes.rows[0];
    console.log(`   ✅ Postgres coverage: ${coverage.with_community}/${coverage.total} (${coverage.coverage_pct}%)`);
    console.log(`   Distinct communities: ${coverage.distinct_communities}`);
    console.log(`   Range: [${coverage.min_id}, ${coverage.max_id}]\n`);

    // Cleanup
    await session.run('CALL gds.graph.drop("codebaseGraph_louvain") YIELD graphName');

    console.log('✅ Louvain community detection complete!');

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

louvainCommunities();
