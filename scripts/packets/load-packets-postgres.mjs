#!/usr/bin/env node
/**
 * packets:postgres:load
 *
 * Bulk-loads memory/packets/nes-chrom-packets.jsonl into route_runtime_packets
 * (and side-cars into route_packet_facts / route_packet_edges / route_state_snapshots).
 *
 * This is the inverse of packets:export — it hydrates the DB from the JSONL
 * interchange files (e.g. after a restore or cross-machine transfer).
 *
 * Idempotent: uses ON CONFLICT (packet_uuid) DO NOTHING.
 *
 * Usage:
 *   node scripts/packets/load-packets-postgres.mjs [--dry-run] [--limit=<n>]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
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

const OUT_DIR = path.join(ROOT, 'memory', 'packets');
const FILES = {
  packets:   path.join(OUT_DIR, 'nes-chrom-packets.jsonl'),
  facts:     path.join(OUT_DIR, 'atlas-packet-facts.jsonl'),
  edges:     path.join(OUT_DIR, 'atlas-graph-edges.jsonl'),
  snapshots: path.join(OUT_DIR, 'atlas-state-snapshots.jsonl'),
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip malformed lines */ }
    if (rows.length >= LIMIT) break;
  }
  return rows;
}

async function run() {
  console.log(`\n=== packets:postgres:load${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);

  const packets = await readJsonl(FILES.packets);
  console.log(`  packets.jsonl: ${packets.length} rows`);

  if (!DRY_RUN) {
    let inserted = 0, skipped = 0;
    for (const p of packets) {
      if (!p.packet_id) continue;
      const res = await pool.query(`
        INSERT INTO route_runtime_packets
          (packet_uuid, query_hash, prompt_hash, raw, reward, route)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        ON CONFLICT (packet_uuid) DO NOTHING
        RETURNING id
      `, [
        p.packet_id,
        p.query_hash ?? null,
        p.prompt_hash ?? null,
        JSON.stringify(p),
        p.reward ?? null,
        p.route ?? 'unknown',
      ]);
      if (res.rowCount > 0) inserted++; else skipped++;
    }
    console.log(`  packets: ${inserted} inserted, ${skipped} skipped`);
  }

  // Facts
  const facts = await readJsonl(FILES.facts);
  console.log(`  facts.jsonl: ${facts.length} rows`);
  if (!DRY_RUN) {
    let fi = 0;
    for (const f of facts) {
      if (!f.packet_uuid) continue;
      await pool.query(`
        INSERT INTO route_packet_facts
          (packet_uuid, fact_type, fact_key, fact_value, score, metadata)
        VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT DO NOTHING
      `, [f.packet_uuid, f.fact_type ?? '', f.fact_key ?? '', f.fact_value ?? null,
          f.score ?? null, JSON.stringify(f.metadata ?? {})]);
      fi++;
    }
    console.log(`  facts: ${fi} upserted`);
  }

  // Edges
  const edges = await readJsonl(FILES.edges);
  console.log(`  edges.jsonl: ${edges.length} rows`);
  if (!DRY_RUN) {
    let ei = 0;
    for (const e of edges) {
      if (!e.packet_uuid) continue;
      await pool.query(`
        INSERT INTO route_packet_edges
          (packet_uuid, src, dst, edge_type, weight, metadata)
        VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT DO NOTHING
      `, [e.packet_uuid, e.src ?? '', e.dst ?? '', e.edge_type ?? '',
          e.weight ?? 1, JSON.stringify(e.metadata ?? {})]);
      ei++;
    }
    console.log(`  edges: ${ei} upserted`);
  }

  // State snapshots
  const snaps = await readJsonl(FILES.snapshots);
  console.log(`  snapshots.jsonl: ${snaps.length} rows`);
  if (!DRY_RUN) {
    let si = 0;
    for (const s of snaps) {
      if (!s.packet_uuid) continue;
      await pool.query(`
        INSERT INTO route_state_snapshots
          (packet_uuid, state_key, compressed_state, token_map)
        VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb)
        ON CONFLICT DO NOTHING
      `, [s.packet_uuid, s.state_key ?? 'default',
          JSON.stringify(s.compressed_state ?? {}), JSON.stringify(s.token_map ?? {})]);
      si++;
    }
    console.log(`  snapshots: ${si} upserted`);
  }

  console.log('Done.\n');
}

run().catch(e => { console.error(e); process.exit(1); }).finally(() => pool.end());