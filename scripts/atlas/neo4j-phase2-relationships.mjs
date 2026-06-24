#!/usr/bin/env node

/**
 * Neo4j Phase 2: Create relationships (manual execution)
 * Completes the identity migration by wiring:
 * - IN_SOM: Packet → SOMCell
 * - HAS_FEATURE: Packet → Feature
 * - ADJACENT_TO: SOMCell ↔ SOMCell (grid)
 * - BELONGS_TO: Packet → ContextTree
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log('\n🔗 Neo4j Phase 2: Creating Relationships\n');
  console.log('='.repeat(60));

  try {
    // Pre-check
    const dbCheck = await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions');
    console.log(`✅ Neo4j connected: ${dbCheck.records.length > 0 ? 'YES' : 'NO'}\n`);

    // Relationship 1: IN_SOM (Packet → SOMCell via som_cluster)
    console.log('⏱️  Creating IN_SOM relationships (Packet → SOMCell)...');
    try {
      const result1 = await session.run(`
        MATCH (p:Packet) WHERE p.som_cluster IS NOT NULL
        MATCH (sc:SOMCell) WHERE sc.som_cluster = p.som_cluster
        CREATE (p)-[:IN_SOM]->(sc)
        RETURN count(*) AS created
      `);
      const created1 = result1.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created1} IN_SOM edges\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    // Relationship 2: HAS_FEATURE (Packet → Feature via feature_id)
    console.log('⏱️  Creating HAS_FEATURE relationships (Packet → Feature)...');
    try {
      const result2 = await session.run(`
        MATCH (p:Packet) WHERE p.feature_id IS NOT NULL
        MATCH (f:Feature) WHERE f.feature_id = p.feature_id
        CREATE (p)-[:HAS_FEATURE]->(f)
        RETURN count(*) AS created
      `);
      const created2 = result2.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created2} HAS_FEATURE edges\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    // Relationship 3: ADJACENT_TO (SOMCell grid adjacency)
    console.log('⏱️  Creating ADJACENT_TO relationships (SOMCell grid)...');
    try {
      const result3 = await session.run(`
        MATCH (sc1:SOMCell)
        WITH sc1
        UNWIND sc1.cell_neighbors AS neighbor_cluster
        MATCH (sc2:SOMCell) WHERE sc2.som_cluster = neighbor_cluster
        CREATE (sc1)-[:ADJACENT_TO]->(sc2)
        RETURN count(*) AS created
      `);
      const created3 = result3.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created3} ADJACENT_TO edges\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    // Relationship 4: BELONGS_TO (Packet → ContextTree)
    // Note: Requires logic to match Packet.directory_path to ContextTree.directory_path
    console.log('⏱️  Creating BELONGS_TO relationships (Packet → ContextTree)...');
    try {
      const result4 = await session.run(`
        MATCH (p:Packet) WHERE p.directory_path IS NOT NULL
        MATCH (ct:ContextTree) WHERE ct.directory_path = p.directory_path
        CREATE (p)-[:BELONGS_TO]->(ct)
        RETURN count(*) AS created
      `);
      const created4 = result4.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`   ✅ Created ${created4} BELONGS_TO edges\n`);
    } catch (e) {
      console.log(`   ⚠️  Error: ${e.message}\n`);
    }

    console.log('='.repeat(60));
    console.log('\n✅ Phase 2 Complete!\n');

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
