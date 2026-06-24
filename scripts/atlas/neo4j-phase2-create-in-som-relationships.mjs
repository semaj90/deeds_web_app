#!/usr/bin/env node

/**
 * Neo4j Phase 2: Create IN_SOM relationships
 *
 * After som_cluster backfill, create Packet → SOMCell edges
 * using the som_cluster join key.
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log('\n🔗 Neo4j Phase 2: Create IN_SOM Relationships\n');
  console.log('='.repeat(60));

  try {
    // Pre-flight check
    await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions');
    console.log('✅ Neo4j connected\n');

    // Step 1: Pre-flight audit
    console.log('⏱️  Step 1: Pre-flight audit...');
    const auditResult = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) AS total_packets,
        sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) AS with_som_cluster
    `);

    const auditRecord = auditResult.records[0];
    const totalPackets = auditRecord?.get('total_packets')?.toNumber?.() || 0;
    const withSomCluster = auditRecord?.get('with_som_cluster')?.toNumber?.() || 0;

    console.log(`   Total Packets: ${totalPackets}`);
    console.log(`   With som_cluster: ${withSomCluster} (${((withSomCluster / totalPackets) * 100).toFixed(1)}%)\n`);

    if (withSomCluster < totalPackets) {
      console.log(`❌ ERROR: Not all Packets have som_cluster`);
      console.log(`   Run backfill first: node scripts/atlas/backfill-neo4j-packet-som-from-canonical.mjs --apply\n`);
      process.exit(1);
    }

    // Step 2: Count SOMCell nodes
    console.log('⏱️  Step 2: Checking SOMCell nodes...');
    const somCellResult = await session.run('MATCH (sc:SOMCell) RETURN count(sc) AS count');
    const somCellCount = somCellResult.records[0]?.get('count')?.toNumber?.() || 0;
    console.log(`   SOMCell nodes: ${somCellCount}\n`);

    if (somCellCount === 0) {
      console.log(`❌ ERROR: No SOMCell nodes in Neo4j`);
      console.log(`   Run Phase 1 node creation first\n`);
      process.exit(1);
    }

    // Step 3: Create IN_SOM relationships
    console.log('⏱️  Step 3: Creating IN_SOM relationships...');
    try {
      const result = await session.run(`
        MATCH (p:Packet) WHERE p.som_cluster IS NOT NULL
        MATCH (sc:SOMCell) WHERE sc.som_cluster = p.som_cluster
        MERGE (p)-[r:IN_SOM {confidence: 0.95, created_at: datetime()}]->(sc)
        RETURN count(*) AS created
      `);

      const created = result.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created} IN_SOM edges\n`);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}\n`);
      throw e;
    }

    // Step 4: Verify relationships
    console.log('⏱️  Step 4: Verifying IN_SOM relationships...');
    const verifyResult = await session.run(`
      MATCH (p:Packet)-[r:IN_SOM]->(sc:SOMCell)
      RETURN
        count(*) AS in_som_edges,
        count(DISTINCT p) AS packets_linked,
        count(DISTINCT sc) AS somcells_linked
    `);

    const verifyRecord = verifyResult.records[0];
    const edges = verifyRecord?.get('in_som_edges')?.toNumber?.() || 0;
    const pLinked = verifyRecord?.get('packets_linked')?.toNumber?.() || 0;
    const scLinked = verifyRecord?.get('somcells_linked')?.toNumber?.() || 0;

    console.log(`   IN_SOM edges: ${edges}`);
    console.log(`   Packets linked: ${pLinked}`);
    console.log(`   SOMCells linked: ${scLinked}\n`);

    // Step 5: Final report
    console.log('='.repeat(60));
    console.log('\n✅ Phase 2: IN_SOM Relationships Complete!\n');
    console.log('📊 Phase 2 Summary:\n');

    const summaryResult = await session.run(`
      RETURN
        (MATCH ()-[r:HAS_FEATURE]->() RETURN count(r)) AS has_feature_edges,
        (MATCH ()-[r:IN_SOM]->() RETURN count(r)) AS in_som_edges,
        (MATCH ()-[r:ADJACENT_TO]->() RETURN count(r)) AS adjacent_to_edges
    `);

    // Note: Need to run separate queries
    const hasFeatureResult = await session.run('MATCH ()-[r:HAS_FEATURE]->() RETURN count(r) AS count');
    const inSomResult = await session.run('MATCH ()-[r:IN_SOM]->() RETURN count(r) AS count');
    const adjacentToResult = await session.run('MATCH ()-[r:ADJACENT_TO]->() RETURN count(r) AS count');

    const hf = hasFeatureResult.records[0]?.get('count')?.toNumber?.() || 0;
    const is = inSomResult.records[0]?.get('count')?.toNumber?.() || 0;
    const at = adjacentToResult.records[0]?.get('count')?.toNumber?.() || 0;

    console.log(`  HAS_FEATURE edges:  ${hf}`);
    console.log(`  IN_SOM edges:       ${is}`);
    console.log(`  ADJACENT_TO edges:  ${at}\n`);
    console.log('✅ All Phase 2 relationships created!\n');

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
