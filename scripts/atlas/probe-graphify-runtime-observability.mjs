#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv } from './connection-config.mjs';
import { createAtlasRedisClient } from './lib/redis-client-factory.mjs';

Object.assign(process.env, loadRepoEnv(process.env));

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const phase = process.argv.find((arg) => arg.startsWith('--phase='))?.split('=')[1] || 'snapshot';
const out = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) || `docs/reports/graphify-runtime-${phase}.json`;

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function probePostgres() {
  const pool = new pg.Pool({ connectionString: PG_URL, max: 1 });
  const result = {
    reachable: false,
    serverVersion: null,
    serverVersionNum: null,
    ioMethod: null,
    pgStatIoAvailable: false,
    pgStatIo: [],
    pgAiosAvailable: false,
    pgAios: { activeHandles: null, states: [] },
    settings: {},
    error: null,
  };
  try {
    await pool.query('BEGIN READ ONLY');
    const version = await pool.query(`SELECT version() AS version, current_setting('server_version_num') AS server_version_num`);
    result.reachable = true;
    result.serverVersion = version.rows[0]?.version ?? null;
    result.serverVersionNum = version.rows[0]?.server_version_num ?? null;

    const settingNames = [
      'io_method',
      'io_workers',
      'io_max_concurrency',
      'io_combine_limit',
      'io_max_combine_limit',
      'effective_io_concurrency',
      'maintenance_io_concurrency',
      'shared_buffers',
    ];
    for (const name of settingNames) {
      try {
        const setting = await pool.query('SELECT current_setting($1, true) AS value', [name]);
        result.settings[name] = setting.rows[0]?.value ?? null;
      } catch {
        result.settings[name] = null;
      }
    }
    result.ioMethod = result.settings.io_method ?? null;

    try {
      const io = await pool.query(`
        SELECT backend_type, object, context,
               reads, read_bytes, read_time,
               writes, write_bytes, write_time,
               extends, extend_bytes, extend_time,
               hits, evictions, reuses,
               fsyncs, fsync_time
        FROM pg_stat_io
        ORDER BY backend_type, object, context
      `);
      result.pgStatIoAvailable = true;
      result.pgStatIo = io.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, /^\d+(?:\.\d+)?$/.test(String(value)) ? safeNumber(value) : value])));
    } catch (error) {
      result.pgStatIoAvailable = false;
      result.pgStatIoError = String(error instanceof Error ? error.message : error);
    }

    try {
      const aios = await pool.query(`
        SELECT state, count(*)::bigint AS count
        FROM pg_aios
        GROUP BY state
        ORDER BY state
      `);
      result.pgAiosAvailable = true;
      result.pgAios.states = aios.rows.map((row) => ({ state: row.state, count: safeNumber(row.count) }));
      result.pgAios.activeHandles = result.pgAios.states.reduce((sum, row) => sum + (row.count ?? 0), 0);
    } catch (error) {
      result.pgAiosAvailable = false;
      result.pgAiosError = String(error instanceof Error ? error.message : error);
    }

    await pool.query('ROLLBACK');
  } catch (error) {
    result.error = String(error instanceof Error ? error.message : error).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '<redacted-url>');
    try { await pool.query('ROLLBACK'); } catch { /* ignore */ }
  } finally {
    await pool.end();
  }
  return result;
}

async function probeValkey() {
  const client = createAtlasRedisClient({
    host: process.env.REDIS_HOST || process.env.VALKEY_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || process.env.VALKEY_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || undefined,
  });
  const result = {
    reachable: false,
    server: {},
    memory: {},
    stats: {},
    keyspace: {},
    bifrostPrefixes: {},
    error: null,
  };
  const parseInfo = (text) => Object.fromEntries(String(text || '')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes(':'))
    .map((line) => {
      const idx = line.indexOf(':');
      return [line.slice(0, idx), line.slice(idx + 1)];
    }));
  try {
    await client.connect();
    result.reachable = true;
    result.server = parseInfo(await client.info('server'));
    result.memory = parseInfo(await client.info('memory'));
    result.stats = parseInfo(await client.info('stats'));
    result.keyspace = parseInfo(await client.info('keyspace'));

    for (const prefix of ['bifrost:packet:', 'bifrost:card:', 'bifrost:graph:', 'bifrost:retrieval:', 'bifrost:ace:']) {
      let cursor = '0';
      let count = 0;
      do {
        const reply = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
        cursor = String(reply[0]);
        count += Array.isArray(reply[1]) ? reply[1].length : 0;
      } while (cursor !== '0');
      result.bifrostPrefixes[prefix] = count;
    }
  } catch (error) {
    result.error = String(error instanceof Error ? error.message : error).replace(/(redis|rediss):\/\/[^\s]+/gi, '<redacted-url>');
  } finally {
    try { await client.quit(); } catch { /* ignore */ }
  }
  return result;
}

const report = {
  schema: 'atlas.graphify-runtime-observability.v1',
  phase,
  generatedAt: new Date().toISOString(),
  scope: 'read-only runtime telemetry; no Postgres rows or Valkey keys mutated',
  postgres: await probePostgres(),
  valkey: await probeValkey(),
};

const outputPath = resolve(root, out);
mkdirSync(resolve(outputPath, '..'), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'GRAPHIFY_RUNTIME_OBSERVABILITY_CAPTURED',
  phase,
  output: out,
  postgres: report.postgres.reachable,
  postgresAioMethod: report.postgres.ioMethod,
  pgStatIo: report.postgres.pgStatIoAvailable,
  pgAios: report.postgres.pgAiosAvailable,
  valkey: report.valkey.reachable,
}, null, 2));
