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
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, openSync } from 'node:fs';
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

async function probeServices() {
  async function hit(url, timeoutMs = 2500) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return res.ok ? 'up' : `http-${res.status}`;
    } catch { return 'down'; }
  }
  const [caddy, bifrost, goRetrieval, traceMcp, turboQuant] = await Promise.all([
    hit('http://127.0.0.1:5178/health'),          // Caddy QUIC proxy
    hit('http://127.0.0.1:3040/health'),           // Bifrost semantic cache
    hit('http://127.0.0.1:8100/health'),           // Go retrieval gRPC/HTTP
    hit('http://127.0.0.1:8788/health'),           // TRACE MCP
    hit('http://127.0.0.1:8090/health'),           // TurboQuant llama-server
  ]);
  return { caddy, bifrost, goRetrieval, traceMcp, turboQuant };
}

async function ensureDevServer() {
  // Probe /api/health for a real "backend services ready" signal, not just
  // "vite compiled" — hypergraph.search needs the full SvelteKit request stack.
  const HEALTH_URL = 'http://127.0.0.1:5173/api/health';
  const READY_TIMEOUT_MS = 90_000;  // dev:everything boots Docker + TurboQuant first
  const POLL_MS = 2_000;

  async function probe() {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch { return false; }
  }

  if (await probe()) {
    log.devServer = { status: 'already-up' };
    return;
  }

  // Spawn dev:everything detached. The startup lock prevents the nested
  // startup:ace:detached inside dev:everything from re-entering this script.
  const logDir = resolve(ROOT, 'logs/task-output/pipeline-test');
  mkdirSync(logDir, { recursive: true });
  const out = openSync(resolve(logDir, 'dev-everything.out.log'), 'a');
  const err = openSync(resolve(logDir, 'dev-everything.err.log'), 'a');
  const child = spawn('npm', ['run', 'dev:everything'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, err],
    shell: process.platform === 'win32',
  });
  child.unref();
  log.devServer = { status: 'spawned', pid: child.pid, script: 'dev:everything' };
  console.log(`[startup] dev:everything spawned pid=${child.pid} → logs/task-output/pipeline-test/dev-everything.{out,err}.log`);

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    if (await probe()) {
      log.devServer.status = 'healthy';
      console.log('[startup] /api/health OK — stack ready at :5173');
      return;
    }
  }
  log.devServer.status = 'timeout';
  console.warn('[startup] /api/health did not respond within 90s — smoke P1.8 may fail');
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
      /^(sveltekit-frontend\/)?(src|scripts|docs|memory|next_steps|drizzle|package\.json|CLAUDE\.md|AGENTS\.md|LLMS\.md)/.test(f)
    );
    log.relevantCount = relevant.length;
    log.changeClass = classifyChanges(relevant);

    const hasChanges = relevant.length > 0 || FORCE;

    if (!hasChanges) {
      log.status = 'skipped';
      log.reason = 'no relevant changed files';
      console.log('[startup] incremental: no relevant changes — skipping indexing, running health checks');
    }

    // ── Indexing loop — only when files changed ───────────────────────────────
    if (hasChanges) {
      // index:codebase:fast:resume — incremental AST scan with gradient
      // checkpoint that skips unchanged files. Writes to code_relations +
      // qdrant_cluster_members, which are the exact upstream tables the
      // hypergraph seeder + atlas builder consume. Without this step, the
      // downstream seeders work against stale data after every refactor.
      //
      // Cost: ~1-3s when nothing changed (gradient checkpoint short-circuit),
      // up to ~30s when many files changed. The agents:pipeline below depends
      // on fresh code_relations data, so this MUST run first.
      runStep('codebase index resume', 'index:codebase:fast:resume', {
        required: false, timeout: 60_000,
      });

      runStep('llms pipeline dry-run', 'llms:pipeline:dry', { timeout: 180_000 });

      if (!DRY) {
        runStep('llms pipeline safe', 'llms:pipeline:safe', { timeout: 600_000 });
      }

      runStep('topology validate', 'topology:validate', { required: false, timeout: 120_000 });
      runStep('graph synthesize', 'graph:synthesize', { required: false, timeout: 240_000 });

      // atlas:index — rebuild atlas dir cards (ace:atlas:dir:*) and
      // ace:atlas:dirs index from the fresh code_relations + agent_context_files
      // data the steps above just refreshed. Adaptive (skips dirs without
      // changed files), so re-runs are cheap. Must come AFTER agents:pipeline
      // and graph:synthesize so the dir cards reflect the latest envelope +
      // synthesis state.
      runStep('atlas index rebuild', 'atlas:index', { required: false, timeout: 60_000 });

      // ace:hit-demand — refresh chunk_hit_log → Redis demand hash on every
      // folder open. Cheap (~3s), idempotent (HSET atomic replace), 1h TTL so
      // stale entries self-evict if startup misses. Reads append-only Postgres
      // table, never destructive. Empty hit-log is handled (logs "no recent
      // hits" and exits clean) so this is safe even on a cold dev machine.
      runStep('ace hit-demand refresh', 'ace:hit-demand', { required: false, timeout: 60_000 });

      // hypergraph:seed — promote qdrant_cluster_members → hypergraph_edges with
      // SOM cell + manifold4 + topo_class enrichment. Adaptive-guarded
      // (per-edge edge_hash skip when membership unchanged), so re-runs are
      // sub-second when nothing changed. Snapshots the existing edge set to
      // hypergraph:edges:archive:{day} (30d TTL) before any mutation —
      // operator can recover via scripts/restore-hypergraph-archive.mjs without
      // re-running the 20+ min AST/GPU upstream chain.
      runStep('hypergraph seed', 'hypergraph:seed', { required: false, timeout: 120_000 });

      // archive:llm — daily snapshot of every LLM-generated summary into Redis
      // hash llm:summaries:archive:{YYYY-MM-DD} (30d TTL). Same defensive
      // pattern as the hypergraph snapshot: lets the operator recover a bad
      // synthesis pass without re-running the 20+ min upstream chain.
      // Captures: codebase-todo, karpathy-gpu, agent-timeline, atlas-latest,
      //           latest synthesis run files, all screenshot captions (24h).
      // Idempotent — same-day re-runs atomically replace.
      runStep('archive llm summaries', 'archive:llm', { required: false, timeout: 60_000 });
    }

    // ── Health + smoke — always run regardless of whether files changed ───────
    // Ensures the stack is up on every folder-open, even cold starts with no
    // git changes. ensureDevServer spawns dev:everything if :5173 is cold.
    await ensureDevServer();

    // Probe ancillary services started by dev:everything and log their status.
    // Non-blocking — failures are recorded in log.services but don't abort the lane.
    log.services = await probeServices();

    // ── TurboVec ANN sidecar (fire-and-forget, :8099) ────────────────────────
    // Spawn the Python TurboVec 4-bit ANN sidecar if it's not already alive.
    // Uses a 30-min Redis cooldown so it doesn't respawn on every folder-open.
    // Feeds hyperrag:multiquery prefilter — optional, degrades gracefully if down.
    const tvCooldownKey = 'startup:turbovec-sidecar:last_spawn';
    const tvStampRaw = await redis.get(tvCooldownKey).catch(() => null);
    const tvAge = tvStampRaw ? (Date.now() - new Date(tvStampRaw).getTime()) / 60_000 : Infinity;
    let tvHealthy = false;
    try {
      const tvProbe = await fetch('http://127.0.0.1:8099/health', { signal: AbortSignal.timeout(1500) });
      tvHealthy = tvProbe.ok;
    } catch {}

    if (!tvHealthy && tvAge > 30) {
      const pyExe = 'C:\\Users\\james\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
      const sidecarScript = resolve(ROOT, 'scripts/turbovec-sidecar.py');
      const tvOut = openSync(resolve(LOG_DIR, 'turbovec-sidecar.out.log'), 'a');
      const tvErr = openSync(resolve(LOG_DIR, 'turbovec-sidecar.err.log'), 'a');
      const tvChild = spawn(pyExe, [sidecarScript], {
        cwd: ROOT,
        detached: true,
        stdio: ['ignore', tvOut, tvErr],
      });
      tvChild.unref();
      log.turbovecSidecar = { status: 'spawned', pid: tvChild.pid };
      console.log(`[startup] TurboVec sidecar spawned pid=${tvChild.pid} → logs/task-output/pipeline-test/turbovec-sidecar.{out,err}.log`);
      await redis.set(tvCooldownKey, new Date().toISOString(), 'EX', 3600).catch(() => {});
    } else if (tvHealthy) {
      log.turbovecSidecar = { status: 'already-up' };
      console.log('[startup] TurboVec sidecar already healthy on :8099');
    } else {
      log.turbovecSidecar = { status: 'cooldown', ageMin: tvAge.toFixed(1) };
    }

    const svcSummary = Object.entries(log.services)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    console.log(`[startup] services → ${svcSummary}`);

    // smoke:atlas — final regression gate. Runs the 16-check atlas-context
    // smoke: contextForFile shape + provenance, hypergraph.search returns
    // hits, /api/ace/recommendations responds, prompt cards present, etc.
    // If any earlier step in the loop silently corrupted state (e.g.,
    // empty dir cards, broken edge_hash idempotency, missing 4D fields),
    // this catches it and surfaces in the startup-latest.json log.
    //
    // Required: false so a smoke failure doesn't tank the lane — the
    // operator gets the failure recorded and can investigate via
    // logs/task-output/pipeline-test/smoke-atlas-latest.json.
    runStep('atlas smoke gate', 'smoke:atlas', { required: false, timeout: 60_000 });

    // Update Redis state and sha baseline.
    if (head !== 'unknown') await redis.set(POLICY.redisStateKeys.lastSha, head);
    await redis.hset('ace:startup:latest', {
      head,
      changedCount: String(relevant.length),
      changeClass: log.changeClass,
      status: hasChanges ? 'PASS' : 'skipped',
      mode: log.mode,
      updatedAt: new Date().toISOString(),
    });
    if (hasChanges) log.status = 'PASS';
  } finally {
    if (acquired === 'OK') await redis.del(lockKey).catch(() => {});
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
    if (lock === 'OK') await redis.del(lockKey).catch(() => {});
  }
}

async function main() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 3000,
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
  } catch (err) {
    log.status = 'skipped';
    log.reason = `redis unavailable: ${err.message}`;
    try { redis.disconnect(); } catch {}
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
