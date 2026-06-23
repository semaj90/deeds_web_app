#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { resolveRedisConfig } from '../lib/redis-url.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');
const LOG_DIR = resolve(ROOT, 'logs', 'task-output');
const TMP_DIR = resolve(ROOT, '.tmp');
const STAMP = resolve(LOG_DIR, '.graphify-daily-last-run');
const LOG_PATH = resolve(LOG_DIR, 'graphify-daily-startup.log');
const CACHE_PATH = resolve(LOG_DIR, 'graphify-daily-startup.json');
const TMP_CACHE_PATH = resolve(TMP_DIR, 'graphify-daily-startup.json');
const COOLDOWN_SEC = 3600;
const INCLUDE_SEMANTIC_REFRESH = /^(1|true|yes|on)$/i.test(process.env.GRAPHIFY_DAILY_INCLUDE_SEMANTIC ?? '');
const SEMANTIC_REFRESH_SCRIPT = process.env.GRAPHIFY_DAILY_SEMANTIC_SCRIPT?.trim() || 'graphify:semantic';

// Load the frontend env before spawning graphify so Redis/Qdrant/Postgres
// auth and host values are available to every nested npm script.
dotenv.config({ path: resolve(ROOT, '.env'), override: false });
dotenv.config({ path: resolve(ROOT, '.env.local'), override: false });

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

function resolveRedisConnection() {
  const config = resolveRedisConfig(process.env);
  return {
    host: config.host,
    port: config.port,
    password: config.password,
  };
}

function writeValidationCache(payload) {
  const cache = {
    generatedAt: new Date().toISOString(),
    ...payload,
  };
  writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  writeFileSync(TMP_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  return cache;
}

function spawnNpmScript(scriptName) {
  return process.platform === 'win32'
    ? spawnSync(
        'cmd.exe',
        ['/d', '/s', '/c', `npm run ${scriptName}`],
        {
          cwd: ROOT,
          stdio: 'inherit',
          windowsHide: true,
        }
      )
    : spawnSync('npm', ['run', scriptName], {
        cwd: ROOT,
        stdio: 'inherit',
        windowsHide: true,
      });
}
async function preflightRedisAuth() {
  const redis = new Redis({
    ...resolveRedisConnection(),
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
  });
  const onError = () => {};
  redis.on('error', onError);
  try {
    await redis.connect();
    await redis.ping();
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes('NOAUTH') || msg.includes('Authentication required') || msg.includes('WRONGPASS')) {
      return { ok: false, reason: 'AUTH_REQUIRED', message: msg };
    }
    if (msg.includes('ECONNREFUSED')) {
      return { ok: false, reason: 'SERVICE_STOPPED', message: msg };
    }
    return { ok: false, reason: 'REDIS_UNAVAILABLE', message: msg };
  } finally {
    try { await redis.quit(); } catch {}
    redis.off('error', onError);
  }
}

const shouldSkip = existsSync(STAMP)
  ? (Date.now() - statSync(STAMP).mtimeMs) / 1000 < COOLDOWN_SEC
  : false;

if (shouldSkip) {
  const mins = Math.round((Date.now() - statSync(STAMP).mtimeMs) / 60000);
  const message = `🗺️ graphify:daily skipped — last run ${mins} min ago (cooldown ${COOLDOWN_SEC / 60} min)`;
  console.log(message);
  writeValidationCache({
    status: 'skipped',
    reason: 'cooldown',
    detail: message,
    lastRunStamp: STAMP,
    cooldownSec: COOLDOWN_SEC,
  });
  process.exit(0);
}

const redisGate = await preflightRedisAuth();
if (!redisGate.ok) {
  const reason = redisGate.reason === 'AUTH_REQUIRED'
    ? 'Redis auth required'
    : redisGate.reason === 'SERVICE_STOPPED'
      ? 'Redis unavailable'
      : 'Redis unavailable';
  const message = redisGate.message ? `: ${redisGate.message}` : '';
  const clean = `🗺️ graphify:daily skipped — ${reason}${message}`;
  console.warn(clean);
  writeFileSync(LOG_PATH, `${new Date().toISOString()} ${clean}\n`, 'utf8');
  writeValidationCache({
    status: 'skipped',
    reason: redisGate.reason,
    detail: redisGate.message ?? reason,
    graphFailedDueTo: reason,
    redis: resolveRedisConnection(),
  });
  process.exit(0);
}

const run = spawnNpmScript('graphify:daily');

if (run.status === 0) {
  writeFileSync(STAMP, new Date().toISOString() + '\n', 'utf8');

  let semanticRefresh = {
    enabled: INCLUDE_SEMANTIC_REFRESH,
    script: SEMANTIC_REFRESH_SCRIPT,
    status: 'skipped',
    detail: null,
  };

  if (INCLUDE_SEMANTIC_REFRESH) {
    console.log(`🗺️ graphify:daily semantic refresh → npm run ${SEMANTIC_REFRESH_SCRIPT}`);
    const semanticRun = spawnNpmScript(SEMANTIC_REFRESH_SCRIPT);
    if (semanticRun.status === 0) {
      semanticRefresh = {
        ...semanticRefresh,
        status: 'complete',
        detail: 'graphify:semantic completed successfully',
      };
    } else {
      const semanticError = semanticRun.error ? String(semanticRun.error.message ?? semanticRun.error) : '';
      semanticRefresh = {
        ...semanticRefresh,
        status: 'failed',
        detail: semanticError || `exit:${semanticRun.status ?? 1}`,
      };
      console.warn(`🗺️ graphify:daily semantic refresh failed — ${semanticRefresh.detail}`);
    }
  }

  const logBits = [`${new Date().toISOString()} graphify:daily complete`];
  if (INCLUDE_SEMANTIC_REFRESH) {
    logBits.push(`semantic:${semanticRefresh.status}`);
    if (semanticRefresh.detail) logBits.push(`[${semanticRefresh.detail}]`);
  }
  writeFileSync(LOG_PATH, `${logBits.join(' | ')}\n`, 'utf8');
  writeValidationCache({
    status: 'complete',
    reason: null,
    detail: 'graphify:daily completed successfully',
    graphFailedDueTo: null,
    semanticRefresh,
    redis: resolveRedisConnection(),
  });
  console.log(INCLUDE_SEMANTIC_REFRESH && semanticRefresh.status === 'complete'
    ? '🗺️ graphify:daily complete + semantic refresh complete'
    : INCLUDE_SEMANTIC_REFRESH
      ? '🗺️ graphify:daily complete + semantic refresh warning'
      : '🗺️ graphify:daily complete');
  process.exit(0);
}

const runError = run.error ? String(run.error.message ?? run.error) : '';
const exitBits = [
  'graphify:daily failed',
  runError ? `[spawn error] ${runError}` : '',
  typeof run.status === 'number' ? `[exit code] ${run.status}` : '',
  run.signal ? `[signal] ${run.signal}` : '',
].filter(Boolean);
writeFileSync(LOG_PATH, `${new Date().toISOString()} ${exitBits.join(' | ')}\n`, 'utf8');
writeValidationCache({
  status: 'failed',
  reason: runError || (run.signal ? `signal:${run.signal}` : `exit:${run.status ?? 1}`),
  detail: exitBits.join(' | '),
  graphFailedDueTo: runError || (run.signal ? `signal:${run.signal}` : `exit:${run.status ?? 1}`),
  semanticRefresh: {
    enabled: INCLUDE_SEMANTIC_REFRESH,
    script: SEMANTIC_REFRESH_SCRIPT,
    status: 'skipped',
    detail: null,
  },
  redis: resolveRedisConnection(),
});
console.error(exitBits.join('\n'));
process.exit(run.status ?? 1);
