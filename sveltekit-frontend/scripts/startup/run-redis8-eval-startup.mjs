#!/usr/bin/env node
/**
 * run-redis8-eval-startup.mjs
 *
 * Opt-in startup wrapper for the isolated Redis 8 eval lane.
 * Brings the compose stack up, then smokes Redis/API/MCP.
 *
 * This is eval-only and must not replace the primary Redis 7 app stack.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const LOG_DIR = resolve(ROOT, 'logs/task-output/pipeline-test');
const LOG_FILE = resolve(LOG_DIR, 'startup-redis8-eval.log');
const TMP_DIR = resolve(ROOT, '.tmp');
const STATUS_FILE = resolve(TMP_DIR, 'redis8-eval-startup-status.json');
const SMOKE_SCRIPT = resolve(ROOT, 'scripts/smoke-redis8-eval.mjs');
const COMPOSE_FILE = 'docker/docker-compose.redis8-eval.yml';

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(LOG_FILE, '', 'utf8');

const args = process.argv.slice(2);

const report = {
  status: 'running',
  startedAt: new Date().toISOString(),
  composeFile: COMPOSE_FILE,
  smokeScript: 'scripts/smoke-redis8-eval.mjs',
  compose: null,
  smoke: null,
};

function log(line = '') {
  appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    // Detached/background startup can lack a writable console.
  }
}

function writeStatus() {
  writeFileSync(STATUS_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function runStep(label, command, stepArgs, options = {}) {
  log(`[redis8-eval] ${label}: ${command} ${stepArgs.join(' ')}`);
  const startedAt = Date.now();
  const result = spawnSync(command, stepArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    timeout: options.timeoutMs ?? 120_000,
  });

  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim();
  if (stdout) log(stdout);
  if (stderr) log(stderr);

  const payload = {
    status: result.status,
    signal: result.signal ?? null,
    ms: Date.now() - startedAt,
    stdoutTail: stdout.slice(-2000),
    stderrTail: stderr.slice(-2000),
  };

  if (result.error) {
    payload.error = result.error.message;
  }

  report[label] = payload;
  writeStatus();

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
  return payload;
}

try {
  log('[redis8-eval] Starting isolated Redis 8 eval lane');
  log('[redis8-eval] Eval-only lane; Redis 7 app stack remains unchanged');

  runStep('compose', 'docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d'], {
    timeoutMs: 180_000,
  });

  const smokeArgs = [SMOKE_SCRIPT, ...args];
  runStep('smoke', process.execPath, smokeArgs, {
    timeoutMs: 120_000,
  });

  report.status = 'pass';
  report.finishedAt = new Date().toISOString();
  writeStatus();
  log('[redis8-eval] Redis 8 eval lane is up and smoke-passed');
} catch (error) {
  report.status = 'fail';
  report.finishedAt = new Date().toISOString();
  report.error = error?.message ?? String(error);
  writeStatus();
  log(`[redis8-eval] FAILED: ${report.error}`);
  process.exitCode = 1;
}
