#!/usr/bin/env node
/**
 * write-used-concept-edges.mjs
 *
 * Projects atlas_packets.concept_ids from Postgres into Neo4j as
 * USED_CONCEPT edges:
 *
 *   (:Packet {packet_key}) -[:USED_CONCEPT]-> (:Concept {label})
 *
 * Neo4j already has Concept nodes keyed by hex SHA `name` (from the trace
 * seeding pass). This script uses `label` as the stable merge key for
 * human-readable concept strings like "database_orm", "bm25", etc.
 * If a Concept node with matching `label` doesn't exist it is created.
 * Existing Concept SHA-hex nodes are NOT modified.
 *
 * Safe to re-run — all writes use MERGE (idempotent).
 *
 * Usage:
 *   node scripts/atlas/write-used-concept-edges.mjs              # dry-run
 *   node scripts/atlas/write-used-concept-edges.mjs --apply
 *   node scripts/atlas/write-used-concept-edges.mjs --apply --limit=500
 *   node scripts/atlas/write-used-concept-edges.mjs --apply --verbose
 *
 * Gate (PASS condition):
 *   edges_created >= 1000
 *   unique_concepts >= 5
 *   error_rate < 0.05
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const NEO4J_URI      = process.env.NEO4J_URI      || 'bolt://127.0.0.1:7687';
const NEO4J_USER     = process.env.NEO4J_USER     || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const APPLY      = process.argv.includes('--apply');
const DRY_RUN    = !APPLY;
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS   = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE    = process.argv.includes('--verbose');
const BATCH_SIZE = 100;

// ── helpers ───────────────────────────────────────────────────────────────────

function normaliseLabel(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 120) return null;
  return s;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Load packets from Postgres ─────────────────────────────────────────
  const pool = new Pool({ connectionString: DATABASE_URL });

  let rows;
  let canonicalIds;
  try {
    // Canonical taxonomy from concept_records (the authoritative label set)
    const { rows: crRows } = await pool.query(`SELECT concept_id FROM concept_records`);
    canonicalIds = new Set(crRows.map(r => r.concept_id));

    const { rows: r } = await pool.query(`
      SELECT packet_key,
             concept_ids
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND concept_ids IS NOT NULL
        AND cardinality(concept_ids) > 0
      ORDER BY packet_key
      LIMIT $1
    `, [MAX_ROWS === Infinity ? 1_000_000 : MAX_ROWS]);
    rows = r;
  } finally {
    await pool.end();
  }

  console.log(`Canonical concept taxonomy: ${canonicalIds.size} labels (${[...canonicalIds].sort().join(', ')})`);

  const total = rows.length;
  console.log(`\n═══ Write Packet→Concept USED_CONCEPT Edges ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  console.log(`Packets with concept_ids: ${total}`);

  if (total === 0) {
    console.log('\nNo packets to process — run atlas:4b:enrich-all first.');
    return;
  }

  // ── 2. Inventory (canonical labels only) ──────────────────────────────────
  let edgesPlanned = 0;
  let noisyTokensDropped = 0;
  const conceptLabels = new Set();

  for (const row of rows) {
    const all = (row.concept_ids ?? []).map(normaliseLabel).filter(Boolean);
    const canonical = all.filter(c => canonicalIds.has(c));
    noisyTokensDropped += all.length - canonical.length;
    edgesPlanned += canonical.length;
    for (const c of canonical) conceptLabels.add(c);
  }

  console.log(`\nEdges planned:    ${edgesPlanned} (canonical only)`);
  console.log(`Noisy tokens:     ${noisyTokensDropped} dropped (path fragments, etc.)`);
  console.log(`Unique concepts:  ${conceptLabels.size}`);
  console.log(`Concept labels:   ${[...conceptLabels].sort().join(', ')}`);

  // ── 3. Write report / exit on dry-run ─────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    packets_with_concepts: total,
    edges_planned: edgesPlanned,
    noisy_tokens_dropped: noisyTokensDropped,
    unique_concept_labels: conceptLabels.size,
    canonical_taxonomy: [...canonicalIds].sort(),
    concept_labels: [...conceptLabels].sort(),
  };

  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'write-used-concept-edges.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: docs/reports/write-used-concept-edges.json`);

  if (DRY_RUN) {
    console.log('\n(dry-run — no Neo4j writes; run with --apply to commit)');
    return;
  }

  // ── 4. Connect to Neo4j ────────────────────────────────────────────────────
  let driver;
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      maxConnectionPoolSize: 8,
      connectionAcquisitionTimeout: 15_000,
    });
    await driver.verifyConnectivity();
    console.log(`\nNeo4j connected: ${NEO4J_URI}`);
  } catch (err) {
    console.error(`\n⚠️  Neo4j unavailable (${err.message}) — aborting`);
    process.exitCode = 1;
    return;
  }

  // ── 5. Pre-create Concept nodes for all labels (one batch) ────────────────
  // This avoids deadlocks when multiple MERGE (c:Concept {label}) run in
  // parallel inside per-packet transactions.
  console.log(`\nEnsuring ${conceptLabels.size} Concept nodes…`);
  const labelList = [...conceptLabels].sort();

  {
    const session = driver.session({ database: 'neo4j' });
    try {
      for (let i = 0; i < labelList.length; i += 200) {
        const chunk = labelList.slice(i, i + 200);
        await session.run(`
          UNWIND $labels AS lbl
          MERGE (:Concept {label: lbl})
        `, { labels: chunk });
      }
    } finally {
      await session.close();
    }
  }
  console.log('Concept nodes ensured.');

  // ── 6. Write USED_CONCEPT edges in batches ────────────────────────────────
  const cypher = `
    UNWIND $pairs AS pair
    MATCH (p:Packet {packet_key: pair.packet_key})
    MATCH (c:Concept {label: pair.label})
    MERGE (p)-[r:USED_CONCEPT]->(c)
    SET r.source     = 'atlas_packets',
        r.updated_at = datetime()
  `;

  let applied = 0;
  let skipped = 0;
  let errors  = 0;

  // Flatten to (packet_key, label) pairs — canonical taxonomy labels only
  const pairs = [];
  for (const row of rows) {
    const concepts = (row.concept_ids ?? [])
      .map(normaliseLabel)
      .filter(c => c !== null && canonicalIds.has(c));
    for (const label of concepts) {
      pairs.push({ packet_key: row.packet_key, label });
    }
  }

  const session = driver.session({ database: 'neo4j' });
  try {
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      try {
        await session.run(cypher, { pairs: batch });
        applied += batch.length;
      } catch (err) {
        errors += batch.length;
        if (VERBOSE) console.error(`Batch ${i}–${i + batch.length} failed: ${err.message}`);
      }

      if (VERBOSE || (i > 0 && i % 2000 === 0)) {
        console.log(`  ${Math.min(i + BATCH_SIZE, pairs.length).toLocaleString()} / ${pairs.length.toLocaleString()} pairs written…`);
      }
    }
  } finally {
    await session.close();
  }

  // ── 7. Verify ─────────────────────────────────────────────────────────────
  let edgeCount = 0;
  let packetCount = 0;
  let conceptCount = 0;

  const verifySession = driver.session({ database: 'neo4j' });
  try {
    const r1 = await verifySession.run(`
      MATCH (p:Packet)-[r:USED_CONCEPT {source: 'atlas_packets'}]->(c:Concept)
      RETURN count(r) AS edges,
             count(DISTINCT p) AS packets,
             count(DISTINCT c) AS concepts
    `);
    const rec = r1.records[0];
    edgeCount    = rec.get('edges').toNumber();
    packetCount  = rec.get('packets').toNumber();
    conceptCount = rec.get('concepts').toNumber();

    // Top concept nodes by degree (supernode detection)
    const r2 = await verifySession.run(`
      MATCH (p:Packet)-[:USED_CONCEPT {source: 'atlas_packets'}]->(c:Concept)
      WITH c, count(p) AS degree
      RETURN coalesce(c.label, c.name) AS concept, degree
      ORDER BY degree DESC LIMIT 20
    `);
    console.log('\nTop concepts by Packet degree:');
    for (const rec of r2.records) {
      console.log(`  ${rec.get('concept').padEnd(40)} ${rec.get('degree')}`);
    }
  } finally {
    await verifySession.close();
  }
  await driver.close();

  // ── 8. Gate evaluation ────────────────────────────────────────────────────
  const errorRate  = pairs.length > 0 ? errors / pairs.length : 1;
  const gateEdges  = edgeCount >= 1000;
  const gateConcepts = conceptCount >= 5;
  const gateErrors = errorRate < 0.05;
  const gatePass   = gateEdges && gateConcepts && gateErrors;

  console.log('\n══ Gate Evaluation ══════════════════════════════');
  console.log(`  Edges in Neo4j (atlas_packets src): ${edgeCount.toLocaleString()}`);
  console.log(`  Distinct Packet nodes with edges:   ${packetCount.toLocaleString()}`);
  console.log(`  Distinct Concept nodes reached:     ${conceptCount}`);
  console.log(`  Error rate:                         ${(errorRate * 100).toFixed(1)}%`);
  console.log(`  Gate edges ≥ 1000:                  ${gateEdges ? '✅' : '❌'} (${edgeCount})`);
  console.log(`  Gate concepts ≥ 5:                  ${gateConcepts ? '✅' : '❌'} (${conceptCount})`);
  console.log(`  Gate error rate < 5%:               ${gateErrors ? '✅' : '❌'} (${(errorRate*100).toFixed(1)}%)`);
  console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  // Persist final report
  Object.assign(report, {
    applied_pairs: applied,
    skipped_pairs: skipped,
    error_pairs:   errors,
    neo4j: { edge_count: edgeCount, packet_count: packetCount, concept_count: conceptCount },
    gate: { edges: gateEdges, concepts: gateConcepts, error_rate: gateErrors, pass: gatePass },
  });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Pairs applied: ${applied.toLocaleString()}`);
  console.log(`  Errors:        ${errors}`);
  console.log(`  Report:        docs/reports/write-used-concept-edges.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
