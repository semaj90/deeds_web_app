#!/usr/bin/env node

/**
 * Neo4j GDS: K-Core Decomposition
 *
 * WHAT IS K-CORE?
 * ===============
 * K-Core is a graph metric that measures node "coreness" — how deeply embedded
 * a node is in dense subgraphs.
 *
 * Definition: A k-core is a maximal subgraph where EVERY node has degree ≥ k.
 *
 * Interpretation:
 *   - k_core = 1: Leaf node or weakly connected (degree ≥ 1)
 *   - k_core = 2: Part of a cycle or small cluster (degree ≥ 2)
 *   - k_core = 3+: Deeply embedded in dense regions (degree ≥ 3, 4, ...)
 *
 * Use case (codebase):
 *   - HIGH k_core: Core APIs, heavily-used utilities (many code paths touch them)
 *   - LOW k_core: Leaf code, specialized modules (few connections)
 *   - k_core = 0: Isolated code (no connections)
 *
 * Examples:
 *   - React component used in 5+ routes → HIGH k_core
 *   - Single-use utility function → LOW k_core
 *   - Database client (imported everywhere) → HIGHEST k_core
 *
 * Usage:
 *   node scripts/atlas/neo4j-gds-k-core.mjs --dry-run
 *   node scripts/atlas/neo4j-gds-k-core.mjs --apply
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
console.log('║  Neo4j GDS: K-Core Decomposition                              ║');
console.log('║  Measures node centrality: how deeply embedded in dense        ║');
console.log('║  subgraphs (k_core = min degree in k-core subgraph)           ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(48)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function kCoreDecomposition() {
  const session = driver.session();

  try {
    console.log('📊 Step 1: Create GDS graph projection\n');

    // Cleanup any leftover graphs
    try {
      await session.run('CALL gds.graph.drop("codebaseGraph_kcore") YIELD graphName');
    } catch (e) {
      // OK if doesn't exist
    }

    const projRes = await session.run(`
      CALL gds.graph.project(
        'codebaseGraph_kcore',
        'Packet',
        { SIMILAR_TOPOLOGY: { orientation: 'UNDIRECTED' } }
      )
      YIELD nodeCount, relationshipCount
      RETURN nodeCount, relationshipCount
    `);

    const proj = projRes.records[0].toObject();
    console.log(`   ✅ Projected: ${proj.nodeCount} nodes, ${proj.relationshipCount} edges`);
    console.log(`   (Note: UNDIRECTED for k-core decomposition)\n`);

    console.log('🔄 Step 2: Run K-Core algorithm\n');

    // Run K-Core decomposition
    const kcRes = await session.run(`
      CALL gds.kcore.stream('codebaseGraph_kcore')
      YIELD nodeId, coreValue
      WITH gds.util.asNode(nodeId) as node, coreValue
      SET node.kCoreValue = coreValue
      RETURN count(*) as scoredNodes, min(coreValue) as minCore, max(coreValue) as maxCore, avg(coreValue) as avgCore
    `);

    const kcStats = kcRes.records[0].toObject();
    console.log(`   ✅ Computed k-core for ${kcStats.scoredNodes} nodes`);
    console.log(`   Range: k-core ∈ [${kcStats.minCore}, ${kcStats.maxCore}]`);
    console.log(`   Mean k-core: ${parseFloat(kcStats.avgCore).toFixed(3)}`);
    console.log(`   Interpretation: Lower k-core = more peripheral (isolated/leaf code)`);
    console.log(`                   Higher k-core = more central (core infrastructure)\n`);

    console.log('📝 Step 3: Sync K-Core to Postgres\n');

    // Fetch k-core scores with source_ref
    const syncRes = await session.run(`
      MATCH (n:Packet)
      WHERE n.kCoreValue IS NOT NULL AND n.source_ref IS NOT NULL
      RETURN n.source_ref as source_ref, n.kCoreValue as k_core
    `);

    const records = syncRes.records;
    console.log(`   Found ${records.length} Neo4j nodes with kCoreValue\n`);

    if (DRY_RUN) {
      console.log(`   DRY-RUN: Would sync ${records.length} k-core scores to Postgres`);
      if (records.length > 0) {
        const samples = records.slice(0, 5);
        console.log(`   Sample mappings (showing k-core distribution):`);
        samples.forEach((r) => {
          const { source_ref, k_core } = r.toObject();
          const kVal = parseInt(k_core.toNumber ? k_core.toNumber() : k_core);
          const label = kVal === 0 ? 'isolated' : kVal <= 2 ? 'peripheral' : 'central';
          console.log(`     k=${kVal.toString().padStart(2)} (${label.padStart(10)}) ${source_ref.substring(0, 50)}`);
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
          const { source_ref, k_core } = record.toObject();
          values.push(source_ref, parseInt(k_core.toNumber ? k_core.toNumber() : k_core));
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}::integer)`);
          paramIndex += 2;
        }

        try {
          const updateRes = await pgPool.query(
            `UPDATE atlas_packets
             SET k_core = v.k_core, updated_at = NOW()
             FROM (VALUES ${placeholders.join(', ')})
             AS v(source_ref, k_core)
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

      console.log(`   ✅ Synced ${synced}/${records.length} k-core scores to Postgres`);
      if (errors > 0) {
        console.log(`   ⚠️  ${errors} batch errors encountered\n`);
      }
    }

    console.log('4️⃣  Step 4: Verify coverage & distribution in Postgres\n');

    const coverageRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN k_core IS NOT NULL THEN 1 END) with_kcore,
        ROUND(100.0 * COUNT(CASE WHEN k_core IS NOT NULL THEN 1 END) / COUNT(*), 2) coverage_pct,
        MIN(k_core) min_kcore,
        MAX(k_core) max_kcore,
        AVG(k_core) avg_kcore,
        COUNT(CASE WHEN k_core = 0 THEN 1 END) isolated_count,
        COUNT(CASE WHEN k_core = 1 THEN 1 END) leaf_count,
        COUNT(CASE WHEN k_core = 2 THEN 1 END) cycle_count,
        COUNT(CASE WHEN k_core >= 3 THEN 1 END) core_count
      FROM atlas_packets
      WHERE k_core IS NOT NULL
    `);

    const coverage = coverageRes.rows[0];
    console.log(`   ✅ Postgres coverage: ${coverage.with_kcore}/${coverage.total} (${coverage.coverage_pct}%)`);
    console.log(`   K-Core range: [${coverage.min_kcore}, ${coverage.max_kcore}], avg: ${parseFloat(coverage.avg_kcore).toFixed(2)}\n`);
    console.log(`   K-Core Distribution (interpretation):`);
    console.log(`     k=0 (isolated):  ${coverage.isolated_count.toString().padStart(5)} nodes (no connections)`);
    console.log(`     k=1 (peripheral): ${coverage.leaf_count.toString().padStart(5)} nodes (leaf/weak connections)`);
    console.log(`     k=2 (clustering): ${coverage.cycle_count.toString().padStart(5)} nodes (small clusters)`);
    console.log(`     k≥3 (core):      ${coverage.core_count.toString().padStart(5)} nodes (dense/central regions)\n`);

    // Cleanup
    await session.run('CALL gds.graph.drop("codebaseGraph_kcore") YIELD graphName');

    console.log('✅ K-Core decomposition complete!');

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

kCoreDecomposition();
