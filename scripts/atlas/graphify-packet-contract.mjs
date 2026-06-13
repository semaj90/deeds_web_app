#!/usr/bin/env node
/**
 * graphify-packet-contract.mjs
 *
 * Packet Contract Lane — Neo4j graph edges (step 5 of 7).
 *
 * Creates three edge types after metadata gate passes:
 *   (Packet {packet_key}) -[:FROM_SOURCE]->    (:SourceRef  {source_ref})
 *   (Packet {packet_key}) -[:IMPLEMENTS_FEATURE]-> (:Feature {feature_id})
 *   (Packet {packet_key}) -[:IN_COMMUNITY]->   (:Community {community_id})
 *
 * Does NOT create new packet models.
 * Uses MERGE so re-runs are idempotent.
 * Skips packets with NULL source_ref/feature_id/community_id gracefully.
 *
 * Usage:
 *   node scripts/atlas/graphify-packet-contract.mjs            # dry-run
 *   node scripts/atlas/graphify-packet-contract.mjs --apply
 *   node scripts/atlas/graphify-packet-contract.mjs --apply --verbose
 *   node scripts/atlas/graphify-packet-contract.mjs --apply --limit=1000
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL  = process.env.NEO4J_URL  || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

const BATCH_SIZE = 200;

// ── Neo4j HTTP helper ─────────────────────────────────────────────────────────

async function neo4jBatch(statements) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Graphify Packet Contract ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  // Load packets with at least one linkable field
  const { rows: packets } = await pool.query(`
    SELECT packet_key, source_ref, feature_id, community_id,
           payload->>'path' AS meta_path
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND (source_ref IS NOT NULL OR feature_id IS NOT NULL OR community_id IS NOT NULL)
    ORDER BY packet_key
    ${MAX_ROWS < Infinity ? `LIMIT ${MAX_ROWS}` : ''}
  `);

  console.log(`Packets eligible for graphify: ${packets.length}`);

  const hasSrc  = packets.filter(p => p.source_ref).length;
  const hasFeat = packets.filter(p => p.feature_id).length;
  const hasCom  = packets.filter(p => p.community_id != null).length;
  console.log(`  WITH source_ref:    ${hasSrc}`);
  console.log(`  WITH feature_id:    ${hasFeat}`);
  console.log(`  WITH community_id:  ${hasCom}`);

  if (DRY_RUN) {
    console.log('\nSample edges (first 5):');
    for (const p of packets.slice(0, 5)) {
      if (p.source_ref)    console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:FROM_SOURCE]->(SourceRef:${p.source_ref.slice(0,30)})`);
      if (p.feature_id)    console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:IMPLEMENTS_FEATURE]->(Feature:${p.feature_id.slice(0,30)})`);
      if (p.community_id != null) console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:IN_COMMUNITY]->(Community:${p.community_id})`);
    }
    console.log('\n(dry-run — run with --apply to write Neo4j edges)');

    writeReport({
      generated_at: new Date().toISOString(), mode: 'dry-run',
      eligible_packets: packets.length,
      with_source_ref: hasSrc, with_feature_id: hasFeat, with_community_id: hasCom,
    });
    await pool.end();
    return;
  }

  // ── Verify Neo4j reachability ─────────────────────────────────────────────
  try {
    await neo4jBatch([{ statement: 'RETURN 1' }]);
    console.log('\nNeo4j: reachable');
  } catch (err) {
    console.error(`\n⚠️  Neo4j not reachable: ${err.message}`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  // ── Pre-create stub SourceRef and Community nodes in bulk ─────────────────
  const srcRefs = [...new Set(packets.filter(p => p.source_ref).map(p => p.source_ref))];
  const comIds  = [...new Set(packets.filter(p => p.community_id != null).map(p => p.community_id))];

  if (srcRefs.length > 0) {
    await neo4jBatch([{
      statement: `
        UNWIND $refs AS ref
        MERGE (s:SourceRef {source_ref: ref})
        SET s.updated_at = datetime()
      `,
      parameters: { refs: srcRefs },
    }]);
    console.log(`Pre-created/merged ${srcRefs.length} SourceRef nodes`);
  }

  if (comIds.length > 0) {
    await neo4jBatch([{
      statement: `
        UNWIND $ids AS cid
        MERGE (c:Community {community_id: cid})
        SET c.updated_at = datetime()
      `,
      parameters: { ids: comIds },
    }]);
    console.log(`Pre-created/merged ${comIds.length} Community nodes`);
  }

  // ── Write edges in batches ────────────────────────────────────────────────
  let edgesSource = 0, edgesFeature = 0, edgesCommunity = 0, batchErrors = 0;

  for (let i = 0; i < packets.length; i += BATCH_SIZE) {
    const batch = packets.slice(i, i + BATCH_SIZE);

    const statements = [];

    // FROM_SOURCE edges — MERGE Packet so new packets are created if absent
    const srcBatch = batch.filter(p => p.source_ref);
    if (srcBatch.length > 0) {
      statements.push({
        statement: `
          UNWIND $rows AS row
          MERGE (p:Packet {packet_key: row.pk})
            ON CREATE SET p.source_ref = row.sr, p.created_at = datetime()
          MERGE (s:SourceRef {source_ref: row.sr})
          MERGE (p)-[r:FROM_SOURCE]->(s)
          SET r.source = 'atlas_packets', r.updated_at = datetime()
        `,
        parameters: { rows: srcBatch.map(p => ({ pk: p.packet_key, sr: p.source_ref })) },
      });
      edgesSource += srcBatch.length;
    }

    // IMPLEMENTS_FEATURE edges — Feature nodes use {name: sha_hex}
    const featBatch = batch.filter(p => p.feature_id);
    if (featBatch.length > 0) {
      statements.push({
        statement: `
          UNWIND $rows AS row
          MERGE (p:Packet {packet_key: row.pk})
          MERGE (f:Feature {name: row.fid})
            ON CREATE SET f.feature_id = row.fid
          MERGE (p)-[r:IMPLEMENTS_FEATURE]->(f)
          SET r.source = 'atlas_packets', r.updated_at = datetime()
        `,
        parameters: { rows: featBatch.map(p => ({ pk: p.packet_key, fid: p.feature_id })) },
      });
      edgesFeature += featBatch.length;
    }

    // IN_COMMUNITY edges
    const comBatch = batch.filter(p => p.community_id != null);
    if (comBatch.length > 0) {
      statements.push({
        statement: `
          UNWIND $rows AS row
          MERGE (p:Packet {packet_key: row.pk})
          MERGE (c:Community {community_id: row.cid})
          MERGE (p)-[r:IN_COMMUNITY]->(c)
          SET r.source = 'atlas_packets', r.updated_at = datetime()
        `,
        parameters: { rows: comBatch.map(p => ({ pk: p.packet_key, cid: p.community_id })) },
      });
      edgesCommunity += comBatch.length;
    }

    if (statements.length === 0) continue;

    try {
      await neo4jBatch(statements);
    } catch (err) {
      batchErrors++;
      if (VERBOSE) console.error(`  Batch ${i}–${i+BATCH_SIZE} error: ${err.message}`);
    }

    if (VERBOSE || (i > 0 && i % 1000 === 0)) {
      console.log(`  ${Math.min(i + BATCH_SIZE, packets.length)} / ${packets.length} processed…`);
    }
  }

  // ── Verify edge counts (separate request after all batches commit) ────────
  await new Promise(r => setTimeout(r, 500));
  const [srcCount, featCount, comCount] = await neo4jBatch([
    { statement: 'MATCH ()-[r:FROM_SOURCE]->() RETURN count(r) AS n' },
    { statement: 'MATCH ()-[r:IMPLEMENTS_FEATURE]->() RETURN count(r) AS n' },
    { statement: 'MATCH ()-[r:IN_COMMUNITY]->() RETURN count(r) AS n' },
  ]);

  const nSrc  = srcCount[0]?.data[0]?.row[0]  ?? 0;
  const nFeat = featCount[0]?.data[0]?.row[0] ?? 0;
  const nCom  = comCount[0]?.data[0]?.row[0]  ?? 0;

  console.log('\n══ Edge Counts ═══════════════════════════');
  console.log(`  FROM_SOURCE:         ${nSrc}`);
  console.log(`  IMPLEMENTS_FEATURE:  ${nFeat}`);
  console.log(`  IN_COMMUNITY:        ${nCom}`);
  console.log(`  Batch errors:        ${batchErrors}`);

  const gatePass = nSrc > 0 || nFeat > 0 || nCom > 0;
  const errRate  = batchErrors / Math.ceil(packets.length / BATCH_SIZE);
  const errGate  = errRate < 0.1;

  console.log(`\n  ${gatePass ? '✅' : '❌'} At least one edge type written`);
  console.log(`  ${errGate  ? '✅' : '⚠️ '} Error rate < 10% (${(errRate*100).toFixed(1)}%)`);
  console.log(`\n  ${(gatePass && errGate) ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  writeReport({
    generated_at: new Date().toISOString(), mode: 'apply',
    eligible_packets: packets.length,
    edges_written: { FROM_SOURCE: nSrc, IMPLEMENTS_FEATURE: nFeat, IN_COMMUNITY: nCom },
    batch_errors: batchErrors,
    gate: { edges_written: gatePass, error_rate_ok: errGate, pass: gatePass && errGate },
  });

  await pool.end();
}

function writeReport(report) {
  const dir = path.join(ROOT, 'docs', 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'graphify-packet-contract.json'), JSON.stringify(report, null, 2));
  console.log('\nReport: docs/reports/graphify-packet-contract.json');
}

main().catch(err => { console.error(err); process.exit(1); });
