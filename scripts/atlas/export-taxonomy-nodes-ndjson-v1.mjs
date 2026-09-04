#!/usr/bin/env node
/**
 * Exports taxonomy_nodes as NDJSON in the record shape scripts/atlas/embed-chunks.mjs
 * already expects ({chunk_id, text, source_ref, tags, ...}) — reused as-is, no new
 * embed/upsert script written. Read-only.
 *
 * Usage:
 *   node scripts/atlas/export-taxonomy-nodes-ndjson-v1.mjs > tmp/taxonomy-nodes.ndjson
 *   node scripts/atlas/embed-chunks.mjs --input tmp/taxonomy-nodes.ndjson \
 *     --collection taxonomy_nodes_768 --dry-run
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: path.resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true, quiet: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

/** Mirrors sourceRefFromTaxonomyLeafNodeKeyV1 in
 * sveltekit-frontend/src/lib/server/atlas/taxonomy-retrieval-filter-v1.ts — kept
 * duplicated (not imported) because this script runs outside the SvelteKit
 * $lib alias context (see CLAUDE.md's "NPX Execution Context" section). */
function sourceRefFromLeafNodeKey(nodeKey) {
  const stripped = nodeKey.replace(/^(?:file:)+/, '');
  if (!stripped || stripped === nodeKey) return null;
  return stripped.replace(/:[^:]*$/, '').trim() || null;
}

function symbolFromLeafNodeKey(nodeKey) {
  const stripped = nodeKey.replace(/^(?:file:)+/, '');
  const match = stripped.match(/:([^:]+)$/);
  return match ? match[1] : null;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT node_key, level, parent_key, display_name FROM taxonomy_nodes ORDER BY node_key`
  );

  for (const row of rows) {
    let text;
    let sourceRef = null;
    if (row.level === 4) {
      sourceRef = sourceRefFromLeafNodeKey(row.node_key);
      const symbol = symbolFromLeafNodeKey(row.node_key);
      // Level-4 display_name is a local absolute filesystem path (verified live
      // 2026-09-02) — not portable, not embedded. sourceRef + symbol only.
      text = [sourceRef, symbol].filter(Boolean).join(' :: ') || row.node_key;
    } else {
      text = row.display_name;
    }

    const record = {
      chunk_id: crypto.createHash('sha256').update(row.node_key).digest('hex').slice(0, 32),
      text,
      source_ref: sourceRef,
      tags: [`taxonomy:level:${row.level}`],
      node_key: row.node_key,
      level: row.level,
      parent_key: row.parent_key,
      display_name: row.level === 4 ? null : row.display_name,
    };
    process.stdout.write(JSON.stringify(record) + '\n');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
