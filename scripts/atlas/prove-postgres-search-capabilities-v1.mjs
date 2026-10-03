#!/usr/bin/env node
/**
 * Read-only PostgreSQL search-capability probe (pg_search / pgvector / pg_trgm / native FTS).
 * Fingerprints the exact server FIRST, then derives capability levels from that same connection.
 * A failing step records null + reason and the run continues; null never promotes a level.
 * No CREATE/DROP/ALTER, no index rebuild. One READ ONLY transaction, rolled back.
 * Receipt: docs/reports/postgres-search-capabilities-v1-<stamp>.json (exclusive-create).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60_000 });
const client = await pool.connect();

async function step(name, sql, params = []) {
  try {
    return (await client.query(sql, params)).rows;
  } catch (error) {
    failures.push({ step: name, reason: String(error?.message ?? error).split('\n')[0] });
    return null;
  }
}
async function probe(name, sql) {
  // Each API probe runs inside a savepoint so one failure does not abort the transaction.
  await client.query('SAVEPOINT p');
  const rows = await step(name, sql);
  await client.query(rows === null ? 'ROLLBACK TO SAVEPOINT p' : 'RELEASE SAVEPOINT p');
  return rows;
}

const receipt = { schema: 'atlas.postgres-search-capabilities.v1', generatedAt: new Date().toISOString(), writes: { postgres: 0 }, canonicalAuthority: false };
try {
  await client.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ');
  const fp = await step('fingerprint', `SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS addr, inet_server_port() AS port, version() AS version, current_setting('data_directory', true) AS data_directory, current_setting('shared_preload_libraries', true) AS shared_preload_libraries`);
  receipt.server = fp?.[0] ?? null;
  const names = ['pg_search', 'vector', 'pg_trgm'];
  const installed = await step('pg_extension', 'SELECT extname, extversion FROM pg_extension WHERE extname = ANY($1) ORDER BY 1', [names]);
  const available = await step('pg_available_extensions', 'SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = ANY($1) ORDER BY 1', [names]);
  const am = await step('pg_am', `SELECT amname FROM pg_am WHERE amname IN ('paradedb','bm25','hnsw') ORDER BY 1`);
  const indexes = await step('pg_indexes', `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'codebase_chunk_index' AND (indexdef ILIKE '%paradedb%' OR indexdef ILIKE '%bm25%' OR indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%gin%') ORDER BY indexname`);
  const funcs = await step('schema_functions', `SELECT n.nspname, count(*)::int AS functions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('pdb','paradedb') GROUP BY n.nspname ORDER BY 1`);
  // Binary presence needs superuser/file privileges (pg_config view + pg_ls_dir); null (not false) when unavailable.
  // Note: inet_server_port() reports the port INSIDE the server's network namespace (5432 in the container); the host mapping is 5434.
  const libdir = await probe('binary_presence', `SELECT f AS file FROM pg_ls_dir((SELECT setting FROM pg_config WHERE name = 'PKGLIBDIR')) f WHERE f LIKE 'pg_search%'`);

  const has = (rows, key, value) => Array.isArray(rows) && rows.some((r) => r[key] === value);
  const bm25Index = (indexes ?? []).find((r) => /USING (bm25|paradedb)/i.test(r.indexdef));
  const oldApi = bm25Index ? await probe('api_old_score_at_at_at', `SELECT id, paradedb.score(id) AS s FROM codebase_chunk_index WHERE content @@@ 'packet' ORDER BY s DESC LIMIT 1`) : null;
  const newApi = bm25Index ? await probe('api_new_pdb_score', `SELECT id, pdb.score(id) AS s FROM codebase_chunk_index WHERE content &&& 'packet' ORDER BY s DESC LIMIT 1`) : null;
  const ftsIndex = (indexes ?? []).find((r) => /USING gin \(search_vector\)/i.test(r.indexdef));

  receipt.levels = {
    BINARY_PRESENT: libdir === null ? null : libdir.length > 0,
    EXTENSION_AVAILABLE: available === null ? null : has(available, 'name', 'pg_search'),
    EXTENSION_INSTALLED: installed === null ? null : has(installed, 'extname', 'pg_search'),
    ACCESS_METHOD_PRESENT: am === null ? null : am.map((r) => r.amname),
    INDEX_PRESENT: indexes === null ? null : Boolean(bm25Index),
    QUERY_API_PROVEN: { paradedbScoreWithAtAtAt: oldApi === null ? null : oldApi.length > 0, pdbScoreWithAmpAmpAmp: newApi === null ? null : newApi.length > 0 },
    NATIVE_FTS_GIN_ON_SEARCH_VECTOR: indexes === null ? null : Boolean(ftsIndex),
    PGVECTOR_HNSW_INDEXES: indexes === null ? null : indexes.filter((r) => /USING hnsw/i.test(r.indexdef)).map((r) => r.indexname),
  };
  receipt.evidence = { pg_extension: installed, pg_available_extensions: available, pg_am: am, bm25Index: bm25Index ?? null, ftsIndex: ftsIndex ?? null, schemaFunctionCounts: funcs, binaryFiles: libdir };
} finally {
  await client.query('ROLLBACK').catch(() => {});
  client.release();
  await pool.end();
}

receipt.failures = failures;
receipt.status = failures.length === 0 ? 'PROBE_COMPLETE' : 'PROBE_PARTIAL';
const stamp = receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
receipt.receiptChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`;
const out = path.join(ROOT, 'docs/reports', `postgres-search-capabilities-v1-${stamp}.json`);
fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ status: receipt.status, server: receipt.server && { db: receipt.server.db, port: receipt.server.port, data_directory: receipt.server.data_directory }, levels: receipt.levels, failures, receipt: path.relative(ROOT, out) }, null, 2)}\n`);
