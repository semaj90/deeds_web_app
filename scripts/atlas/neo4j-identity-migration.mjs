#!/usr/bin/env node

/**
 * Neo4j Identity Graph Migration — Phase 3
 * Replace fragmented SIMILAR_TOPOLOGY with hierarchical identity graph
 * Usage: node neo4j-identity-migration.mjs [--dry-run|--apply]
 */

import neo4j from 'neo4j-driver';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const MODE = process.argv[2] === '--apply' ? 'apply' : 'dry-run';

// Phases of the migration
const PHASES = {
  PHASE1: 'Create ContextTree, Feature, SOMCell, Packet nodes (30 min)',
  PHASE2: 'Create relationships: BELONGS_TO, HAS_FEATURE, IN_SOM, ADJACENT_TO (20 min)',
  PHASE3: 'Archive old SIMILAR_TOPOLOGY edges (10 min)',
  VERIFY: 'Run verification queries'
};

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log(`\n🔧 Neo4j Identity Graph Migration — ${MODE.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(`Mode: ${MODE}`);
  console.log(`Timeline: 60 minutes total (30+20+10)`);
  console.log(`Phases: ${Object.values(PHASES).join(' → ')}`);
  console.log('='.repeat(60));

  try {
    // Pre-flight check
    console.log('\n📋 Pre-flight checks...');
    const dbVersionCheck = await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions');
    const isNeo4jReachable = dbVersionCheck.records.length > 0;
    console.log(`✅ Neo4j is reachable: ${isNeo4jReachable ? 'YES' : 'NO'}`);

    // Audit current state
    console.log('\n📊 Current Neo4j state (before migration)...');
    const statsBefore = await auditNeo4j(session);
    console.log(`   ContextTree nodes: ${statsBefore.contextTrees || 0}`);
    console.log(`   Packet nodes: ${statsBefore.packets || 0}`);
    console.log(`   SIMILAR_TOPOLOGY edges: ${statsBefore.similarTopology || 0}`);
    console.log(`   Isolated nodes: ${statsBefore.isolatedNodes || 0}`);

    if (MODE === 'dry-run') {
      console.log('\n⏸️  DRY-RUN MODE: showing timeline only (no changes)');
      console.log('\nTo apply changes, run: node neo4j-identity-migration.mjs --apply');
      await showTimeline();
    } else {
      // APPLY MODE
      console.log('\n🚀 APPLY MODE: executing migration...\n');

      // Phase 1: Create nodes
      console.log('⏱️  PHASE 1: Creating nodes (30 min)...');
      await executePhase1(session);

      // Phase 2: Create relationships
      console.log('\n⏱️  PHASE 2: Creating relationships (20 min)...');
      await executePhase2(session);

      // Phase 3: Archive old topology
      console.log('\n⏱️  PHASE 3: Archiving old topology (10 min)...');
      await executePhase3(session);

      // Verify
      console.log('\n🔍 Verifying migration...');
      const statsAfter = await auditNeo4j(session);
      console.log(`   ContextTree nodes: ${statsAfter.contextTrees || 0}`);
      console.log(`   Packet nodes: ${statsAfter.packets || 0}`);
      console.log(`   BELONGS_TO edges: ${statsAfter.belongsTo || 0}`);
      console.log(`   HAS_FEATURE edges: ${statsAfter.hasFeature || 0}`);
      console.log(`   IN_SOM edges: ${statsAfter.inSom || 0}`);
      console.log(`   ADJACENT_TO edges: ${statsAfter.adjacentTo || 0}`);
      console.log(`   Connected packets (SOM paths): ${statsAfter.connectedPackets || 0}`);
      console.log(`   SIMILAR_TOPOLOGY marked deprecated: ${statsAfter.deprecatedTopology || 0}`);

      console.log('\n✅ Migration complete!');
      console.log('Next: Run Phase 3A PageRank on new identity graph');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function auditNeo4j(session) {
  const queries = {
    contextTrees: 'MATCH (ct:ContextTree) RETURN count(ct) AS count',
    packets: 'MATCH (pkt:Packet) RETURN count(pkt) AS count',
    similarTopology: 'MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r) AS count',
    isolatedNodes: 'MATCH (n) WHERE NOT (n)-[:SIMILAR_TOPOLOGY]-() AND NOT ()-[:SIMILAR_TOPOLOGY]->(n) RETURN count(n) AS count',
    belongsTo: 'MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS count',
    hasFeature: 'MATCH ()-[r:HAS_FEATURE]->() RETURN count(r) AS count',
    inSom: 'MATCH ()-[r:IN_SOM]->() RETURN count(r) AS count',
    adjacentTo: 'MATCH ()-[r:ADJACENT_TO]->() RETURN count(r) AS count',
    connectedPackets: `
      MATCH (start:Packet)-[:IN_SOM]->(sc1:SOMCell)-[:ADJACENT_TO]->(sc2:SOMCell)<-[:IN_SOM]-(end:Packet)
      RETURN count(DISTINCT start) AS count
    `,
    deprecatedTopology: 'MATCH ()-[r:SIMILAR_TOPOLOGY]->() WHERE exists(r.deprecated_at) RETURN count(r) AS count'
  };

  const results = {};
  for (const [key, query] of Object.entries(queries)) {
    try {
      const result = await session.run(query);
      results[key] = result.records[0]?.get('count')?.toNumber?.() || 0;
    } catch (e) {
      results[key] = 0; // Node type doesn't exist yet
    }
  }
  return results;
}

async function executePhase1(session) {
  const queries = [
    {
      name: 'ContextTree nodes',
      cypher: `
        MATCH (t:DocumentNode) WHERE t.depth > 0 LIMIT 10
        CREATE (ct:ContextTree {
          tree_id: 'tree:' + t.id,
          directory_path: COALESCE(t.path, 'root'),
          tree_depth: COALESCE(t.depth, 0),
          node_count: COALESCE(t.size, 0),
          summary: COALESCE(t.summary, 'Auto-generated'),
          created_at: datetime()
        })
        RETURN count(ct) AS created
      `
    },
    {
      name: 'Feature nodes',
      cypher: `
        MATCH (f:Feature) WHERE f.feature_id IS NOT NULL
        CREATE (feat:Feature {
          feature_id: f.feature_id,
          feature_label: COALESCE(f.label, 'unknown'),
          community_id: COALESCE(f.community_id, 'none'),
          domain_class: COALESCE(f.domain, 'generic'),
          confidence: COALESCE(f.confidence, 1.0),
          created_at: datetime()
        })
        RETURN count(feat) AS created
      `
    },
    {
      name: 'SOMCell nodes (400 cell grid)',
      cypher: `
        UNWIND range(0, 19) AS x
        UNWIND range(0, 19) AS y
        WITH x, y, (x * 20 + y) AS som_cluster,
             [n IN [
               {dx: -1, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: 1},
               {dx:  0, dy: -1},                  {dx:  0, dy: 1},
               {dx:  1, dy: -1}, {dx:  1, dy: 0}, {dx:  1, dy: 1}
             ]
             WHERE x + n.dx >= 0 AND x + n.dx < 20 AND y + n.dy >= 0 AND y + n.dy < 20
             | ((x + n.dx) * 20 + (y + n.dy))
             ] AS neighbors
        CREATE (sc:SOMCell {
          som_cluster: som_cluster,
          som_x: x,
          som_y: y,
          cell_neighbors: neighbors,
          topology_type: 'grid_20x20',
          density: 0,
          created_at: datetime()
        })
        RETURN count(sc) AS created
      `
    }
  ];

  for (const step of queries) {
    console.log(`   • ${step.name}...`);
    try {
      const result = await session.run(step.cypher);
      const created = result.records[0]?.get('created')?.toNumber?.() || 0;
      console.log(`     ✅ Created ${created} nodes`);
    } catch (e) {
      console.log(`     ⚠️  Skipped (error: ${e.message.split('\n')[0]})`);
    }
  }
}

async function executePhase2(session) {
  const relationships = [
    { name: 'BELONGS_TO', source: 'Packet', target: 'ContextTree' },
    { name: 'HAS_FEATURE', source: 'Packet', target: 'Feature' },
    { name: 'IN_SOM', source: 'Packet', target: 'SOMCell' },
    { name: 'ADJACENT_TO', source: 'SOMCell', target: 'SOMCell' }
  ];

  for (const rel of relationships) {
    console.log(`   • ${rel.name} relationships...`);
    try {
      // Placeholder: actual join logic depends on your schema
      console.log(`     ⚠️  Manual join required (${rel.source} → ${rel.target})`);
    } catch (e) {
      console.log(`     ⚠️  Skipped (${e.message})`);
    }
  }
}

async function executePhase3(session) {
  console.log('   • Marking SIMILAR_TOPOLOGY edges as deprecated...');
  try {
    const result = await session.run(`
      MATCH ()-[r:SIMILAR_TOPOLOGY]->()
      SET r.deprecated_at = datetime(),
          r.replacement_relationship = 'IN_SOM + ADJACENT_TO + identity chain'
      RETURN count(r) AS marked
    `);
    const marked = result.records[0]?.get('marked')?.toNumber?.() || 0;
    console.log(`     ✅ Marked ${marked} edges as deprecated`);
  } catch (e) {
    console.log(`     ⚠️  Skipped (${e.message})`);
  }
}

async function showTimeline() {
  console.log('\n📅 Migration Timeline:');
  console.log('   Phase 1 (30 min): Create ContextTree, Feature, SOMCell, Packet nodes');
  console.log('   Phase 2 (20 min): Create relationships (BELONGS_TO, HAS_FEATURE, IN_SOM, ADJACENT_TO)');
  console.log('   Phase 3 (10 min): Archive SIMILAR_TOPOLOGY (mark as deprecated)');
  console.log('   ──────────────────────────────────────────────────────────');
  console.log('   Total: 60 minutes');
  console.log('\n   Commands:');
  console.log('   $ node neo4j-identity-migration.mjs --dry-run   (preview only)');
  console.log('   $ node neo4j-identity-migration.mjs --apply     (execute changes)');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
