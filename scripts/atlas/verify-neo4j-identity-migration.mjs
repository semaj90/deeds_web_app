#!/usr/bin/env node
/**
 * Verify Neo4j identity migration (Phase E of user's A-F roadmap)
 * Runs verification queries to confirm graph structure
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  console.log('\n🔍 Neo4j Identity Graph Verification (Phase E)\n');
  console.log('='.repeat(60));

  try {
    // Query 1: SOMCell nodes
    const somCells = await session.run('MATCH (s:SOMCell) RETURN count(s) AS count');
    const somCount = somCells.records[0]?.get('count')?.toNumber() || 0;
    console.log(`\n✅ SOM Cells: ${somCount} (expected 400)`);
    const somPass = somCount === 400;

    // Query 2: Packets with IN_SOM relationships
    const packetsInSom = await session.run(
      'MATCH (p:Packet)-[:IN_SOM]->(s:SOMCell) RETURN count(*) AS count'
    );
    const packetsInSomCount = packetsInSom.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ Packets linked to SOM: ${packetsInSomCount} (expected > 0)`);
    const packetsPass = packetsInSomCount > 0;

    // Query 3: Feature nodes
    const features = await session.run('MATCH (f:Feature) RETURN count(f) AS count');
    const featureCount = features.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ Feature nodes: ${featureCount} (expected >= 5)`);
    const featurePass = featureCount >= 5;

    // Query 4: SIMILAR_TOPOLOGY deprecated edges
    const deprecatedEdges = await session.run(
      'MATCH ()-[r:SIMILAR_TOPOLOGY {deprecated: true}]-() RETURN count(r) AS count'
    );
    const deprecatedCount = deprecatedEdges.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ SIMILAR_TOPOLOGY marked deprecated: ${deprecatedCount} (expected > 10000)`);
    const deprecatedPass = deprecatedCount > 10000;

    // Query 5: Total SIMILAR_TOPOLOGY edges
    const allSimilarTopology = await session.run(
      'MATCH ()-[r:SIMILAR_TOPOLOGY]-() RETURN count(r) AS count'
    );
    const allSimilarCount = allSimilarTopology.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ Total SIMILAR_TOPOLOGY edges: ${allSimilarCount}`);

    // Query 6: ADJACENT_TO edges (SOM grid adjacency)
    const adjacentEdges = await session.run(
      'MATCH (sc1:SOMCell)-[adj:ADJACENT_TO]->(sc2:SOMCell) RETURN count(adj) AS count'
    );
    const adjacentCount = adjacentEdges.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ SOM grid ADJACENT_TO edges: ${adjacentCount} (expected > 1000)`);
    const adjacentPass = adjacentCount > 1000;

    // Query 7: BELONGS_TO relationships
    const belongsTo = await session.run(
      'MATCH (p:Packet)-[:BELONGS_TO]->(ct:ContextTree) RETURN count(*) AS count'
    );
    const belongsToCount = belongsTo.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ BELONGS_TO relationships: ${belongsToCount}`);

    // Query 8: HAS_FEATURE relationships
    const hasFeature = await session.run(
      'MATCH (p:Packet)-[:HAS_FEATURE]->(f:Feature) RETURN count(*) AS count'
    );
    const hasFeatureCount = hasFeature.records[0]?.get('count')?.toNumber() || 0;
    console.log(`✅ HAS_FEATURE relationships: ${hasFeatureCount}`);

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Verification Summary:\n');
    console.log(`SOM Cells (400):              ${somPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Packets→SOM links:           ${packetsPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Features (≥5):               ${featurePass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SIMILAR_TOPOLOGY deprecated: ${deprecatedPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`SOM adjacency edges:         ${adjacentPass ? '✅ PASS' : '❌ FAIL'}`);

    const allPass = somPass && packetsPass && featurePass && deprecatedPass && adjacentPass;
    console.log('\n' + '='.repeat(60));
    console.log(`\nOverall: ${allPass ? '✅ READY FOR PAGERANK' : '❌ ISSUES DETECTED'}\n`);

    process.exit(allPass ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
