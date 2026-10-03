#!/usr/bin/env node
/**
 * Read-only census of every competing symbol/representation table candidate
 * found during the parent-atlas-ace-rlm-bitfrost-integration promotion-board
 * investigation (2026-09-12): does each table exist live, and if so, how
 * many rows does it have? No writes anywhere in this file.
 */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 10000 });
const tables = [
  'atlas_symbol_registry',
  'atlas_symbol_versions',
  'atlas_symbol_aliases',
  'graphify_symbols',
  'graphify_files',
  'graphify_edges',
  'atlas_representations',
  'atlas_representation_records',
  'atlas_representation_providers',
];

const results = [];
for (const t of tables) {
  try {
    const exists = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS exists`,
      [t],
    );
    let count = null;
    if (exists.rows[0].exists) {
      const c = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
      count = c.rows[0].n;
    }
    results.push({ table: t, exists: exists.rows[0].exists, count });
  } catch (error) {
    results.push({ table: t, error: error.message });
  }
}
await pool.end();
console.log(JSON.stringify(results, null, 2));
