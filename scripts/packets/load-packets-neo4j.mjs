#!/usr/bin/env node
/**
 * packets:neo4j:edges
 *
 * Reads memory/packets/atlas-graph-edges.jsonl and merges edges into Neo4j as
 * typed relationships. Node identity is src/dst text IDs — MERGE on id property.
 *
 * Relationship types are created verbatim from edge_type field.
 * Properties carried: weight, metadata fields, packet_uuid, created_at.
 *
 * Usage:
 *   node scripts/packets/load-packets-neo4j.mjs [--dry-run] [--limit=<n>]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  }
}

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const LIMIT = Number(ARGS.find(a => a.startsWith('--limit='))?.slice(8) ?? '0') || Infinity;
const BATCH_SIZE = 500;

const NEO4J_URI  = process.env.NEO4J_URI  ?? 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const EDGES_FILE = path.join(ROOT, 'memory', 'packets', 'atlas-graph-edges.jsonl');

async function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip */ }
    if (rows.length >= LIMIT) break;
  }
  return rows;
}

async function run() {
  console.log(`\n=== packets:neo4j:edges${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);

  const edges = await readJsonl(EDGES_FILE);
  console.log(`  edges: ${edges.length}`);

  if (edges.length === 0) {
    console.log('  Nothing to load.');
    return;
  }

  if (DRY_RUN) {
    const types = [...new Set(edges.map(e => e.edge_type))];
    console.log(`  (dry-run) edge types: ${types.join(', ')}`);
    return;
  }

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const session = driver.session();

  try {
    // Ensure constraint exists so MERGE is O(1)
    await session.run(`
      CREATE CONSTRAINT IF NOT EXISTS FOR (n:PacketNode) REQUIRE n.id IS UNIQUE
    `);

    let total = 0;
    // Group by edge_type so we can use dynamic relationship labels
    const byType = new Map();
    for (const e of edges) {
      if (!e.src || !e.dst) continue; // skip edges with null src/dst
      const t = e.edge_type ?? 'UNKNOWN';
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(e);
    }

    for (const [edgeType, batch] of byType) {
      // Neo4j doesn't allow dynamic relationship types in a single query —
      // we run one parameterized query per type with batched UNWIND.
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const chunk = batch.slice(i, i + BATCH_SIZE).map(e => ({
          src:        String(e.src),
          dst:        String(e.dst),
          weight:     e.weight ?? 1,
          packet_uuid: e.packet_uuid ?? null,
          feature_id: e.feature_id ?? null,
          som_cluster: e.som_cluster ?? null,
          created_at:  e.created_at ?? new Date().toISOString(),
        }));

        // packet_uuid excluded from MERGE key — often null for AST-derived edges
        const cypher = `
          UNWIND $rows AS row
          MERGE (a:PacketNode {id: row.src})
          MERGE (b:PacketNode {id: row.dst})
          MERGE (a)-[r:PACKET_EDGE {edge_type: $edgeType, src: row.src, dst: row.dst}]->(b)
          SET r.weight     = row.weight,
              r.packet_uuid = row.packet_uuid,
              r.feature_id = row.feature_id,
              r.som_cluster = row.som_cluster,
              r.created_at = row.created_at
        `;
        await session.run(cypher, { rows: chunk, edgeType });
        total += chunk.length;
      }
      console.log(`  ${edgeType}: ${batch.length} edges`);
    }

    console.log(`  Total merged: ${total} edges across ${byType.size} types`);
  } finally {
    await session.close();
    await driver.close();
  }

  console.log('Done.\n');
}

run().catch(e => { console.error(e); process.exit(1); });