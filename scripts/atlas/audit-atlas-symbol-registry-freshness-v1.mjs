#!/usr/bin/env node
/** Read-only: is atlas_symbol_registry/atlas_symbol_versions real, current data
 * or stale/test data? No writes. */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 15000 });

const registrySample = await pool.query(`SELECT stable_symbol_id, canonical_key, language, symbol_kind, canonical_qualified_name, created_from_source_ref, created_from_source_revision, registry_revision, status, created_at FROM atlas_symbol_registry ORDER BY created_at DESC LIMIT 5`);
const registryRevisions = await pool.query(`SELECT registry_revision, count(*)::int AS n, min(created_at) AS earliest, max(created_at) AS latest FROM atlas_symbol_registry GROUP BY registry_revision ORDER BY n DESC`);
const registryStatus = await pool.query(`SELECT status, count(*)::int AS n FROM atlas_symbol_registry GROUP BY status`);
const versionsSample = await pool.query(`SELECT * FROM atlas_symbol_versions LIMIT 3`);
const versionsCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'atlas_symbol_versions' ORDER BY ordinal_position`);

console.log(JSON.stringify({
  registrySample: registrySample.rows,
  registryRevisions: registryRevisions.rows,
  registryStatus: registryStatus.rows,
  versionsColumns: versionsCols.rows.map(r => r.column_name),
  versionsSample: versionsSample.rows,
}, null, 2));
await pool.end();
