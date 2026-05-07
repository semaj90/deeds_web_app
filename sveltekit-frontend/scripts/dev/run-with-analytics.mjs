#!/usr/bin/env node
/**
 * run-with-analytics.mjs
 *
 * Wraps a child_process.spawn call, captures stdout/stderr,
 * writes a PipelineEvent to memory/runs/<run_id>/events.jsonl,
 * and optionally streams to a Redis xadd pipeline when Redis is available.
 *
 * Usage:
 *   node scripts/dev/run-with-analytics.mjs -- npm run graphify:daily
 *   node scripts/dev/run-with-analytics.mjs --kind=test_run -- npx vitest run tests/foo.spec.ts
 *   node scripts/dev/run-with-analytics.mjs --kind=docker_cmd -- docker ps
 *
 * Flags:
 *   --kind=<kind>   PipelineEventKind (default: npm_script)
 *   --label=<str>   Human label (default: first cmd arg)
 *   --quiet         Suppress forwarded stdout
 *   --no-redis      Skip Redis even if available
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const MEMORY_RUNS = resolve(ROOT, 'memory/runs');

const argv = process.argv.slice(2);
const dashIdx = argv.indexOf('--');
const flags = dashIdx === -1 ? argv : argv.slice(0, dashIdx);
const cmdArgs = dashIdx === -1 ? [] : argv.slice(dashIdx + 1);

function flag(name) {
  const f = flags.find((a) => a.startsWith(`--${name}=`));
  return f ? f.slice(name.length + 3) : null;
}
const kind = flag('kind') ?? 'npm_script';
const labelOverride = flag('label');
const quiet = flags.includes('--quiet');
const noRedis = flags.includes('--no-redis');

if (!cmdArgs.length) {
  console.error('[run-with-analytics] No command provided after --');
  process.exit(1);
}

const [bin, ...args] = cmdArgs;
const label = labelOverride ?? cmdArgs.join(' ').slice(0, 80);
const ts = new Date().toISOString();
const runId = ts.replace(/[:.]/g, '-').slice(0, 19);
const runDir = resolve(MEMORY_RUNS, runId);
mkdirSync(runDir, { recursive: true });

const TAIL_BYTES = 2048;
let stdoutBuf = '';
let stderrBuf = '';
const t0 = Date.now();

function appendTail(buf, chunk) {
  const updated = buf + chunk;
  return updated.length > TAIL_BYTES ? updated.slice(-TAIL_BYTES) : updated;
}

const child = spawn(bin, args, {
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout.on('data', (d) => {
  const s = d.toString();
  stdoutBuf = appendTail(stdoutBuf, s);
  if (!quiet) process.stdout.write(s);
});

child.stderr.on('data', (d) => {
  const s = d.toString();
  stderrBuf = appendTail(stderrBuf, s);
  process.stderr.write(s);
});

child.on('close', async (exitCode) => {
  const durationMs = Date.now() - t0;
  /** @type {import('../../src/lib/server/analytics/event-logger.js').PipelineEvent} */
  const event = {
    ts,
    kind,
    cmd: cmdArgs.join(' '),
    exitCode,
    durationMs,
    stdoutTail: stdoutBuf.slice(-512),
    stderrTail: stderrBuf.slice(-256) || undefined,
    metadata: { label, runId },
  };

  // Write to events.jsonl in this run directory
  const eventsPath = join(runDir, 'events.jsonl');
  writeFileSync(eventsPath, JSON.stringify(event) + '\n', 'utf-8');

  // Also append to a rolling log shared across runs (last 200 events)
  const rollingPath = resolve(MEMORY_RUNS, '../pipeline-events.jsonl');
  try {
    let existing = '';
    try { existing = readFileSync(rollingPath, 'utf-8'); } catch { /* ok */ }
    const lines = existing.split('\n').filter(Boolean);
    lines.push(JSON.stringify(event));
    writeFileSync(rollingPath, lines.slice(-200).join('\n') + '\n', 'utf-8');
  } catch { /* non-fatal */ }

  // Stream to Redis xadd if available
  if (!noRedis) {
    try {
      const { createClient } = await import('redis');
      const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
      const client = createClient({ url: redisUrl });
      client.on('error', () => {});
      await client.connect().catch(() => {});
      if (client.isReady) {
        await client.xAdd('pipeline:events', '*', {
          ts: event.ts,
          kind: event.kind,
          cmd: event.cmd.slice(0, 200),
          exitCode: String(exitCode),
          durationMs: String(durationMs),
          label,
        }).catch(() => {});
        await client.quit().catch(() => {});
      }
    } catch { /* Redis not available — silent */ }
  }

  if (!quiet) {
    const status = exitCode === 0 ? '✓' : `✗ (exit ${exitCode})`;
    console.error(`\n[run-with-analytics] ${status} ${label} in ${durationMs}ms → ${eventsPath}`);
  }

  process.exit(exitCode ?? 0);
});
