#!/usr/bin/env node
/**
 * Read-only PostgreSQL runtime capability receipt.
 *
 * This proves the connected server/runtime version and relevant PG18 I/O
 * settings. It does not run migrations, DDL, backfills, or application writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const outputPath = path.resolve(
  process.argv[2] ?? path.join(process.cwd(), 'docs/reports/postgresql18-runtime-readiness-v1.json'),
);
const databaseUrl = process.env.DATABASE_URL;

const base = {
  schema: 'atlas.postgresql18-runtime-readiness.v1',
  generatedAt: new Date().toISOString(),
  authority: 'POSTGRESQL_RUNTIME_OBSERVATION_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  mutationPolicy: {
    ddl: false,
    migrations: false,
    rowWrites: false,
    cacheWrites: false,
  },
};

async function main() {
  if (!databaseUrl) {
    const report = {
      ...base,
      status: 'DATABASE_URL_REQUIRED',
      serverVersion: null,
      serverVersionNum: null,
      aio: [],
      workload: null,
    };
    writeReport(report);
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    const versionResult = await pool.query('SELECT version() AS version, current_setting(\'server_version_num\') AS server_version_num');
    const settingsResult = await pool.query(`
      SELECT name, setting, unit, context, source
      FROM pg_settings
      WHERE name IN (
        'io_method', 'io_workers', 'io_max_concurrency',
        'effective_io_concurrency', 'maintenance_io_concurrency'
      )
      ORDER BY name
    `);
    const workloadResult = await pool.query(`
      SELECT
        (SELECT COUNT(*)::bigint FROM atlas_packets) AS atlas_packets,
        (SELECT COUNT(*)::bigint FROM codebase_chunk_index) AS codebase_chunks,
        (SELECT COUNT(*)::bigint FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL) AS embedded_chunks
    `);

    const version = String(versionResult.rows[0]?.version ?? '');
    const serverVersionNum = String(versionResult.rows[0]?.server_version_num ?? '');
    const major = Number.parseInt(serverVersionNum.slice(0, -2) || '0', 10);
    const report = {
      ...base,
      status: major >= 18 ? 'POSTGRESQL_18_RUNTIME_PROVEN' : 'POSTGRESQL_18_RUNTIME_NOT_PROVEN',
      serverVersion: version,
      serverVersionNum,
      serverMajor: major,
      aio: settingsResult.rows,
      workload: workloadResult.rows[0] ?? null,
      evidence: {
        serverVersionQuery: 'SELECT version(), current_setting(server_version_num)',
        settingsQuery: 'pg_settings:io_method/io_workers/io_max_concurrency/effective_io_concurrency/maintenance_io_concurrency',
        workloadQuery: 'atlas_packets/codebase_chunk_index/content_embedding_768 counts',
      },
    };
    writeReport(report);
    if (report.status !== 'POSTGRESQL_18_RUNTIME_PROVEN') process.exitCode = 1;
  } catch (error) {
    const report = {
      ...base,
      status: 'POSTGRESQL_RUNTIME_UNAVAILABLE',
      error: error instanceof Error ? error.message : String(error),
      serverVersion: null,
      serverVersionNum: null,
      aio: [],
      workload: null,
    };
    writeReport(report);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: report.status, writesPerformed: false }, null, 2));
}

await main();
