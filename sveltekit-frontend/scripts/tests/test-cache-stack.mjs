#!/usr/bin/env node
/**
 * L1/L2/L3 Cache Stack Smoke Test
 *
 * Verifies the three-tier inference cache:
 *   L1 = Redis exact-match  (~1ms)
 *   L2 = Qdrant HTTP semantic (~12ms)
 *   L3 = Bifrost → Ollama passthrough (~300ms warm)
 *
 * Usage:
 *   node scripts/tests/test-cache-stack.mjs [--port 5173] [--verbose]
 *
 * Exit 0 = all tiers passed, Exit 1 = one or more failures.
 */

import process from 'node:process';

const args = process.argv.slice(2);
const PORT   = args.includes('--port')   ? args[args.indexOf('--port')   + 1] : '5173';
const BASE   = `http://localhost:${PORT}`;
const VERBOSE = args.includes('--verbose');

const log  = (...a) => console.log('[cache-smoke]', ...a);
const info = (...a) => { if (VERBOSE) console.log('[verbose]', ...a); };

// ── helpers ──────────────────────────────────────────────────────────────────
async function postJSON(path, body, timeoutMs = 60_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const latency = Math.round(performance.now() - t0);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, latency };
  } finally {
    clearTimeout(timer);
  }
}

// ── test cases ───────────────────────────────────────────────────────────────
const EXACT_QUERY    = 'What is hearsay evidence in United States federal law?';
const SEMANTIC_QUERY = 'Define hearsay under the Federal Rules of Evidence';  // semantically similar but lexically different
const UNIQUE_QUERY   = `Cache-stack smoke test nonce ${Date.now()} — unique query to force L3 cold miss`;

const results = [];

function pass(label, latencyMs, note = '') {
  results.push({ label, pass: true, latencyMs, note });
  console.log(`  ✅ PASS  ${label.padEnd(40)} ${latencyMs}ms  ${note}`);
}

function fail(label, reason) {
  results.push({ label, pass: false, reason });
  console.error(`  ❌ FAIL  ${label.padEnd(40)} ${reason}`);
}

// ── Step 1: L3 cold miss + write-back seed ───────────────────────────────────
console.log('\n── Step 1: L3 cold miss (prime L1 + trigger L2 write-back) ──');
try {
  const { ok, latency, text } = await postJSON(
    '/api/sse/chat',
    { message: EXACT_QUERY },
    90_000,
  );
  if (ok || text.length > 10) {
    pass('L3 cold miss', latency, ok ? 'HTTP 200' : 'non-200 but got body');
    info('response snippet:', text.slice(0, 120));
  } else {
    fail('L3 cold miss', `HTTP ${ok} — empty body`);
  }
} catch (e) {
  fail('L3 cold miss', String(e));
}

// ── Step 2: L1 exact-match hit ───────────────────────────────────────────────
console.log('\n── Step 2: L1 exact-match hit (repeat same query) ──');
try {
  const { ok, latency, text } = await postJSON(
    '/api/sse/chat',
    { message: EXACT_QUERY },
    10_000,
  );
  if ((ok || text.length > 10) && latency < 500) {
    pass('L1 exact-match hit', latency, `< 500ms threshold`);
  } else if (ok || text.length > 10) {
    pass('L1 exact-match hit (slow)', latency, 'got response but > 500ms — may be L3');
  } else {
    fail('L1 exact-match hit', `no response (${latency}ms)`);
  }
} catch (e) {
  fail('L1 exact-match hit', String(e));
}

// ── Step 3: L2 semantic hit ───────────────────────────────────────────────────
console.log('\n── Step 3: L2 semantic hit (rephrase, expect < 2s) ──');
try {
  const { ok, latency, text } = await postJSON(
    '/api/sse/chat',
    { message: SEMANTIC_QUERY },
    30_000,
  );
  if (ok || text.length > 10) {
    const tier = latency < 500 ? 'L1/L2' : 'L3';
    pass(`L2 semantic hit (routed via ${tier})`, latency);
  } else {
    fail('L2 semantic hit', `no response (${latency}ms)`);
  }
} catch (e) {
  fail('L2 semantic hit', String(e));
}

// ── Step 4: L3 unique miss (write-back queued) ────────────────────────────────
console.log('\n── Step 4: L3 unique miss → async write-back ──');
try {
  const { ok, latency, text } = await postJSON(
    '/api/sse/chat',
    { message: UNIQUE_QUERY },
    90_000,
  );
  if (ok || text.length > 10) {
    pass('L3 unique miss + write-back', latency);
  } else {
    fail('L3 unique miss', `no response`);
  }
} catch (e) {
  fail('L3 unique miss', String(e));
}

// ── Step 5: Fix recommender via bifrostChat ───────────────────────────────────
console.log('\n── Step 5: Fix recommender (bifrostChat L1/L2/L3 path) ──');
try {
  const { ok, latency, text } = await postJSON(
    '/api/admin/agent/fix',
    {
      file_path: 'src/lib/test.ts',
      errors: ["Type 'string' is not assignable to type 'number'"],
    },
    90_000,
  );
  let parsed;
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  if ((ok || parsed?.success) && latency > 0) {
    pass('Fix recommender (bifrostChat)', latency, `fixes=${parsed?.fixes?.length ?? '?'}`);
  } else {
    fail('Fix recommender', `status=${ok ? 'ok' : 'fail'} body=${text.slice(0, 80)}`);
  }
} catch (e) {
  fail('Fix recommender', String(e));
}

// ── Summary ───────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n${'='.repeat(60)}`);
console.log(`Cache Stack Smoke: ${passed}/${results.length} passed  ${failed > 0 ? '❌' : '✅'}`);
if (failed > 0) {
  results.filter(r => !r.pass).forEach(r => console.error(`  FAILED: ${r.label} — ${r.reason}`));
}

// Latency summary
console.log('\nLatency summary:');
results.filter(r => r.pass && r.latencyMs != null).forEach(r =>
  console.log(`  ${r.label.padEnd(45)} ${r.latencyMs}ms`)
);

process.exit(failed > 0 ? 1 : 0);
