#!/usr/bin/env node

/** Read-only plan for revision-qualified symbol-resolver/cache keys. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisConfig } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(ROOT, 'docs/reports/symbol-resolver-revision-key-plan-v1.json');
const env = loadRepoEnv();

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const report = {
    schema: 'atlas.symbol-resolver-revision-key-plan.v1',
    readOnly: true,
    writesPerformed: false,
    status: 'UNKNOWN',
    table: { exists: false, columns: [], rowCount: 0 },
    keyContract: {
      proposedSchema: 'atlas.symbol-resolver-cache-key.v1',
      requiredFields: ['workspaceRevision', 'sourceRevision', 'featureId', 'packetKey'],
      currentRevisionFields: [],
      status: 'BLOCKED_MISSING_REVISION_COLUMNS'
    },
    cache: { namespace: 'symbol:*:packets', keyCount: null, writesPerformed: false },
    nextGate: 'GRAPH-RESOLVE-02 add or bind a revision-qualified producer; do not warm cache from legacy rows'
  };
  try {
    const table = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'symbol_resolver'
      ORDER BY ordinal_position
    `);
    report.table.exists = table.rowCount > 0;
    report.table.columns = table.rows;
    if (report.table.exists) {
      const count = await pool.query('SELECT COUNT(*)::int AS count FROM symbol_resolver');
      report.table.rowCount = count.rows[0].count;
      report.keyContract.currentRevisionFields = table.rows.map((row) => row.column_name)
        .filter((name) => ['workspace_revision', 'source_revision', 'graph_revision'].includes(name));
      report.status = report.keyContract.currentRevisionFields.length >= 2
        ? 'REVISION_FIELDS_PRESENT_CACHE_PRODUCER_REVIEW'
        : 'BLOCKED_MISSING_REVISION_COLUMNS';
    } else {
      report.status = 'BLOCKED_SYMBOL_RESOLVER_TABLE_MISSING';
    }
  } finally {
    await pool.end();
  }
  const redisConfig = resolveRedisConfig(env);
  const redis = new Redis({ ...redisConfig, lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null });
  try {
    await redis.connect();
    report.cache.keyCount = (await redis.keys(report.cache.namespace)).length;
  } catch (error) {
    report.cache.error = error instanceof Error ? error.message : String(error);
  } finally {
    redis.disconnect();
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, rowCount: report.table.rowCount, cacheKeyCount: report.cache.keyCount, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
