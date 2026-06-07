#!/usr/bin/env node
/**
 * smoke-valkey-node-client.mjs
 *
 * Isolated Node/ioredis smoke test for the Valkey container.
 * Exercises PING, SET/GET/DEL, XADD, and HSET/HGET on isolated
 * test:valkey:* keys (all expired within 60s, nothing touches app data).
 *
 * Reads config from (in priority order):
 *   1. REDIS_URL  env var
 *   2. .env.local → .env → root .env
 *   3. Defaults: redis://127.0.0.1:6379, password=redis
 *
 * Output:
 *   .tmp/valkey-node-client-smoke.json
 *   .tmp/valkey-node-client-smoke.md
 *   stdout summary
 *
 * Exit codes:
 *   0  all ops succeeded
 *   1  PING failed or critical op failed
 *   2  connection refused / load error
 */

import { createRequire } from 'module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

// ── load .env files ───────────────────────────────────────────────────────────

function loadDotenv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

for (const f of ['.env.local', '.env']) {
  loadDotenv(path.join(ROOT, 'sveltekit-frontend', f));
  loadDotenv(path.join(ROOT, f));
}

// ── config ────────────────────────────────────────────────────────────────────

const REDIS_URL      = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';

let parsedUrl = null;
try { parsedUrl = new URL(REDIS_URL); } catch { /* fall through */ }

const HOST = parsedUrl?.hostname ?? '127.0.0.1';
const PORT = Number(parsedUrl?.port ?? 6379);

// Auth source — never print the password
let authSource = 'default:redis';
if (process.env.REDIS_URL)                                 authSource = 'env:REDIS_URL';
else if (process.env.REDIS_PASSWORD || process.env.REDIS_PASS) authSource = 'env:REDIS_PASSWORD';

// ── results struct ────────────────────────────────────────────────────────────

const result = {
  timestamp   : new Date().toISOString(),
  host        : HOST,
  port        : PORT,
  authSource,
  ipFamily    : 4,
  connected   : false,
  connectError: null,
  ops         : {},
  summary     : '',
  recommendation: null,
};

// ── load ioredis ──────────────────────────────────────────────────────────────

let Redis;
try {
  Redis = (await import('ioredis')).default;
} catch (e) {
  result.connectError = `Failed to import ioredis: ${e.message}`;
  result.summary = 'FAIL — ioredis not installed';
  finish(2);
}

// ── connect ───────────────────────────────────────────────────────────────────

const client = new Redis(REDIS_URL, {
  password             : REDIS_PASSWORD || undefined,
  family               : 4,
  lazyConnect          : true,
  maxRetriesPerRequest : 1,
  enableReadyCheck     : true,
  connectTimeout       : 5000,
  commandTimeout       : 5000,
  retryStrategy        : () => null,   // no auto-retry in smoke test
});

client.on('error', () => {});  // suppress unhandled error events

try {
  await client.connect();
  result.connected = true;
} catch (e) {
  result.connectError = e.message ?? String(e);
  result.summary = `FAIL — connect error: ${result.connectError}`;
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(result.connectError)) {
    result.recommendation = `Check that the Valkey container is running: docker ps | grep legal-ai-valkey\nOr set REDIS_URL=redis://:redis@127.0.0.1:6379 in .env`;
  }
  await client.disconnect();
  finish(2);
}

// ── ops ───────────────────────────────────────────────────────────────────────

async function op(name, fn) {
  const t0 = Date.now();
  try {
    const value = await fn();
    result.ops[name] = { ok: true, latencyMs: Date.now() - t0, value: String(value ?? '').slice(0, 80) };
  } catch (e) {
    result.ops[name] = { ok: false, latencyMs: Date.now() - t0, error: e.message ?? String(e) };
  }
}

// PING
await op('ping', () => client.ping());

// SET / GET / DEL (isolated test key, 60s TTL)
const TS = Date.now().toString();
await op('set',  () => client.set('test:valkey:ping', TS, 'EX', 60));
await op('get',  async () => {
  const v = await client.get('test:valkey:ping');
  if (v !== TS) throw new Error(`GET mismatch: expected ${TS}, got ${v}`);
  return v;
});
await op('del',  () => client.del('test:valkey:ping'));

// XADD (streams — Valkey supports Redis Streams)
await op('xadd', () =>
  client.xadd('test:valkey:events', 'MAXLEN', '~', '100', '*', 'ts', TS, 'smoke', 'true')
);
await op('del_stream', () => client.del('test:valkey:events'));

// HSET / HGET
await op('hset', () => client.hset('test:valkey:hash', 'ts', TS, 'smoke', 'true'));
await op('hget', async () => {
  const v = await client.hget('test:valkey:hash', 'ts');
  if (v !== TS) throw new Error(`HGET mismatch: expected ${TS}, got ${v}`);
  return v;
});
await op('hdel', () => client.del('test:valkey:hash'));

// ── quit ─────────────────────────────────────────────────────────────────────

try { await client.quit(); } catch { /* ignore */ }

// ── summarise ────────────────────────────────────────────────────────────────

const allOk  = Object.values(result.ops).every(o => o.ok);
const pingOk = result.ops.ping?.ok === true;
const failed = Object.entries(result.ops).filter(([, o]) => !o.ok).map(([k]) => k);

if (allOk) {
  result.summary = `PASS — all ${Object.keys(result.ops).length} ops succeeded`;
} else if (!pingOk) {
  result.summary = `FAIL — PING failed (${result.ops.ping?.error})`;
} else {
  result.summary = `PARTIAL — PING ok but ops failed: ${failed.join(', ')}`;
}

finish(allOk ? 0 : (pingOk ? 1 : 1));

// ── output ────────────────────────────────────────────────────────────────────

function finish(exitCode) {
  mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });

  const jsonPath = path.join(ROOT, '.tmp/valkey-node-client-smoke.json');
  const mdPath   = path.join(ROOT, '.tmp/valkey-node-client-smoke.md');

  writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const icon = exitCode === 0 ? '✅' : exitCode === 2 ? '❌' : '⚠️';
  const lines = [
    `# Valkey Node Client Smoke — ${result.timestamp}`,
    '',
    `**Status**: ${icon} ${result.summary}`,
    '',
    `| Field | Value |`,
    `|---|---|`,
    `| host | ${result.host} |`,
    `| port | ${result.port} |`,
    `| ipFamily | IPv${result.ipFamily} |`,
    `| authSource | ${result.authSource} |`,
    `| connected | ${result.connected} |`,
    '',
    `## Operations`,
    '',
    `| Op | OK | Latency | Detail |`,
    `|---|---|---|---|`,
    ...Object.entries(result.ops).map(([k, o]) =>
      `| ${k} | ${o.ok ? '✅' : '❌'} | ${o.latencyMs}ms | ${o.ok ? (o.value ?? '') : (o.error ?? '')} |`
    ),
  ];

  if (result.connectError) {
    lines.push('', `**Connect error**: \`${result.connectError}\``);
  }
  if (result.recommendation) {
    lines.push('', `**Recommendation**:`, '', '```', result.recommendation, '```');
  }

  writeFileSync(mdPath, lines.join('\n'));

  const statusIcon = exitCode === 0 ? '✅' : exitCode === 2 ? '❌' : '⚠️ ';
  console.log(`\n${statusIcon} Valkey Node Client Smoke`);
  console.log(`   ${result.summary}`);
  if (result.connected) {
    const latencies = Object.values(result.ops).filter(o => o.ok).map(o => o.latencyMs);
    if (latencies.length) {
      console.log(`   Latency avg: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
    }
  }
  if (failed.length) console.log(`   Failed ops: ${failed.join(', ')}`);
  console.log(`   Report: .tmp/valkey-node-client-smoke.json\n`);

  process.exit(exitCode);
}
