#!/usr/bin/env node
/**
 * Phase 7 Gemma4 worker cluster launcher.
 *
 * Spawns 1-4 copies of the existing RabbitMQ phase7 worker so the queue can
 * be processed in parallel without changing the worker implementation.
 *
 * Default behavior is intentionally conservative:
 * - 2 workers by default
 * - LLM_CONCURRENCY defaults to 1 per worker
 * - GEMMA4_TIMEOUT_MS defaults to 120000 so the live 8090 backend does not
 *   self-cancel before the observed ~65s completion time
 *
 * Usage:
 *   node scripts/atlas/phase7-gemma4-worker-cluster.mjs
 *   node scripts/atlas/phase7-gemma4-worker-cluster.mjs 4
 *   PHASE7_WORKERS=4 node scripts/atlas/phase7-gemma4-worker-cluster.mjs
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const WORKER_SCRIPT = path.join(FRONTEND, 'scripts', 'atlas', 'phase7-gemma4-worker-patched.mts');
const NPM_EXECUTABLE = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const SPAWN_COMMAND = process.platform === 'win32' ? 'cmd.exe' : NPM_EXECUTABLE;

const requestedWorkers = Number(process.argv[2] || process.env.PHASE7_WORKERS || process.env.WORKER_COUNT || 2);
const WORKER_COUNT = Math.max(1, Math.min(Number.isFinite(requestedWorkers) ? Math.floor(requestedWorkers) : 2, 4));
const PER_WORKER_CONCURRENCY = Number(process.env.PHASE7_WORKER_LLM_CONCURRENCY || process.env.LLM_CONCURRENCY || 1);
const GEMMA4_TIMEOUT_MS = Number(process.env.GEMMA4_TIMEOUT_MS || 120000);
const WORKER_BOOT_DELAY_MS = Number(process.env.PHASE7_WORKER_BOOT_DELAY_MS || 0);

const workers = Array.from({ length: WORKER_COUNT }, () => null);
let shuttingDown = false;

function spawnWorker(index) {
  const workerId = index + 1;
  const launchArgs = process.platform === 'win32'
    ? ['/c', NPM_EXECUTABLE, 'tsx', WORKER_SCRIPT]
    : ['tsx', WORKER_SCRIPT];
  const proc = spawn(SPAWN_COMMAND, launchArgs, {
    cwd: FRONTEND,
    env: {
      ...process.env,
      PHASE7_WORKER_ID: String(workerId),
      PHASE7_WORKER_COUNT: String(WORKER_COUNT),
      LLM_CONCURRENCY: String(PER_WORKER_CONCURRENCY),
      GEMMA4_TIMEOUT_MS: String(GEMMA4_TIMEOUT_MS),
    },
    stdio: 'inherit',
    shell: false,
  });

  workers[index] = proc;
  console.log(
    `[phase7-cluster] started worker ${workerId}/${WORKER_COUNT}` +
      ` pid=${proc.pid} concurrency=${PER_WORKER_CONCURRENCY} timeout=${GEMMA4_TIMEOUT_MS}ms`
  );

  proc.on('exit', (code, signal) => {
    workers[index] = null;
    if (shuttingDown) return;
    console.error(
      `[phase7-cluster] worker ${workerId} exited (${signal ?? code ?? 'unknown'})` +
        `; restarting in 2s`
    );
    setTimeout(() => {
      if (!shuttingDown) spawnWorker(index);
    }, 2000);
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[phase7-cluster] received ${signal}; stopping ${WORKER_COUNT} workers...`);
  for (const proc of workers) {
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(0), 2000);
}

console.log(
  `[phase7-cluster] launching ${WORKER_COUNT} phase7 workers in ${FRONTEND}` +
    ` (per-worker LLM_CONCURRENCY=${PER_WORKER_CONCURRENCY}, GEMMA4_TIMEOUT_MS=${GEMMA4_TIMEOUT_MS})`
);
if (WORKER_BOOT_DELAY_MS > 0) {
  console.log(`[phase7-cluster] boot delay ${WORKER_BOOT_DELAY_MS}ms between workers`);
}

for (let i = 0; i < WORKER_COUNT; i++) {
  const delay = i * WORKER_BOOT_DELAY_MS;
  setTimeout(() => spawnWorker(i), delay);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
