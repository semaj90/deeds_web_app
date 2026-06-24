#!/usr/bin/env node

/**
 * Neo4j Phase 2 Fix: Create HAS_FEATURE relationships using existing data
 *
 * ONLY uses:
 * - Packet.feature_id (exists)
 * - Feature.feature_id (will create/update)
 *
 * Does NOT assume:
 * - Packet.som_cluster (missing — will backfill separately)
 * - Packet.directory_path (missing — will backfill separately)
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log('\n🔗 Neo4j Phase 2 Fix: Create HAS_FEATURE relationships\n');
  console.log('='.repeat(60));

  try {
    // Verify Neo4j is reachable
    await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions');
    console.log('✅ Neo4j connected\n');

    // Step 1: Populate Feature nodes with feature_id
    // Since Phase 1 created bare Feature nodes, we need to update them
    console.log('⏱️  Step 1: Analyzing Feature nodes...');
    const featureCountResult = await session.run('MATCH (f:Feature) RETURN count(f) AS count');
    const featureCount = featureCountResult.records[0]?.get('count')?.toNumber?.() || 0;

    const featureWithIdResult = await session.run('MATCH (f:Feature) WHERE f.feature_id IS NOT NULL RETURN count(f) AS count');
    const featureWithId = featureWithIdResult.records[0]?.get('count')?.toNumber?.() || 0;

    console.log(`   Feature nodes: ${featureCount}`);
    console.log(`   Feature nodes with feature_id: ${featureWithId}`);
    console.log(`   Feature nodes MISSING feature_id: ${featureCount - featureWithId}\n`);

    // Step 2: Get unique feature_ids from Packets and create/update Feature nodes
    console.log('⏱️  Step 2: Extracting unique feature_ids from Packets...');
    const uniqueFidsResult = await session.run(`
      MATCH (p:Packet) WHERE p.feature_id IS NOT NULL
      WITH DISTINCT p.feature_id AS fid
      RETURN COLLECT(fid) AS fids
    `);
    const uniqueFids = uniqueFidsResult.records[0]?.get('fids') || [];
    console.log(`   Unique feature_ids in Packets: ${uniqueFids.length}\n`);

    // Step 3: For each unique feature_id, ensure a Feature node exists with that ID
    console.log('⏱️  Step 3: Creating/updating Feature nodes with feature_ids...');
    let featureNodesUpdated = 0;

    // Process in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < uniqueFids.length; i += batchSize) {
      const batch = uniqueFids.slice(i, i + batchSize);
      try {
        const result = await session.run(
          `
            UNWIND $fids AS fid
            MERGE (f:Feature {feature_id: fid})
            RETURN count(*) AS count
          `,
          { fids: batch }
        );
        const batchCount = result.records[0]?.get('count')?.toNumber?.() || 0;
        featureNodesUpdated += batchCount;
        if (i % 500 === 0) {
          process.stdout.write(`   Processed ${Math.min(i + batchSize, uniqueFids.length)} / ${uniqueFids.length}\r`);
        }
      } catch (e) {
        console.log(`   ⚠️  Batch error at ${i}: ${e.message}`);
      }
    }
    console.log(`   ✅ Feature nodes created/updated: ${featureNodesUpdated}\n`);

    // Step 4: Create HAS_FEATURE relationships
    console.log('⏱️  Step 4: Creating HAS_FEATURE relationships...');
    try {
      const result = await session.run(`
        MATCH (p:Packet) WHERE p.feature_id IS NOT NULL
        MATCH (f:Feature {feature_id: p.feature_id})
        MERGE (p)-[:HAS_FEATURE]->(f)
        RETURN count(*) AS created
      `);
      const created = result.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created} HAS_FEATURE edges\n`);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}\n`);
    }

    // Step 5: Verify relationships
    console.log('⏱️  Step 5: Verifying relationships...');
    const verifyResult = await session.run(`
      MATCH (p:Packet)-[r:HAS_FEATURE]->(f:Feature)
      RETURN count(*) AS has_feature_edges,
             count(DISTINCT p) AS packets_linked,
             count(DISTINCT f) AS features_linked
    `);
    const verifyRecord = verifyResult.records[0];
    const edges = verifyRecord?.get('has_feature_edges')?.toNumber?.() || 0;
    const pLinked = verifyRecord?.get('packets_linked')?.toNumber?.() || 0;
    const fLinked = verifyRecord?.get('features_linked')?.toNumber?.() || 0;

    console.log(`   HAS_FEATURE edges: ${edges}`);
    console.log(`   Packets linked: ${pLinked}`);
    console.log(`   Features linked: ${fLinked}\n`);

    console.log('='.repeat(60));
    console.log('\n✅ Phase 2 Fix: HAS_FEATURE Complete!\n');
    console.log('📋 NEXT STEPS:\n');
    console.log('  1. Audit where som_cluster exists (Qdrant / atlas_packets)\n');
    console.log('     node scripts/atlas/audit-som-identity-cross-store.mjs\n');
    console.log('  2. Backfill Packet.som_cluster from canonical sources\n');
    console.log('     node scripts/atlas/backfill-neo4j-packet-som-from-canonical.mjs --dry-run\n');
    console.log('  3. Create IN_SOM relationships after backfill\n');
    console.log('     node scripts/atlas/neo4j-phase2-create-in-som-relationships.mjs\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
