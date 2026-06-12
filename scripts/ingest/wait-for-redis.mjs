#!/usr/bin/env node
/**
 * wait-for-redis.mjs
 *
 * Read-only Redis/Valkey preflight for startup chains.
 * - Loads repo env files
 * - Normalizes host/port and auth
 * - Pings Redis with a bounded retry window
 * - Emits a single clean failure for NOAUTH / unreachable services
 *
 * Usage:
 *   node scripts/ingest/wait-for-redis.mjs
 *   node scripts/ingest/wait-for-redis.mjs --allow-offline
 *   node scripts/ingest/wait-for-redis.mjs --timeout=10000 --interval=500
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveRedisConfig } from '../atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const ALLOW_OFFLINE = args.includes('--allow-offline');
const timeoutArg = args.find((arg) => arg.startsWith('--timeout='));
const intervalArg = args.find((arg) => arg.startsWith('--interval='));
const TIMEOUT_MS = Number(timeoutArg ? timeoutArg.split('=')[1] : 10_000) || 10_000;
const INTERVAL_MS = Number(intervalArg ? intervalArg.split('=')[1] : 500) || 500;

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

for (const rel of ['.env.local', '.env']) {
  loadDotenv(path.join(ROOT, rel));
  loadDotenv(path.join(ROOT, 'sveltekit-frontend', rel));
}

const env = loadRepoEnv(process.env);
const redis = resolveRedisConfig(env);
const REDIS_URL = `redis://${redis.host}:${redis.port}`;
const REDIS_PASSWORD = redis.password;

let Redis;
try {
  Redis = (await import('ioredis')).default;
} catch (err) {
  console.error(`wait-for-redis: failed to load ioredis: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(ALLOW_OFFLINE ? 0 : 1);
}

const client = new Redis(REDIS_URL, {
  password: REDIS_PASSWORD,
  family: 4,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  connectTimeout: Math.max(1000, Math.min(TIMEOUT_MS, 5000)),
});

client.on('error', () => {});

const startedAt = Date.now();
let lastError = null;
let authError = false;

async function tryPing() {
  try {
    await client.connect();
    const value = await client.ping();
    return String(value).toUpperCase() === 'PONG';
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    authError = /NOAUTH|WRONGPASS|AUTH/i.test(lastError);
    return false;
  }
}

async function main() {
  console.log(`wait-for-redis: host=${redis.host} port=${redis.port} timeout=${TIMEOUT_MS}ms interval=${INTERVAL_MS}ms`);

  while ((Date.now() - startedAt) < TIMEOUT_MS) {
    const ok = await tryPing();
    if (ok) {
      console.log('wait-for-redis: Redis is ready');
      try { await client.quit(); } catch { /* ignore */ }
      process.exit(0);
    }

    if (authError) break;
    try { await client.disconnect(); } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  try { await client.disconnect(); } catch { /* ignore */ }

  if (authError) {
    console.error('wait-for-redis: Redis reachable but authentication failed (NOAUTH/WRONGPASS)');
    if (ALLOW_OFFLINE) {
      console.warn('wait-for-redis: offline mode allowed; continuing without Redis');
      process.exit(0);
    }
    process.exit(1);
  }

  console.error(`wait-for-redis: Redis unavailable after ${TIMEOUT_MS}ms${lastError ? ` (${lastError})` : ''}`);
  if (ALLOW_OFFLINE) {
    console.warn('wait-for-redis: offline mode allowed; continuing without Redis');
    process.exit(0);
  }
  process.exit(1);
}

main();
