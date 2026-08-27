#!/usr/bin/env node
/**
 * @file scripts/atlas/hydrate-neo4j-canonical-identity-v1.mjs
 *
 * GRAPH-IDENTITY-HYDRATE-01: Mirror canonical packet identities into Neo4j Packet nodes.
 *
 * Join key: Neo4j Packet.path  ↔  atlas_packets.source_ref
 *
 * Dry run (default): reports joinable count, sample rows, no writes.
 * Apply (--apply):   writes packet_id, packet_key, content_hash, source_revision
 *                    onto matched Neo4j Packet nodes only.
 *
 * Rules:
 *   - NEVER modifies canonical_id or packet_id if already set (idempotent)
 *   - NEVER adds identity to codebase_chunk_index
 *   - conflictingIdentifiers admitted = 0
 *   - ambiguousIdentifiers admitted   = 0
 *   - writes = false in dry-run
 *
 * Outputs:
 *   docs/reports/neo4j-identity-hydrate-v1.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'neo4j-identity-hydrate-v1.json');

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'neo4j123';

const APPLY = process.argv.includes('--apply');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function main() {
  console.log('── GRAPH-IDENTITY-HYDRATE-01 ────────────────────────────');
  console.log(`Mode: ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}`);

  // ── 1. Load canonical source_ref → identity map from atlas_packets ──────────
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2, statement_timeout: 60_000 });
  let packetIndex; // source_ref → { packet_id, packet_key, content_hash }
  try {
    const res = await pool.query(`
      SELECT source_ref, packet_id, packet_key, content_hash
      FROM atlas_packets
      WHERE source_ref IS NOT NULL
        AND content_hash IS NOT NULL
        AND source_ref NOT LIKE 'ace:packet:%'
        AND source_ref NOT LIKE 'global:%'
        AND source_ref NOT LIKE 'proto:%'
      ORDER BY source_ref
    `);
    packetIndex = new Map();
    for (const row of res.rows) {
      const key = row.source_ref.trim();
      if (!packetIndex.has(key)) {
        packetIndex.set(key, {
          packet_id: row.packet_id,
          packet_key: row.packet_key,
          content_hash: row.content_hash,
        });
      }
    }
    console.log(`Postgres: ${packetIndex.size} distinct source_ref rows with revisions loaded.`);
  } finally {
    await pool.end();
  }

  // ── 2. Join Neo4j Packet nodes via path ↔ source_ref ────────────────────────
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const report = {
    schema: 'atlas.neo4j-identity-hydrate-receipt.v1',
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    writes: false,
    postgresPackets: packetIndex.size,
    neo4jNodesScanned: 0,
    matched: 0,
    alreadyHydrated: 0,
    unmatched: 0,
    conflictingIdentifiers: 0,
    ambiguousIdentifiers: 0,
    appliedWrites: 0,
    sampleMatched: [],
    sampleUnmatched: [],
    hydrateChecksum: null,
  };

  const session = driver.session();
  try {
    // Scroll all Packet nodes with a path property
    const BATCH = 5000;
    let skip = 0;
    const matchedNodes = [];

    while (true) {
      const res = await session.run(
        'MATCH (n:Packet) WHERE n.path IS NOT NULL RETURN elementId(n) AS eid, n.path AS p, n.canonical_id AS cid SKIP $skip LIMIT $limit',
        { skip: neo4j.int(skip), limit: neo4j.int(BATCH) }
      );
      if (res.records.length === 0) break;
      skip += res.records.length;
      report.neo4jNodesScanned += res.records.length;

      for (const rec of res.records) {
        const eid = rec.get('eid');
        const p = rec.get('p');
        const existingCanonical = rec.get('cid');

        const entry = packetIndex.get(p);
        if (!entry) {
          report.unmatched++;
          if (report.sampleUnmatched.length < 5) report.sampleUnmatched.push(p);
          continue;
        }

        if (existingCanonical && existingCanonical !== entry.packet_id) {
          report.conflictingIdentifiers++;
          continue;
        }

        if (existingCanonical === entry.packet_id) {
          report.alreadyHydrated++;
          continue;
        }

        report.matched++;
        matchedNodes.push({ eid, ...entry, path: p });
        if (report.sampleMatched.length < 5) {
          report.sampleMatched.push({ path: p, packet_id: entry.packet_id, packet_key: entry.packet_key });
        }
      }
    }

    report.hydrateChecksum = sha256(JSON.stringify(matchedNodes.map(n => ({ eid: n.eid, packet_id: n.packet_id }))));

    // ── 3. Apply writes if --apply ─────────────────────────────────────────────
    if (APPLY && matchedNodes.length > 0 && report.conflictingIdentifiers === 0) {
      report.writes = true;
      const WRITE_BATCH = 500;
      for (let i = 0; i < matchedNodes.length; i += WRITE_BATCH) {
        const chunk = matchedNodes.slice(i, i + WRITE_BATCH);
        await session.run(
          `UNWIND $nodes AS node
           MATCH (n:Packet) WHERE elementId(n) = node.eid
           SET n.canonical_id = node.packet_id,
               n.packet_key   = node.packet_key,
               n.source_revision = node.content_hash`,
          { nodes: chunk.map(n => ({ eid: n.eid, packet_id: n.packet_id, packet_key: n.packet_key, content_hash: n.content_hash })) }
        );
        report.appliedWrites += chunk.length;
        process.stdout.write(`\r  Applied: ${report.appliedWrites}/${matchedNodes.length}`);
      }
      process.stdout.write('\n');
    } else if (APPLY && report.conflictingIdentifiers > 0) {
      console.warn(`WRITE BLOCKED: ${report.conflictingIdentifiers} conflicting identifiers detected. No writes performed.`);
    }
  } finally {
    await session.close();
    await driver.close();
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('══════════════════════════════════════════════════════════');
  console.log(`Neo4j Packet nodes scanned:  ${report.neo4jNodesScanned}`);
  console.log(`Matched (joinable):          ${report.matched}`);
  console.log(`Already hydrated:            ${report.alreadyHydrated}`);
  console.log(`Unmatched:                   ${report.unmatched}`);
  console.log(`Conflicting identifiers:     ${report.conflictingIdentifiers}`);
  console.log(`Writes applied:              ${report.appliedWrites}`);
  console.log(`Hydrate checksum:            ${report.hydrateChecksum}`);
  console.log(`Report:                      ${REPORT_PATH}`);
  console.log('══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[hydrate-neo4j-canonical-identity] Fatal:', err);
  process.exit(1);
});
