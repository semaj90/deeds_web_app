#!/usr/bin/env node
/**
 * packets:export
 *
 * Exports durable NES/CHROM packets from Postgres route_runtime_packets
 * into memory/packets/nes-chrom-packets.jsonl (the canonical interchange file).
 *
 * Also emits four side-car files from child tables:
 *   atlas-packet-facts.jsonl
 *   atlas-graph-edges.jsonl
 *   atlas-state-snapshots.jsonl
 *   atlas-token-map.jsonl (extracted from state_snapshots.token_map)
 *
 * Usage:
 *   node scripts/packets/export-nes-packets.mjs [--dry-run] [--since=<ISO>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── env loader ────────────────────────────────────────────────────────────────
for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  }
}

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has('--dry-run');
const SINCE = process.argv.find(a => a.startsWith('--since='))?.slice(8) ?? null;

const OUT_DIR = path.join(ROOT, 'memory', 'packets');
const FILES = {
  packets:   path.join(OUT_DIR, 'nes-chrom-packets.jsonl'),
  facts:     path.join(OUT_DIR, 'atlas-packet-facts.jsonl'),
  edges:     path.join(OUT_DIR, 'atlas-graph-edges.jsonl'),
  snapshots: path.join(OUT_DIR, 'atlas-state-snapshots.jsonl'),
  tokenMap:  path.join(OUT_DIR, 'atlas-token-map.jsonl'),
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function exportTable(query, params, outFile, label) {
  const res = await pool.query(query, params);
  console.log(`  ${label}: ${res.rows.length} rows`);
  if (DRY_RUN) return res.rows.length;
  const lines = res.rows.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(outFile, lines ? lines + '\n' : '', 'utf8');
  return res.rows.length;
}

async function run() {
  console.log(`\n=== packets:export${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);
  if (SINCE) console.log(`  since: ${SINCE}`);

  const sinceClause = SINCE ? `AND p.captured_at > $1` : '';
  const sinceParams = SINCE ? [SINCE] : [];

  // Packets — core interchange record
  const packetRows = await pool.query(`
    SELECT
      p.packet_uuid   AS packet_id,
      p.query_hash,
      p.prompt_hash,
      p.feature_id,
      p.som_cluster,
      p.route_state,
      p.reward,
      p.route,
      p.source_refs,
      p.feature_ids,
      p.lane_ids,
      p.qdrant_hits,
      p.redis_hot_keys,
      p.latency_ms,
      p.cache_hit,
      p.cache_tier,
      p.captured_at
    FROM route_runtime_packets p
    WHERE p.packet_uuid IS NOT NULL
    ${sinceClause}
    ORDER BY p.captured_at DESC
    LIMIT 50000
  `, sinceParams);

  console.log(`  packets: ${packetRows.rows.length} rows`);
  if (!DRY_RUN) {
    fs.writeFileSync(FILES.packets,
      packetRows.rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  }

  // Facts
  await exportTable(`
    SELECT f.*, p.feature_id, p.som_cluster
    FROM route_packet_facts f
    JOIN route_runtime_packets p ON p.packet_uuid = f.packet_uuid
    WHERE p.packet_uuid IS NOT NULL ${sinceClause.replace('p.captured_at', 'p.captured_at')}
    ORDER BY f.created_at DESC LIMIT 200000
  `, sinceParams, FILES.facts, 'facts');

  // Edges — from route_packet_edges; synthesize USES_SOURCE_REF fallback from source_refs
  const edgeRows = await pool.query(`
    SELECT e.*, p.feature_id, p.som_cluster
    FROM route_packet_edges e
    JOIN route_runtime_packets p ON p.packet_uuid = e.packet_uuid
    WHERE p.packet_uuid IS NOT NULL
    ORDER BY e.created_at DESC LIMIT 200000
  `);
  console.log(`  edges: ${edgeRows.rows.length} rows`);

  let edgeLines = edgeRows.rows.map(r => JSON.stringify(r));

  // When sidecar table is empty, synthesize USES_SOURCE_REF edges from source_refs
  if (edgeRows.rows.length === 0 && packetRows.rows.length > 0) {
    const synth = [];
    for (const p of packetRows.rows) {
      const refs = Array.isArray(p.source_refs) ? p.source_refs : [];
      for (const ref of refs) {
        synth.push({
          packet_uuid: p.packet_id,
          src: p.feature_id ?? p.query_hash ?? p.packet_id,
          dst: ref,
          edge_type: 'USES_SOURCE_REF',
          weight: 1.0,
          feature_id: p.feature_id,
          som_cluster: p.som_cluster ?? null,
          created_at: p.captured_at,
        });
      }
      // Also emit QUERY_TO_FEATURE edge if feature_id present
      if (p.feature_id) {
        synth.push({
          packet_uuid: p.packet_id,
          src: p.query_hash ?? p.packet_id,
          dst: p.feature_id,
          edge_type: 'QUERY_TO_FEATURE',
          weight: 1.0,
          feature_id: p.feature_id,
          som_cluster: p.som_cluster ?? null,
          created_at: p.captured_at,
        });
      }
    }
    edgeLines = synth.map(e => JSON.stringify(e));
    console.log(`  edges (synthesized from source_refs): ${synth.length}`);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(FILES.edges, edgeLines.join('\n') + '\n', 'utf8');
  }

  // State snapshots
  const snapRows = await pool.query(`
    SELECT s.*, p.feature_id, p.query_hash
    FROM route_state_snapshots s
    JOIN route_runtime_packets p ON p.packet_uuid = s.packet_uuid
    WHERE p.packet_uuid IS NOT NULL
    ORDER BY s.created_at DESC LIMIT 50000
  `);
  console.log(`  snapshots: ${snapRows.rows.length} rows`);
  if (!DRY_RUN) {
    fs.writeFileSync(FILES.snapshots,
      snapRows.rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // Token map side-car — flatten token_map.token_hints per snapshot
    const tokenLines = snapRows.rows.flatMap(r => {
      const hints = r.token_map?.token_hints ?? [];
      return hints.map((hint, i) => JSON.stringify({
        packet_id: r.packet_uuid,
        feature_id: r.feature_id,
        state_key: r.state_key,
        hint_index: i,
        hint,
      }));
    });
    fs.writeFileSync(FILES.tokenMap, tokenLines.join('\n') + '\n', 'utf8');
    console.log(`  token-map: ${tokenLines.length} hints`);
  }

  const sizes = DRY_RUN ? '(dry-run, no files written)' :
    Object.entries(FILES).map(([k, f]) => {
      try { return `${k}: ${(fs.statSync(f).size / 1024).toFixed(1)} KB`; } catch { return `${k}: 0 KB`; }
    }).join(', ');
  console.log(`\nOutput: ${sizes}`);
  console.log('Done.\n');
}

run().catch(e => { console.error(e); process.exit(1); }).finally(() => pool.end());
