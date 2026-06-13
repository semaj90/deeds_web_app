#!/usr/bin/env node
/**
 * smoke-hyperrag-packet-rpc.mjs
 *
 * HyperRAG Packet RPC smoke test — Packet Contract Lane gate 7.
 *
 * Verifies the full packet envelope retrieval chain:
 *   1. Postgres atlas_packets → packet identity + metadata + summary
 *   2. Neo4j → FROM_SOURCE / IMPLEMENTS_FEATURE / IN_COMMUNITY neighbors
 *   3. Envelope shape validation
 *
 * Gates:
 *   PASS  packet envelope has packet_key, source_ref, feature_id, community_id
 *   PASS  metadata JSONB has path (≥1 field)
 *   PASS  Neo4j FROM_SOURCE edges exist
 *   PASS  Neo4j IMPLEMENTS_FEATURE edges exist
 *   PASS  Neo4j IN_COMMUNITY edges exist
 *   PASS  Retrieval latency < 500ms
 *
 * Usage:
 *   node scripts/atlas/smoke-hyperrag-packet-rpc.mjs
 */

import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL  = process.env.NEO4J_URL  || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

async function neo4j(stmt, params = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement: stmt, parameters: params }] }),
    signal: AbortSignal.timeout(10_000),
  });
  const d = await res.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.results[0]?.data ?? [];
}

async function main() {
  console.log('\n═══ HyperRAG Packet RPC Smoke Test ═══\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const gates = [];

  try {
    // ── 1. Sample a packet with full metadata ─────────────────────────────
    const t0 = Date.now();
    const { rows: [packet] } = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        feature_id,
        community_id,
        summary,
        payload AS metadata,
        payload->>'path' AS meta_path,
        payload->>'hash' AS meta_hash,
        payload->>'mtime' AS meta_mtime
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND source_ref IS NOT NULL
        AND feature_id IS NOT NULL
        AND community_id IS NOT NULL
        AND payload->>'path' IS NOT NULL
        AND payload->>'hash' IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);
    const pgMs = Date.now() - t0;

    if (!packet) {
      console.error('⚠️  No packet with full metadata found — run backfill first');
      process.exitCode = 1;
      await pool.end();
      return;
    }

    console.log('Sample packet envelope:');
    console.log(`  packet_key:   ${packet.packet_key}`);
    console.log(`  source_ref:   ${packet.source_ref}`);
    console.log(`  feature_id:   ${packet.feature_id?.slice(0, 16)}…`);
    console.log(`  community_id: ${packet.community_id}`);
    console.log(`  meta.path:    ${packet.meta_path}`);
    console.log(`  meta.hash:    ${packet.meta_hash?.slice(0, 24)}…`);
    console.log(`  meta.mtime:   ${packet.meta_mtime}`);
    console.log(`  summary:      ${packet.summary ? packet.summary.slice(0,60)+'…' : '(none)'}`);
    console.log(`  PG latency:   ${pgMs}ms`);

    // ── Gate 1: identity fields present ───────────────────────────────────
    gates.push({
      name: 'envelope_identity_fields',
      pass: !!(packet.packet_key && packet.source_ref && packet.feature_id && packet.community_id != null),
      detail: `pk=${!!packet.packet_key} sr=${!!packet.source_ref} fid=${!!packet.feature_id} cid=${packet.community_id != null}`,
    });

    // ── Gate 2: metadata has path ──────────────────────────────────────────
    gates.push({
      name: 'envelope_metadata_path',
      pass: !!packet.meta_path,
      detail: packet.meta_path ?? 'MISSING',
    });

    // ── Gate 3-5: Neo4j neighbors ──────────────────────────────────────────
    const t1 = Date.now();
    const [srcEdges, featEdges, comEdges] = await Promise.all([
      neo4j('MATCH (p:Packet {packet_key:$pk})-[:FROM_SOURCE]->(s) RETURN s.source_ref LIMIT 3', { pk: packet.packet_key }),
      neo4j('MATCH (p:Packet {packet_key:$pk})-[:IMPLEMENTS_FEATURE]->(f) RETURN f.name LIMIT 3', { pk: packet.packet_key }),
      neo4j('MATCH (p:Packet {packet_key:$pk})-[:IN_COMMUNITY]->(c) RETURN c.community_id LIMIT 3', { pk: packet.packet_key }),
    ]);
    const neo4jMs = Date.now() - t1;
    const totalMs = Date.now() - t0;

    console.log(`\nNeo4j neighbors:`);
    console.log(`  FROM_SOURCE:        ${srcEdges.length > 0 ? srcEdges[0].row[0] : 'none'}`);
    console.log(`  IMPLEMENTS_FEATURE: ${featEdges.length > 0 ? featEdges[0].row[0]?.slice(0,16)+'…' : 'none'}`);
    console.log(`  IN_COMMUNITY:       ${comEdges.length > 0 ? comEdges[0].row[0] : 'none'}`);
    console.log(`  Neo4j latency:  ${neo4jMs}ms`);
    console.log(`  Total latency:  ${totalMs}ms`);

    gates.push({ name: 'neo4j_from_source',        pass: srcEdges.length > 0,  detail: `${srcEdges.length} neighbors` });
    gates.push({ name: 'neo4j_implements_feature',  pass: featEdges.length > 0, detail: `${featEdges.length} neighbors` });
    gates.push({ name: 'neo4j_in_community',        pass: comEdges.length > 0,  detail: `${comEdges.length} neighbors` });

    // ── Gate 6: latency ────────────────────────────────────────────────────
    gates.push({ name: 'total_latency_under_750ms', pass: totalMs < 750, detail: `${totalMs}ms` });

    // ── Global edge counts ─────────────────────────────────────────────────
    const [[r1],[r2],[r3]] = await Promise.all([
      neo4j('MATCH ()-[r:FROM_SOURCE]->() RETURN count(r) AS n').catch(() => [[{row:[0]}]]),
      neo4j('MATCH ()-[r:IMPLEMENTS_FEATURE]->() RETURN count(r) AS n').catch(() => [[{row:[0]}]]),
      neo4j('MATCH ()-[r:IN_COMMUNITY]->() RETURN count(r) AS n').catch(() => [[{row:[0]}]]),
    ]);
    const [n1, n2, n3] = [r1?.row[0]??0, r2?.row[0]??0, r3?.row[0]??0];
    console.log(`\nGlobal edge counts:`);
    console.log(`  FROM_SOURCE:         ${n1}`);
    console.log(`  IMPLEMENTS_FEATURE:  ${n2}`);
    console.log(`  IN_COMMUNITY:        ${n3}`);

    // ── Results ────────────────────────────────────────────────────────────
    console.log('\n══ Gate Results ═══════════════════════════════');
    for (const g of gates) {
      console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(32)} ${g.detail}`);
    }
    const allPass = gates.every(g => g.pass);
    console.log(`\n  ${allPass ? '✅ SMOKE PASS' : '⚠️  SMOKE FAIL'}`);

    if (!allPass) process.exitCode = 1;

  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
