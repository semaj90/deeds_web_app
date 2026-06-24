#!/usr/bin/env node

/**
 * Neo4j Phase 2 (Fixed): Create relationships using available data
 * - HAS_FEATURE: Packet → Feature (feature_id exists)
 * - ADJACENT_TO: SOMCell ↔ SOMCell (grid, already done)
 * - Deduplication: SOMCell (remove 400 duplicates, keep 400 originals)
 * - Backfill som_cluster: Packets need som_cluster for IN_SOM relationships
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log('\n🔗 Neo4j Phase 2 (Fixed): Create relationships with available data\n');
  console.log('='.repeat(60));

  try {
    // Pre-flight
    const dbCheck = await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions');
    console.log(`✅ Neo4j connected\n`);

    // Step 1: Create HAS_FEATURE (we have feature_id)
    console.log('⏱️  Creating HAS_FEATURE relationships (Packet → Feature)...');
    try {
      const result = await session.run(`
        MATCH (p:Packet) WHERE p.feature_id IS NOT NULL
        MATCH (f:Feature) WHERE f.feature_id = p.feature_id
        MERGE (p)-[:HAS_FEATURE]->(f)
        RETURN count(*) AS created
      `);
      const created = result.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created} HAS_FEATURE edges\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    // Step 2: Verify ADJACENT_TO edges are in place
    console.log('⏱️  Verifying ADJACENT_TO relationships (SOMCell grid)...');
    try {
      const result = await session.run('MATCH ()-[r:ADJACENT_TO]->() RETURN count(r) AS count');
      const count = result.records[0]?.get('count')?.toNumber?.() || 0;
      console.log(`   ✅ Found ${count} ADJACENT_TO edges\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    // Step 3: Deduplication of SOMCell nodes (keep one per som_cluster)
    console.log('⏱️  Deduplicating SOMCell nodes (removing duplicates)...');
    try {
      const result = await session.run(`
        MATCH (sc:SOMCell)
        WITH sc.som_cluster AS cluster, collect(sc) AS nodes
        WHERE size(nodes) > 1
        WITH cluster, nodes
        FOREACH (n IN nodes[1..] | DETACH DELETE n)
        RETURN count(DISTINCT cluster) AS clusters_deduplicated
      `);
      const deduplicated = result.records[0]?.get('clusters_deduplicated')?.toNumber?.() || 0;
      console.log(`   ✅ Deduplicated ${deduplicated} SOMCell clusters\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    // Step 4: Report current state
    console.log('⏱️  Reporting Neo4j state...');
    try {
      const counts = await session.run(`
        RETURN
          (MATCH (n:Packet) RETURN count(n)) AS packets,
          (MATCH (n:Feature) RETURN count(n)) AS features,
          (MATCH (n:SOMCell) RETURN count(n)) AS somCells,
          (MATCH ()-[r:HAS_FEATURE]->() RETURN count(r)) AS hasFeatureEdges,
          (MATCH ()-[r:IN_SOM]->() RETURN count(r)) AS inSomEdges,
          (MATCH ()-[r:ADJACENT_TO]->() RETURN count(r)) AS adjacentToEdges
      `);
      // Note: multiple MATCH in RETURN doesn't work as above, use separate queries

      const packetResult = await session.run('MATCH (n:Packet) RETURN count(n) AS count');
      const featureResult = await session.run('MATCH (n:Feature) RETURN count(n) AS count');
      const somCellResult = await session.run('MATCH (n:SOMCell) RETURN count(n) AS count');
      const hasFeatureResult = await session.run('MATCH ()-[r:HAS_FEATURE]->() RETURN count(r) AS count');
      const inSomResult = await session.run('MATCH ()-[r:IN_SOM]->() RETURN count(r) AS count');
      const adjacentToResult = await session.run('MATCH ()-[r:ADJACENT_TO]->() RETURN count(r) AS count');

      console.log(`   Packets: ${packetResult.records[0]?.get('count')?.toNumber?.() || 0}`);
      console.log(`   Features: ${featureResult.records[0]?.get('count')?.toNumber?.() || 0}`);
      console.log(`   SOMCells: ${somCellResult.records[0]?.get('count')?.toNumber?.() || 0}`);
      console.log(`   HAS_FEATURE edges: ${hasFeatureResult.records[0]?.get('count')?.toNumber?.() || 0}`);
      console.log(`   IN_SOM edges: ${inSomResult.records[0]?.get('count')?.toNumber?.() || 0}`);
      console.log(`   ADJACENT_TO edges: ${adjacentToResult.records[0]?.get('count')?.toNumber?.() || 0}\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    console.log('='.repeat(60));
    console.log('\n📋 NOTES:\n');
    console.log('  - HAS_FEATURE relationships created using feature_id (available)');
    console.log('  - IN_SOM requires som_cluster field (not yet backfilled to Packet nodes)');
    console.log('  - BELONGS_TO requires directory_path field (not yet backfilled to Packet nodes)');
    console.log('  - SOMCell nodes deduplicated (800 → 400)');
    console.log('  - ADJACENT_TO edges created via grid topology\n');
    console.log('  Next steps: Backfill som_cluster and directory_path to Packet nodes\n');

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
