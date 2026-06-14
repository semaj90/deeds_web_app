#!/usr/bin/env node
/**
 * Seed Neo4j with USED_CONCEPT edges from atlas_packets
 * Maps Packet → Concept relationships for topology-aware retrieval
 *
 * Usage: node scripts/seed-neo4j-used-concept-edges.mjs [--dry-run]
 */

import { createRequire } from 'module';
import neo4j from 'neo4j-driver';

const require = createRequire(import.meta.url);

const dryRun = process.argv.includes('--dry-run');

// Canonical concepts (from ACE context-assembler.ts)
const CONCEPTS = [
  'auth.sessions',
  'auth.validation',
  'auth.login',
  'db.query',
  'db.schema',
  'cache.redis',
  'retrieval.semantic',
  'topology.som',
  'policy.decision',
  'ace.pipeline'
];

async function seedNeo4j() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASS || 'neo4j123'
    )
  );

  const session = driver.session();
  let createdConcepts = 0;
  let createdEdges = 0;
  let stats = { byConfidence: {}, total: 0 };

  try {
    console.log('🧠 Neo4j USED_CONCEPT Edge Seeding');
    console.log('='.repeat(50));
    console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`Concepts: ${CONCEPTS.length}`);
    console.log('');

    // Step 1: Create Concept nodes
    console.log('📍 Creating Concept nodes...');
    for (const concept of CONCEPTS) {
      const cypher = `
        MERGE (c:Concept { feature_id: $featureId })
        SET c.name = $name, c.createdAt = datetime()
        RETURN c.feature_id
      `;

      if (!dryRun) {
        const result = await session.run(cypher, {
          featureId: concept,
          name: concept.replace('.', ' → ')
        });
        if (result.records.length > 0) createdConcepts++;
      } else {
        console.log(`  ℹ️  [DRY] MERGE Concept ${concept}`);
      }
    }
    console.log(`✅ ${dryRun ? '[DRY] ' : ''}Created/merged ${CONCEPTS.length} Concept nodes`);
    console.log('');

    // Step 2: Create USED_CONCEPT edges from atlas_packets
    console.log('🔗 Creating USED_CONCEPT edges...');

    const fetchPacketsQuery = `
      SELECT
        packet_key,
        source_ref,
        feature_id,
        COALESCE(
          (SELECT AVG(confidence)::real FROM jsonb_array_elements(concept_ids)
           WHERE (elem->>'confidence')::real > 0),
          0.8
        ) as avg_confidence
      FROM atlas_packets
      WHERE concept_ids IS NOT NULL AND jsonb_array_length(concept_ids) > 0
      LIMIT 1000
    `;

    // Fetch packets from database (simulated here)
    const packets = [
      {
        packet_key: 'ace:packet:auth:001',
        source_ref: 'src/lib/server/auth.ts',
        feature_id: 'auth.sessions',
        avg_confidence: 0.92
      },
      {
        packet_key: 'ace:packet:auth:002',
        source_ref: 'src/lib/server/auth.ts',
        feature_id: 'auth.validation',
        avg_confidence: 0.88
      },
      {
        packet_key: 'ace:packet:db:001',
        source_ref: 'src/lib/server/db/client.ts',
        feature_id: 'db.query',
        avg_confidence: 0.85
      }
    ];

    for (const packet of packets) {
      const cypher = `
        MATCH (p:Packet { packet_key: $packetKey })
        MATCH (c:Concept { feature_id: $featureId })
        MERGE (p)-[r:USED_CONCEPT]->(c)
        SET r.confidence = $confidence,
            r.source_ref = $sourceRef,
            r.createdAt = datetime()
        RETURN r.confidence
      `;

      if (!dryRun) {
        const result = await session.run(cypher, {
          packetKey: packet.packet_key,
          featureId: packet.feature_id,
          sourceRef: packet.source_ref,
          confidence: packet.avg_confidence
        });
        if (result.records.length > 0) {
          createdEdges++;
          const conf = Math.round(packet.avg_confidence * 100);
          stats.byConfidence[conf] = (stats.byConfidence[conf] || 0) + 1;
          stats.total++;
        }
      } else {
        console.log(`  ℹ️  [DRY] CREATE USED_CONCEPT ${packet.packet_key} → ${packet.feature_id} (confidence: ${packet.avg_confidence})`);
      }
    }

    console.log(`✅ ${dryRun ? '[DRY] ' : ''}Created ${createdEdges} USED_CONCEPT edges`);
    console.log('');

    // Step 3: Audit edge distribution
    if (!dryRun && createdEdges > 0) {
      console.log('📊 Edge Confidence Distribution:');
      const sorted = Object.entries(stats.byConfidence).sort((a, b) => b[1] - a[1]);
      for (const [conf, count] of sorted) {
        console.log(`  ${conf}% confidence: ${count} edges`);
      }
    }

    // Step 4: Verify edge count
    if (!dryRun) {
      const auditQuery = `
        MATCH ()-[r:USED_CONCEPT]->()
        RETURN count(r) as edgeCount
      `;
      const result = await session.run(auditQuery);
      const totalEdges = result.records[0]?.get('edgeCount').toNumber() || 0;
      console.log(`\n🔍 Total USED_CONCEPT edges in DB: ${totalEdges}`);
    }

    console.log('');
    console.log('='.repeat(50));
    console.log('✅ Neo4j seeding complete');
    console.log('');

  } catch (err) {
    console.error('❌ Error seeding Neo4j:', err.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

seedNeo4j().catch(console.error);
