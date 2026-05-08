#!/usr/bin/env node
/**
 * ace-incremental-startup.mjs
 *
 * Two-lane startup orchestrator:
 *   1. INCREMENTAL lane (always)  — fast, fail-closed, refreshes caches/rankings
 *      based on git-changed files. Idempotent. Lock-protected.
 *   2. HEAVY lane (once/day, GPU warm) — graphify authority/cluster/bow-tiles
 *      passes that need TurboQuant + Ollama up. Skipped silently otherwise.
 *
 * Policy: config/startup-ace-policy.json — denies destructive commands.
 * Logs:   logs/task-output/pipeline-test/startup-<timestamp>.json
 *
 * Flags:
 *   --dry        Run incremental as dry only; never trigger heavy lane
 *   --force      Bypass lock + last-sha skip (still respects policy denylist)
 *   --heavy-only Skip incremental; only attempt heavy lane (GPU-gated)
 *
 * Returns exit 0 even on skip; only fails on policy violation or unhandled error.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const POLICY_PATH = resolve(ROOT, 'config/startup-ace-policy.json');

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const HEAVY_ONLY = process.argv.includes('--heavy-only');

if (!existsSync(POLICY_PATH)) {
  console.error(`[startup] FATAL: policy file missing: ${POLICY_PATH}`);
  process.exit(2);
}
const POLICY = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
const LOG_DIR = resolve(ROOT, POLICY.logDir);
mkdirSync(LOG_DIR, { recursive: true });

const denySet = new Set(POLICY.neverRunOnStartup ?? []);

const log = {
  startedAt: new Date().toISOString(),
  mode: DRY ? 'dry' : HEAVY_ONLY ? 'heavy-only' : 'safe',
  steps: [],
  changedFiles: [],
  status: 'running',
  heavyLane: { attempted: false, ran: false, reason: null },
};

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();
  } catch (_err) {
    return '';
  }
}

function runStep(name, npmScript, opts = {}) {
  // Policy enforcement — refuse destructive commands even if caller wired them in.
  if (denySet.has(npmScript)) {
    const step = { name, command: `npm run ${npmScript}`, status: 'DENIED', ms: 0,
                   error: `policy: ${npmScript} is in neverRunOnStartup` };
    log.steps.push(step);
    console.error(`[startup] DENY ${name} (${npmScript}) — policy violation`);
    if (opts.required !== false) throw new Error(step.error);
    return step;
  }
  const startedAt = Date.now();
  const res = spawnSync('npm', ['run', npmScript], {
    cwd: ROOT,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    timeout: opts.timeout ?? 120_000,
  });
  const step = {
    name,
    command: `npm run ${npmScript}`,
    status: res.status === 0 ? 'PASS' : 'FAIL',
    ms: Date.now() - startedAt,
    stdoutTail: (res.stdout ?? '').slice(-2000),
    stderrTail: (res.stderr ?? '').slice(-2000),
  };
  log.steps.push(step);
  if (res.status !== 0 && opts.required !== false) {
    throw new Error(`${name} failed (exit ${res.status})`);
  }
  return step;
}

async function probeGpuWarm() {
  const gate = POLICY.heavyServiceWorker?.gpuWarmGate;
  if (!gate) return false;
  async function probe(url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(gate.probeTimeoutMs ?? 3000) });
      return res.ok;
    } catch { return false; }
  }
  const tq = await probe(gate.turboquantUrl);
  const ol = await probe(gate.ollamaUrl);
  log.heavyLane.gpuProbe = { turboquant: tq, ollama: ol };
  return gate.requireBoth ? (tq && ol) : (tq || ol);
}

function classifyChanges(changed) {
  const triggers = POLICY.thresholds?.schemaChangeTriggers ?? [];
  const isSchemaChange = changed.some(f => triggers.some(t => f.startsWith(t) || f === t));
  if (isSchemaChange) return 'schema';
  const small = POLICY.thresholds?.smallChangeMaxFiles ?? 20;
  const medium = POLICY.thresholds?.mediumChangeMaxFiles ?? 200;
  if (changed.length <= small) return 'small';
  if (changed.length <= medium) return 'medium';
  return 'large';
}

async function runIncrementalLane(redis) {
  const lockKey = POLICY.lockKey;
  const lockTtl = POLICY.lockTtlSec ?? 900;
  const acquired = FORCE
    ? 'forced'
    : await redis.set(lockKey, String(Date.now()), 'EX', lockTtl, 'NX');
  if (!acquired) {
    log.status = 'skipped';
    log.reason = 'incremental lock already held';
    console.log('[startup] incremental: lock held, skipping');
    return;
  }
  try {
    const head = git(['rev-parse', 'HEAD']) || 'unknown';
    const lastSha = await redis.get(POLICY.redisStateKeys.lastSha);
    log.head = head;
    log.lastSha = lastSha;

    let changed = [];
    if (lastSha && lastSha !== head) {
      changed = git(['diff', '--name-only', lastSha, head]).split('\n').filter(Boolean);
    } else if (!lastSha) {
      changed = git(['diff', '--name-only', 'HEAD~1', 'HEAD']).split('\n').filter(Boolean);
    }
    log.changedFiles = changed;

    const relevant = changed.filter(f =>
      /^(sveltekit-frontend\/)?(src|scripts|docs|memory|next_steps|drizzle|package\.json|CLAUDE\.md|AGENTS\.md)/.test(f)
    );
    log.relevantCount = relevant.length;
    log.changeClass = classifyChanges(relevant);

    if (relevant.length === 0 && !FORCE) {
      log.status = 'skipped';
      log.reason = 'no relevant changed files';
      // Still update sha so next run sees a fresh baseline
      if (head !== 'unknown') await redis.set(POLICY.redisStateKeys.lastSha, head);
      console.log('[startup] incremental: no relevant changes, sha advanced');
      return;
    }

    runStep('agents pipeline dry-run', 'agents:pipeline:dry', { timeout: 180_000 });

    if (!DRY) {
      runStep('agents pipeline safe', 'agents:pipeline:safe', { timeout: 240_000 });
    }

    runStep('topology validate', 'topology:validate', { required: false, timeout: 120_000 });
    runStep('graph synthesize', 'graph:synthesize', { required: false, timeout: 240_000 });

    // ace:hit-demand — refresh chunk_hit_log → Redis demand hash on every
    // folder open. Cheap (~3s), idempotent (HSET atomic replace), 1h TTL so
    // stale entries self-evict if startup misses. Reads append-only Postgres
    // table, never destructive. Empty hit-log is handled (logs "no recent
    // hits" and exits clean) so this is safe even on a cold dev machine.
    runStep('ace hit-demand refresh', 'ace:hit-demand', { required: false, timeout: 60_000 });

    await redis.hset('ace:startup:latest', {
      head,
      changedCount: String(relevant.length),
      changeClass: log.changeClass,
      status: 'PASS',
      mode: log.mode,
      updatedAt: new Date().toISOString(),
    });
    if (head !== 'unknown') await redis.set(POLICY.redisStateKeys.lastSha, head);
    log.status = 'PASS';
  } finally {
    if (acquired === true) await redis.del(lockKey).catch(() => {});
  }
}

async function runHeavyLane(redis) {
  const cfg = POLICY.heavyServiceWorker;
  if (!cfg?.enabled) {
    log.heavyLane.reason = 'disabled in policy';
    return;
  }
  log.heavyLane.attempted = true;

  const lockKey = POLICY.redisStateKeys.heavyLock;
  const lock = FORCE
    ? 'forced'
    : await redis.set(lockKey, String(Date.now()), 'EX', 60 * 60, 'NX');
  if (!lock) {
    log.heavyLane.reason = 'heavy lock already held';
    return;
  }
  try {
    const lastRun = await redis.get(POLICY.redisStateKeys.heavyLastRun);
    if (lastRun && !FORCE) {
      const ageHours = (Date.now() - new Date(lastRun).getTime()) / 3_600_000;
      if (ageHours < cfg.cooldownHours) {
        log.heavyLane.reason = `cooldown — last ran ${ageHours.toFixed(1)}h ago (threshold ${cfg.cooldownHours}h)`;
        return;
      }
    }

    const gpuWarm = await probeGpuWarm();
    if (!gpuWarm && !FORCE) {
      log.heavyLane.reason = 'GPU not warm — TurboQuant/Ollama health probe failed';
      return;
    }

    for (const taskName of cfg.tasks) {
      runStep(`heavy: ${taskName}`, taskName, { required: false, timeout: 600_000 });
    }
    log.heavyLane.ran = true;
    await redis.set(POLICY.redisStateKeys.heavyLastRun, new Date().toISOString());
  } finally {
    if (lock === true) await redis.del(lockKey).catch(() => {});
  }
}

async function main() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 3000,
    enableReadyCheck: false,
  });
  try {
    await redis.connect();
  } catch (err) {
    log.status = 'skipped';
    log.reason = `redis unavailable: ${err.message}`;
    return;
  }

  try {
    if (!HEAVY_ONLY) await runIncrementalLane(redis);
    if (!DRY) await runHeavyLane(redis);
  } finally {
    await redis.quit().catch(() => {});
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
main()
  .catch((err) => {
    log.status = 'FAIL';
    log.error = err.message;
    process.exitCode = 1;
  })
  .finally(() => {
    log.finishedAt = new Date().toISOString();
    log.totalMs = new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime();
    const out = JSON.stringify(log, null, 2);
    writeFileSync(resolve(LOG_DIR, `startup-${stamp}.json`), out);
    writeFileSync(resolve(LOG_DIR, 'startup-latest.json'), out);
    const heavy = log.heavyLane.ran ? '+heavy' : (log.heavyLane.attempted ? '(heavy-skipped)' : '');
    console.log(`[startup] ${log.status} ${heavy} → logs/task-output/pipeline-test/startup-latest.json (${log.totalMs ?? 0}ms)`);
  });
