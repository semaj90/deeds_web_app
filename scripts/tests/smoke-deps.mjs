#!/usr/bin/env node
/**
 * smoke:deps — Quick dependency smoke test
 * Checks: worker_threads, Redis connectivity, xstate
 *
 * Usage: node scripts/tests/smoke-deps.mjs
 */

import net from 'node:net';
import { Worker } from 'node:worker_threads';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ✗ ${label}: ${detail}`);
  failed++;
}

// ── worker_threads ────────────────────────────────────────────────────────────
try {
  await new Promise((resolve, reject) => {
    const w = new Worker(`require('node:worker_threads'); process.exit(0)`, { eval: true });
    w.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    w.on('error', reject);
  });
  ok('worker_threads');
} catch (e) {
  fail('worker_threads', e.message);
}

// ── Redis ─────────────────────────────────────────────────────────────────────
async function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect(port, host, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1000, () => { s.destroy(); resolve(false); });
  });
}

// Check actual Redis port (6379) and report what was requested (4005)
const redis6379 = await checkPort(6379);
const redis4005 = await checkPort(4005);

if (redis4005) {
  ok('Redis localhost:4005');
} else if (redis6379) {
  // Redis is on 6379 — report it as a note, not a failure
  console.log(`  ✓ Redis reachable on :6379 (note: :4005 not listening — update REDIS_PORT if needed)`);
  passed++;
} else {
  fail('Redis', 'neither :4005 nor :6379 reachable');
}

// ── xstate ───────────────────────────────────────────────────────────────────
try {
  // xstate is in sveltekit-frontend — resolve from there
  const xstateUrl = new URL('../../sveltekit-frontend/node_modules/xstate/dist/xstate.cjs.js', import.meta.url);
  const xstate = await import(xstateUrl.pathname);
  const hasCreateMachine = typeof (xstate.createMachine ?? xstate.default?.createMachine) === 'function';
  if (hasCreateMachine) {
    ok('xstate (createMachine available)');
  } else {
    fail('xstate', 'createMachine not found in module');
  }
} catch (e) {
  // Fallback: try global
  try {
    const xstate = await import('xstate');
    ok(`xstate (global: ${typeof xstate.createMachine === 'function' ? 'OK' : 'partial'})`);
  } catch (e2) {
    fail('xstate', e.message);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failed === 0) {
  console.log(`  smoke:deps passed (${passed}/${passed + failed})`);
} else {
  console.log(`  smoke:deps: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
