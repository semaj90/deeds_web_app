#!/usr/bin/env node
/**
 * verify-used-concept-edges.mjs
 *
 * Read-only audit of Packet→Concept USED_CONCEPT edges in Neo4j.
 * Checks:
 *   1. Total edge count > 0
 *   2. No duplicate edges (MERGE ensures this, but we verify)
 *   3. Supernode detection (concepts with degree > 5% of all packets)
 *   4. Concept degree distribution
 *   5. Cross-check: packets with edges vs atlas_packets rows with concepts
 *
 * Usage:
 *   node scripts/atlas/verify-used-concept-edges.mjs
 *   node scripts/atlas/verify-used-concept-edges.mjs --verbose
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL   = process.env.DATABASE_URL   || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI      = process.env.NEO4J_URI      || 'bolt://127.0.0.1:7687';
const NEO4J_USER     = process.env.NEO4J_USER     || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const VERBOSE = process.argv.includes('--verbose');

async function main() {
  console.log('\n═══ Verify Packet→Concept USED_CONCEPT Edges ═══');

  // ── 1. Postgres baseline ───────────────────────────────────────────────────
  const pool = new Pool({ connectionString: DATABASE_URL });
  let pgPacketCount = 0;
  let pgEdgesExpected = 0;

  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)               AS packets_with_concepts,
             SUM(cardinality(concept_ids)) AS total_concept_refs
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND concept_ids IS NOT NULL
        AND cardinality(concept_ids) > 0
    `);
    pgPacketCount   = Number(rows[0].packets_with_concepts);
    pgEdgesExpected = Number(rows[0].total_concept_refs);
  } finally {
    await pool.end();
  }

  console.log(`\nPostgres baseline:`);
  console.log(`  Packets with concept_ids:  ${pgPacketCount.toLocaleString()}`);
  console.log(`  Total concept_id refs:     ${pgEdgesExpected.toLocaleString()}`);

  // ── 2. Neo4j queries ───────────────────────────────────────────────────────
  let driver;
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      maxConnectionPoolSize: 4,
      connectionAcquisitionTimeout: 10_000,
    });
    await driver.verifyConnectivity();
  } catch (err) {
    console.error(`\n⚠️  Neo4j unavailable: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const session = driver.session({ database: 'neo4j' });
  const report = { generated_at: new Date().toISOString() };

  try {
    // 2a. Total edges (all sources)
    const r1 = await session.run(`
      MATCH (p:Packet)-[r:USED_CONCEPT]->(c:Concept)
      RETURN count(r) AS total_edges,
             count(DISTINCT p) AS packets_with_edges,
             count(DISTINCT c) AS concepts_reached
    `);
    const rec1 = r1.records[0];
    const totalEdges    = rec1.get('total_edges').toNumber();
    const packetsLinked = rec1.get('packets_with_edges').toNumber();
    const conceptsReached = rec1.get('concepts_reached').toNumber();

    // 2b. atlas_packets source specifically
    const r2 = await session.run(`
      MATCH (p:Packet)-[r:USED_CONCEPT {source: 'atlas_packets'}]->(c:Concept)
      RETURN count(r) AS atlas_edges,
             count(DISTINCT p) AS atlas_packets,
             count(DISTINCT c) AS atlas_concepts
    `);
    const rec2 = r2.records[0];
    const atlasEdges    = rec2.get('atlas_edges').toNumber();
    const atlasPackets  = rec2.get('atlas_packets').toNumber();
    const atlasConcepts = rec2.get('atlas_concepts').toNumber();

    console.log(`\nNeo4j USED_CONCEPT edges (all sources):`);
    console.log(`  Total edges:               ${totalEdges.toLocaleString()}`);
    console.log(`  Packets with any edge:     ${packetsLinked.toLocaleString()}`);
    console.log(`  Distinct concepts reached: ${conceptsReached}`);

    console.log(`\nNeo4j USED_CONCEPT edges (source=atlas_packets):`);
    console.log(`  Atlas edges:               ${atlasEdges.toLocaleString()}`);
    console.log(`  Atlas packets linked:      ${atlasPackets.toLocaleString()}`);
    console.log(`  Atlas concepts reached:    ${atlasConcepts}`);

    // 2c. Duplicate edge check (should be 0 because MERGE)
    const r3 = await session.run(`
      MATCH (p:Packet)-[r:USED_CONCEPT]->(c:Concept)
      WITH p, c, count(r) AS rels
      WHERE rels > 1
      RETURN count(*) AS duplicate_pairs
    `);
    const duplicates = r3.records[0].get('duplicate_pairs').toNumber();

    // 2d. Top concepts by degree (supernode check)
    const r4 = await session.run(`
      MATCH (p:Packet)-[:USED_CONCEPT {source: 'atlas_packets'}]->(c:Concept)
      WITH c, count(p) AS degree
      RETURN coalesce(c.label, c.name) AS concept, degree
      ORDER BY degree DESC LIMIT 25
    `);
    const topConcepts = r4.records.map(r => ({
      concept: r.get('concept'),
      degree:  r.get('degree').toNumber(),
    }));

    // 2e. Degree distribution
    const r5 = await session.run(`
      MATCH (p:Packet)-[:USED_CONCEPT {source: 'atlas_packets'}]->(c:Concept)
      WITH c, count(p) AS degree
      RETURN
        sum(CASE WHEN degree = 1 THEN 1 ELSE 0 END) AS singleton,
        sum(CASE WHEN degree >= 2  AND degree < 10  THEN 1 ELSE 0 END) AS low,
        sum(CASE WHEN degree >= 10 AND degree < 100 THEN 1 ELSE 0 END) AS mid,
        sum(CASE WHEN degree >= 100 THEN 1 ELSE 0 END) AS high
    `);
    const dist = r5.records[0];
    const distSingleton = dist.get('singleton').toNumber();
    const distLow       = dist.get('low').toNumber();
    const distMid       = dist.get('mid').toNumber();
    const distHigh      = dist.get('high').toNumber();

    // ── 3. Gate evaluation ──────────────────────────────────────────────────
    const coveragePct   = pgPacketCount > 0 ? atlasPackets / pgPacketCount : 0;
    const supernodeCount = topConcepts.filter(c => c.degree > pgPacketCount * 0.05).length;

    const gateEdges     = atlasEdges > 0;
    const gateDuplicates= duplicates === 0;
    const gateCoverage  = coveragePct >= 0.50;
    const gateSupernodes= supernodeCount === 0;
    const gatePass      = gateEdges && gateDuplicates && gateCoverage;

    console.log(`\nTop 25 concepts by Packet degree:`);
    for (const { concept, degree } of topConcepts) {
      const superFlag = degree > pgPacketCount * 0.05 ? ' ⚠️ SUPERNODE' : '';
      console.log(`  ${String(concept).padEnd(45)} ${degree}${superFlag}`);
    }

    console.log(`\nDegree distribution:`);
    console.log(`  Singleton (degree=1):      ${distSingleton}`);
    console.log(`  Low (2–9):                 ${distLow}`);
    console.log(`  Mid (10–99):               ${distMid}`);
    console.log(`  High (≥100):               ${distHigh}`);

    console.log(`\nCross-check (Neo4j atlas vs Postgres):`);
    console.log(`  PG packets with concepts:  ${pgPacketCount.toLocaleString()}`);
    console.log(`  Neo4j packets linked:      ${atlasPackets.toLocaleString()}`);
    console.log(`  Coverage:                  ${(coveragePct * 100).toFixed(1)}%`);

    console.log(`\n══ Gate Evaluation ══════════════════════════════`);
    console.log(`  Edges > 0:                  ${gateEdges ? '✅' : '❌'} (${atlasEdges})`);
    console.log(`  Duplicate edges = 0:        ${gateDuplicates ? '✅' : '❌'} (${duplicates} duplicates)`);
    console.log(`  Coverage ≥ 50%:             ${gateCoverage ? '✅' : '❌'} (${(coveragePct*100).toFixed(1)}%)`);
    console.log(`  Supernodes (>5% packets):   ${gateSupernodes ? '✅' : '⚠️ '} (${supernodeCount} supernodes)`);
    console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

    Object.assign(report, {
      postgres: { packets_with_concepts: pgPacketCount, total_concept_refs: pgEdgesExpected },
      neo4j: {
        total_edges: totalEdges,
        packets_with_edges: packetsLinked,
        concepts_reached: conceptsReached,
        atlas_edges: atlasEdges,
        atlas_packets: atlasPackets,
        atlas_concepts: atlasConcepts,
        duplicate_pairs: duplicates,
      },
      degree_distribution: { singleton: distSingleton, low: distLow, mid: distMid, high: distHigh },
      top_concepts: topConcepts.slice(0, 25),
      supernodes: topConcepts.filter(c => c.degree > pgPacketCount * 0.05),
      coverage_pct: coveragePct,
      gate: { edges: gateEdges, duplicates: gateDuplicates, coverage: gateCoverage, supernodes: gateSupernodes, pass: gatePass },
    });

  } finally {
    await session.close();
    await driver.close();
  }

  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'verify-used-concept-edges.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: docs/reports/verify-used-concept-edges.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
