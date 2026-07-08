#!/usr/bin/env node
/**
 * Write USED_CONCEPT edges to Neo4j from atlas_packets ontology data
 *
 * Reads concept_ids (or ontology JSONB keywords) from atlas_packets in Postgres,
 * creates Concept nodes + USED_CONCEPT edges from Packet → Concept.
 * Required before Neo4j GDS PageRank (needs a connected graph).
 *
 * Usage:
 *   node scripts/atlas/write-used-concept-edges-from-packets.mjs --dry-run
 *   node scripts/atlas/write-used-concept-edges-from-packets.mjs --apply
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = 500;

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Write USED_CONCEPT Edges: Postgres → Neo4j                      ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(58)}║`);
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const pgClient = await pgPool.connect();

  try {
    // 1. Pull concept data from Postgres
    // Try concept_ids column first, fall back to ontology JSONB keywords
    let packets;
    try {
      const res = await pgClient.query(`
        SELECT packet_key, source_ref, feature_id,
               concept_ids,
               domain_class
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
          AND source_ref IS NOT NULL
          AND (concept_ids IS NOT NULL AND array_length(concept_ids, 1) > 0)
        LIMIT 50000
      `);
      packets = res.rows;
      console.log(`  Source: concept_ids column — ${packets.length} packets with concepts`);
    } catch {
      // Fall back to ontology JSONB
      const res = await pgClient.query(`
        SELECT packet_key, source_ref, feature_id, domain_class,
               (ontology->>'keywords')::jsonb AS keywords
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
          AND source_ref IS NOT NULL
          AND ontology IS NOT NULL
          AND ontology->>'keywords' IS NOT NULL
        LIMIT 50000
      `);
      packets = res.rows.map(r => ({
        ...r,
        concept_ids: r.keywords ? (Array.isArray(r.keywords) ? r.keywords : JSON.parse(r.keywords)) : [],
      }));
      console.log(`  Source: ontology.keywords JSONB — ${packets.length} packets`);
    }

    if (packets.length === 0) {
      console.log('  ⚠️  No packets with concept data found.');
      console.log('  Run phase 3b ontology extraction first:');
      console.log('    node scripts/atlas/phase3b-ontology-extraction.mjs --apply');
      process.exit(0);
    }

    // Build concept set
    const conceptSet = new Set();
    for (const p of packets) {
      const ids = p.concept_ids ?? [];
      for (const c of ids) {
        if (c && typeof c === 'string') conceptSet.add(c.toLowerCase().trim());
      }
    }
    console.log(`  Unique concepts: ${conceptSet.size}`);
    console.log(`  Edges to create: ~${packets.reduce((s, p) => s + (p.concept_ids?.length ?? 0), 0)}`);

    if (DRY_RUN) {
      console.log('\n  [DRY-RUN] Would create:');
      console.log(`    MERGE (c:Concept) for ${conceptSet.size} concepts`);
      console.log(`    MERGE (:Packet)-[:USED_CONCEPT]->(:Concept) for each concept_id`);
      const sample = packets.slice(0, 3);
      for (const p of sample) {
        console.log(`    Packet ${p.packet_key} → [${(p.concept_ids ?? []).slice(0, 3).join(', ')}...]`);
      }
      console.log('\n  Re-run with --apply to write edges.');
      return;
    }

    // APPLY: write in batches
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    let totalEdges = 0;
    let totalNodes = 0;

    // Create Concept nodes
    const concepts = [...conceptSet];
    for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
      const batch = concepts.slice(i, i + BATCH_SIZE);
      await session.run(`
        UNWIND $concepts AS cid
        MERGE (c:Concept { concept_id: cid })
        ON CREATE SET c.created_at = datetime()
      `, { concepts: batch });
      totalNodes += batch.length;
      process.stdout.write(`\r  Concept nodes: ${totalNodes}/${concepts.length}`);
    }
    console.log(`\n  ✅ Created/merged ${totalNodes} Concept nodes`);

    // Create USED_CONCEPT edges
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE).map(p => ({
        packet_key: p.packet_key,
        source_ref: p.source_ref,
        concept_ids: (p.concept_ids ?? []).map(c => c?.toLowerCase?.().trim()).filter(Boolean),
      }));

      const res = await session.run(`
        UNWIND $rows AS row
        MATCH (p:Packet { packet_key: row.packet_key })
        UNWIND row.concept_ids AS cid
        MATCH (c:Concept { concept_id: cid })
        MERGE (p)-[r:USED_CONCEPT]->(c)
        ON CREATE SET r.created_at = datetime()
        RETURN count(r) AS edgesCreated
      `, { rows: batch });

      const created = res.records[0]?.get('edgesCreated')?.toNumber?.() ?? 0;
      totalEdges += created;
      process.stdout.write(`\r  USED_CONCEPT edges: ${totalEdges}`);
    }
    console.log(`\n  ✅ Created/merged ${totalEdges} USED_CONCEPT edges`);

    await session.close();

    console.log('\n  Next step:');
    console.log('    node scripts/atlas/verify-neo4j-gds-readiness.mjs');
    console.log('    node scripts/atlas/compute-pagerank-neo4j.mjs --apply');

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    pgClient.release();
    await pgPool.end();
    await driver.close();
  }
}

main();
