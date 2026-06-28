#!/usr/bin/env node
/**
 * ensure-nats-langgraph.mjs
 *
 * Startup guard for the LangGraph NATS Worker VS Code task.
 * 1. Checks Docker Desktop is running
 * 2. Starts legal-ai-nats container if not already running
 * 3. Pings NATS monitoring endpoint (:8222/healthz) until ready
 * 4. Spawns scripts/agent-worker.ts via npx tsx (detached)
 *
 * Exits 0 if worker launched. Exits 1 if NATS never became ready (non-fatal
 * for folderOpen — VS Code ignores the exit code on background tasks).
 */

import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SF_ROOT = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(SF_ROOT, '..');
const COMPOSE_FILE = path.join(ROOT, 'docker-compose.yml');
const COMPOSE_PROJECT_NAME = 'deeds-web-app';

const NATS_CONTAINER = 'legal-ai-nats';
const NATS_HEALTH_URL = 'http://127.0.0.1:8222/healthz';
const NATS_CLIENT_PORT = 4222;
const MAX_WAIT_MS = 30_000;
const POLL_MS = 1_000;

const DRY = process.argv.includes('--dry');
const AUDIT = process.argv.includes('--audit');

function log(msg) { console.log(`[nats-guard] ${msg}`); }
function warn(msg) { console.warn(`[nats-guard] WARN ${msg}`); }

// ── Docker helpers (same pattern as ensure-docker-gpu-stack.mjs) ───────────

function dockerInfoHealthy() {
  const r = spawnSync('docker', ['info'], { stdio: 'pipe', timeout: 8_000, encoding: 'utf8' });
  return r.status === 0;
}

function inspectContainerState(container) {
  const r = spawnSync('docker', ['inspect', '-f', '{{.State.Status}}', container], {
    stdio: 'pipe', timeout: 5_000, encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  return r.stdout.trim() || 'unknown';
}

function startContainer(container) {
  log(`Starting ${container}...`);
  if (DRY) { log('(dry-run, skipping)'); return; }
  const r = spawnSync('docker', ['start', container], {
    stdio: 'inherit', timeout: 30_000,
  });
  if (r.status !== 0) throw new Error(`docker start ${container} failed`);
}

function composeNats() {
  log('Creating NATS container via docker compose --profile full ...');
  if (DRY) { log('(dry-run, skipping)'); return; }
  // NATS is under --profile full; we bring up only the nats service
  const r = spawnSync('docker', [
    'compose', '-p', COMPOSE_PROJECT_NAME, '-f', COMPOSE_FILE, '--profile', 'full', 'up', '-d', 'nats',
  ], { stdio: 'inherit', timeout: 120_000, cwd: ROOT, env: process.env });
  if (r.status !== 0) throw new Error('docker compose up nats failed');
}

// ── NATS health ping ───────────────────────────────────────────────────────

async function pingNatsHttp(url, timeoutMs = 3_000) {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForNats(maxMs = MAX_WAIT_MS) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await pingNatsHttp(NATS_HEALTH_URL)) return true;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  return false;
}

// ── Worker launch ──────────────────────────────────────────────────────────

function launchWorker() {
  log('Launching LangGraph NATS Worker (detached)...');
  if (DRY) { log('(dry-run, skipping)'); return; }
  const child = spawn(
    'npx',
    ['tsx', 'scripts/agent-worker.ts'],
    {
      cwd: SF_ROOT,
      detached: true,
      stdio: 'ignore',
      shell: true,
      env: { ...process.env },
    }
  );
  child.unref();
  log(`Worker spawned (pid ${child.pid ?? 'unknown'})`);
}

// ── Main ───────────────────────────────────────────────────────────────────

if (AUDIT) {
  const state = inspectContainerState(NATS_CONTAINER);
  const healthy = await pingNatsHttp(NATS_HEALTH_URL, 2_000);
  log(`${NATS_CONTAINER}: ${state ?? 'missing'} | HTTP health: ${healthy ? '✅' : '❌'}`);
  process.exit(0);
}

// 1 — Docker Desktop must be running
if (!dockerInfoHealthy()) {
  warn('Docker Desktop is not running — skipping NATS + worker startup');
  process.exit(1);
}

// 2 — Check if NATS is already reachable (native process or existing container)
const alreadyHealthy = await pingNatsHttp(NATS_HEALTH_URL, 2_000);
if (alreadyHealthy) {
  log('NATS already reachable at :8222 — skipping container start');
} else {
  // Ensure NATS container is running
  const state = inspectContainerState(NATS_CONTAINER);
  if (state === 'running') {
    log(`${NATS_CONTAINER} already running`);
  } else if (state) {
    // container exists but is stopped/exited
    startContainer(NATS_CONTAINER);
  } else {
    // container doesn't exist yet — create via compose
    composeNats();
  }
}

// 3 — Wait for NATS monitoring endpoint
log(`Waiting for NATS health at ${NATS_HEALTH_URL} (up to ${MAX_WAIT_MS / 1000}s)...`);
const ready = await waitForNats(MAX_WAIT_MS);
if (!ready) {
  warn(`NATS did not become ready within ${MAX_WAIT_MS / 1000}s — worker not started`);
  warn('Run manually: npx tsx sveltekit-frontend/scripts/agent-worker.ts');
  process.exit(1);
}
log('NATS is healthy ✅');

// 4 — Launch the worker
launchWorker();
log('Done.');
process.exit(0);
