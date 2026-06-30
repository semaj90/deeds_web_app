#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import { loadRepoEnv } from '../../../scripts/atlas/connection-config.mjs';
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

// Load repo + frontend env through the shared Atlas helper so .env.local
// can override .env consistently for every nested startup script.
Object.assign(process.env, loadRepoEnv(process.env));

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
  const config = resolveRedisConnection();
  const redis = new Redis({
    host: config.host,
    port: config.port,
    ...(config.password ? { password: config.password } : {}),
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
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

const steps = [
  ['graphify:daily', { required: true, name: 'Graphify Audit (Gemma4)' }],
  ['graphify:cluster-cards:generate', { required: false, name: 'Generate cluster-cards.jsonl' }],
  ['graphify:cluster-cards:validate', { required: false, name: 'Validate schema' }],
  ['graphify:cluster-cards:load', { required: false, name: 'Load into Postgres' }],
];

const stepResults = [];
for (const [script, opts] of steps) {
  console.log(`🗺️ ${opts.name} → npm run ${script}`);
  const result = spawnNpmScript(script);
  stepResults.push({ script, ...opts, status: result.status === 0 ? 'pass' : 'fail' });

  if (result.status !== 0 && opts.required) {
    console.error(`🗺️ ${opts.name} failed (exit ${result.status}) — aborting`);
    process.exit(result.status ?? 1);
  }
}

const passed = stepResults.filter((r) => r.status === 'pass').length;
const failed = stepResults.filter((r) => r.status === 'fail').length;

if (passed > 0) {
  writeFileSync(STAMP, new Date().toISOString() + '\n', 'utf8');
}

let semanticRefresh = {
  enabled: INCLUDE_SEMANTIC_REFRESH,
  script: SEMANTIC_REFRESH_SCRIPT,
  status: 'skipped',
  detail: null,
};

if (INCLUDE_SEMANTIC_REFRESH && passed > 0) {
  console.log(`🗺️ graphify:daily semantic refresh → npm run ${SEMANTIC_REFRESH_SCRIPT}`);
  const semanticRun = spawnNpmScript(SEMANTIC_REFRESH_SCRIPT);
  if (semanticRun.status === 0) {
    semanticRefresh = {
      ...semanticRefresh,
      status: 'complete',
      detail: 'semantic refresh completed successfully',
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

const stepsSummary = stepResults.map((r) => `${r.script}:${r.status}`).join(' | ');
const logBits = [
  `${new Date().toISOString()} graphify startup complete`,
  `${passed}/${stepResults.length} steps passed`,
  stepsSummary,
];
if (INCLUDE_SEMANTIC_REFRESH) {
  logBits.push(`semantic:${semanticRefresh.status}`);
}
writeFileSync(LOG_PATH, `${logBits.join(' | ')}\n`, 'utf8');
writeValidationCache({
  status: 'complete',
  reason: null,
  detail: `${passed}/${stepResults.length} startup steps completed`,
  graphFailedDueTo: null,
  stepResults,
  semanticRefresh,
  redis: resolveRedisConnection(),
});
console.log(`🗺️ graphify:startup:safe complete — ${passed}/${stepResults.length} steps passed`);
process.exit(0);
