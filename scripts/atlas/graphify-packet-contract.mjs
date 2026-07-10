#!/usr/bin/env node
/**
 * graphify-packet-contract.mjs
 *
 * Packet Contract Lane — Neo4j graph edges (step 5 of 7).
 *
 * Creates packet topology edges after metadata gate passes:
 *   (Packet {packet_key}) -[:FROM_SOURCE]->      (:SourceRef  {source_ref})
 *   (Packet {packet_key}) -[:IMPLEMENTS_FEATURE]-> (:Feature   {feature_id})
 *   (Packet {packet_key}) -[:HAS_TITLE]->        (:Title      {title_id})
 *   (Packet {packet_key}) -[:HAS_TREE_NODE]->    (:TreeNode   {tree_node_id})
 *   (Packet {packet_key}) -[:IN_COMMUNITY]->     (:Community  {community_id})
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
import { normalizeSourceRef } from './lib/canonical-source-ref.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;
const TREE_ONLY = process.argv.includes('--tree-only');
const LIMIT_ARG      = process.argv.find(a => a.startsWith('--limit='));
const BATCH_SIZE_ARG = process.argv.find(a => a.startsWith('--batch-size='));
const MAX_ROWS  = LIMIT_ARG      ? parseInt(LIMIT_ARG.split('=')[1], 10)      : Infinity;

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const NEO4J_URL = env.NEO4J_HTTP_URL || env.NEO4J_URL || 'http://127.0.0.1:7474';
const NEO4J_USER = env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j';

const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split('=')[1], 10) : 250;

// ── Neo4j HTTP helper ─────────────────────────────────────────────────────────

async function neo4jBatch(statements, timeoutMs = 120_000, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
        },
        body: JSON.stringify({ statements }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
      const data = await res.json();
      if (data.errors?.length) throw new Error(data.errors[0].message);
      return data.results;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        if (VERBOSE) console.warn(`  ⚠ Neo4j retry ${attempt + 1}/${retries}: ${err.message}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

async function neo4jBatchChunked(statement, paramKey, values, chunkSize = BATCH_SIZE, timeoutMs = 120_000) {
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await neo4jBatch([{ statement, parameters: { [paramKey]: chunk } }], timeoutMs);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Graphify Packet Contract ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);
  if (TREE_ONLY) console.log('Mode: tree lineage only\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  // Load packets with at least one linkable field
  const { rows: rawPackets } = await pool.query(`
    SELECT packet_key, source_ref, source_ref_key, feature_id, title_id, tree_node_id,
           community_id, domain_class, concept_ids, payload->>'path' AS meta_path
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND (source_ref IS NOT NULL OR feature_id IS NOT NULL OR title_id IS NOT NULL OR tree_node_id IS NOT NULL OR community_id IS NOT NULL)
    ORDER BY packet_key
    ${MAX_ROWS < Infinity ? `LIMIT ${MAX_ROWS}` : ''}
  `);

  // Validate packets against canonical envelope contract
  const packets = [];
  let validationFailures = 0;
  for (const packet of rawPackets) {
    const { envelope, validation } = buildCanonicalFeatureEnvelope(packet);
    if (!validation.isValid) {
      if (VERBOSE) reportValidation(validation, packet.packet_key);
      validationFailures++;
      continue;
    }
    packets.push({ ...packet, ...envelope });
  }

  console.log(`Packets eligible for graphify: ${packets.length} (${validationFailures} validation failures skipped)`);

  const hasSrc  = packets.filter(p => p.source_ref).length;
  const hasFeat = packets.filter(p => p.feature_id).length;
  const hasTitle = packets.filter(p => p.title_id).length;
  const hasTree = packets.filter(p => p.tree_node_id).length;
  const hasCom  = packets.filter(p => p.community_id != null).length;
  console.log(`  WITH source_ref:    ${hasSrc}`);
  console.log(`  WITH feature_id:    ${hasFeat}`);
  console.log(`  WITH title_id:      ${hasTitle}`);
  console.log(`  WITH tree_node_id:   ${hasTree}`);
  console.log(`  WITH community_id:  ${hasCom}`);

  if (DRY_RUN) {
    console.log('\nSample edges (first 5):');
    for (const p of packets.slice(0, 5)) {
      if (p.source_ref)    console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:FROM_SOURCE]->(SourceRef:${normalizeSourceRef(p.source_ref).slice(0,30)})`);
      if (p.feature_id)    console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:IMPLEMENTS_FEATURE]->(Feature:${p.feature_id.slice(0,30)})`);
      if (p.title_id)      console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:HAS_TITLE]->(Title:${String(p.title_id).slice(0,30)})`);
      if (p.tree_node_id)  console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:HAS_TREE_NODE]->(TreeNode:${String(p.tree_node_id).slice(0,30)})`);
      if (p.community_id != null) console.log(`  (Packet:${p.packet_key.slice(0,30)})-[:IN_COMMUNITY]->(Community:${p.community_id})`);
    }
    console.log('\n(dry-run — run with --apply to write Neo4j edges)');

    writeReport({
      generated_at: new Date().toISOString(), mode: 'dry-run',
      tree_only: TREE_ONLY,
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
  const srcRefs = [...new Set(packets.filter(p => p.source_ref).map(p => normalizeSourceRef(p.source_ref)).filter(Boolean))];
  const titleIds = [...new Set(packets.filter(p => p.title_id).map(p => String(p.title_id).trim()).filter(Boolean))];
  const treeNodeIds = [...new Set(packets.filter(p => p.tree_node_id).map(p => String(p.tree_node_id).trim()).filter(Boolean))];
  const comIds  = [...new Set(packets.filter(p => p.community_id != null).map(p => p.community_id))];

  if (!TREE_ONLY && srcRefs.length > 0) {
    await neo4jBatchChunked(
      `UNWIND $refs AS ref MERGE (s:SourceRef {source_ref: ref}) SET s.updated_at = datetime()`,
      'refs', srcRefs, 100, 180_000,
    );
    console.log(`Pre-created/merged ${srcRefs.length} SourceRef nodes`);
  }

  if (!TREE_ONLY && titleIds.length > 0) {
    await neo4jBatchChunked(
      `UNWIND $ids AS tid MERGE (t:Title {title_id: tid}) SET t.updated_at = datetime()`,
      'ids', titleIds, 150, 120_000,
    );
    console.log(`Pre-created/merged ${titleIds.length} Title nodes`);
  }

  if (treeNodeIds.length > 0) {
    await neo4jBatchChunked(
      `UNWIND $ids AS nid MERGE (t:TreeNode {tree_node_id: nid}) SET t.updated_at = datetime()`,
      'ids', treeNodeIds, 150, 120_000,
    );
    console.log(`Pre-created/merged ${treeNodeIds.length} TreeNode nodes`);
  }

  if (!TREE_ONLY && comIds.length > 0) {
    await neo4jBatchChunked(
      `UNWIND $ids AS cid MERGE (c:Community {community_id: cid}) SET c.updated_at = datetime()`,
      'ids', comIds, 200, 120_000,
    );
    console.log(`Pre-created/merged ${comIds.length} Community nodes`);
  }

  // ── Write edges in batches ────────────────────────────────────────────────
  let edgesSource = 0, edgesFeature = 0, edgesTitle = 0, edgesTree = 0, edgesCommunity = 0, batchErrors = 0;

  // Edge writes are more expensive than pre-creates (5 UNWINDs per batch).
  // Use a smaller batch size to avoid Neo4j transaction timeout.
  const EDGE_BATCH_SIZE = Math.max(50, Math.floor(BATCH_SIZE / 2));

  for (let i = 0; i < packets.length; i += EDGE_BATCH_SIZE) {
    const batch = packets.slice(i, i + EDGE_BATCH_SIZE);

    const statements = [];

    // FROM_SOURCE edges — MERGE Packet so new packets are created if absent
    const srcBatch = batch.filter(p => p.source_ref);
    if (!TREE_ONLY && srcBatch.length > 0) {
      statements.push({
        statement: `
          UNWIND $rows AS row
          MERGE (p:Packet {packet_key: row.pk})
            ON CREATE SET p.source_ref = row.sr, p.created_at = datetime()
          MERGE (s:SourceRef {source_ref: row.sr})
          MERGE (p)-[r:FROM_SOURCE]->(s)
          SET r.source = 'atlas_packets', r.updated_at = datetime()
        `,
        parameters: { rows: srcBatch.map(p => ({ pk: p.packet_key, sr: normalizeSourceRef(p.source_ref) || p.source_ref })) },
      });
      edgesSource += srcBatch.length;
    }

    // IMPLEMENTS_FEATURE edges — Feature nodes use {name: sha_hex}
    const featBatch = batch.filter(p => p.feature_id);
    if (!TREE_ONLY && featBatch.length > 0) {
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

    const titleBatch = batch.filter(p => p.title_id);
    if (!TREE_ONLY && titleBatch.length > 0) {
      statements.push({
        statement: `
          UNWIND $rows AS row
          MERGE (p:Packet {packet_key: row.pk})
          MERGE (t:Title {title_id: row.tid})
          MERGE (p)-[r:HAS_TITLE]->(t)
          SET r.source = 'atlas_packets', r.updated_at = datetime()
        `,
        parameters: { rows: titleBatch.map(p => ({ pk: p.packet_key, tid: String(p.title_id).trim() })) },
      });
      edgesTitle += titleBatch.length;
    }

    const treeBatch = batch.filter(p => p.tree_node_id);
    if (treeBatch.length > 0) {
      statements.push({
        statement: `
          UNWIND $rows AS row
          MERGE (p:Packet {packet_key: row.pk})
          MERGE (t:TreeNode {tree_node_id: row.tid})
          MERGE (p)-[r:HAS_TREE_NODE]->(t)
          SET r.source = 'atlas_packets', r.updated_at = datetime()
        `,
        parameters: { rows: treeBatch.map(p => ({ pk: p.packet_key, tid: String(p.tree_node_id).trim() })) },
      });
      edgesTree += treeBatch.length;
    }

    // IN_COMMUNITY edges
    const comBatch = batch.filter(p => p.community_id != null);
    if (!TREE_ONLY && comBatch.length > 0) {
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

    // Split large statement groups — Neo4j HTTP tx timeout with 5+ UNWINDs is tight.
    // Send in groups of 2 statements per transaction (pair: edges + relationships).
    for (let s = 0; s < statements.length; s += 2) {
      const stmtGroup = statements.slice(s, s + 2);
      try {
        await neo4jBatch(stmtGroup);
      } catch (err) {
        batchErrors++;
        if (VERBOSE) console.error(`  Batch ${i}–${i+EDGE_BATCH_SIZE} stmt ${s}/${statements.length} error: ${err.message}`);
      }
    }

    if (VERBOSE || (i > 0 && i % 1000 === 0)) {
      console.log(`  ${Math.min(i + EDGE_BATCH_SIZE, packets.length)} / ${packets.length} processed…`);
    }
  }

  // ── Verify edge counts (separate request after all batches commit) ────────
  await new Promise(r => setTimeout(r, 500));
  const results = await neo4jBatch([
    { statement: 'MATCH ()-[r:FROM_SOURCE]->() RETURN count(r) AS n' },
    { statement: 'MATCH ()-[r:IMPLEMENTS_FEATURE]->() RETURN count(r) AS n' },
    { statement: 'MATCH ()-[r:HAS_TITLE]->() RETURN count(r) AS n' },
    { statement: 'MATCH ()-[r:HAS_TREE_NODE]->() RETURN count(r) AS n' },
    { statement: 'MATCH ()-[r:IN_COMMUNITY]->() RETURN count(r) AS n' },
  ]);

  const nSrc  = results[0]?.data[0]?.row[0]  ?? 0;
  const nFeat = results[1]?.data[0]?.row[0] ?? 0;
  const nTitle = results[2]?.data[0]?.row[0] ?? 0;
  const nTree = results[3]?.data[0]?.row[0] ?? 0;
  const nCom  = results[4]?.data[0]?.row[0]  ?? 0;

  console.log('\n══ Edge Counts ═══════════════════════════');
  console.log(`  FROM_SOURCE:         ${nSrc}`);
  console.log(`  IMPLEMENTS_FEATURE:  ${nFeat}`);
  console.log(`  HAS_TITLE:           ${nTitle}`);
  console.log(`  HAS_TREE_NODE:       ${nTree}`);
  console.log(`  IN_COMMUNITY:        ${nCom}`);
  console.log(`  Batch errors:        ${batchErrors}`);

  const gatePass = TREE_ONLY ? nTree > 0 : (nSrc > 0 || nFeat > 0 || nCom > 0);
  const errRate  = batchErrors / Math.ceil(packets.length / BATCH_SIZE);
  const errGate  = errRate < 0.1;

  console.log(`\n  ${gatePass ? '✅' : '❌'} At least one edge type written`);
  console.log(`  ${errGate  ? '✅' : '⚠️ '} Error rate < 10% (${(errRate*100).toFixed(1)}%)`);
  console.log(`\n  ${(gatePass && errGate) ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  writeReport({
    generated_at: new Date().toISOString(), mode: 'apply',
    tree_only: TREE_ONLY,
    eligible_packets: packets.length,
    edges_written: { FROM_SOURCE: nSrc, IMPLEMENTS_FEATURE: nFeat, HAS_TITLE: nTitle, HAS_TREE_NODE: nTree, IN_COMMUNITY: nCom },
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
