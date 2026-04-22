#!/usr/bin/env node
/**
 * L1/L2/L3 Cache Stack Benchmark
 *
 * Measures per-tier latency, hit rate, and token throughput.
 * Runs N round-trips across a set of queries to build stable statistics.
 *
 * Usage:
 *   node scripts/tests/test-cache-benchmark.mjs [--rounds 5] [--port 5173] [--verbose]
 *
 * Output metrics:
 *   - L1 hit rate + avg latency
 *   - L2 hit rate + avg latency
 *   - L3 (miss) avg latency
 *   - Overall tokens/sec (estimated from response length ÷ L3 latency)
 *   - Cache hit rate % across all surfaces
 */

import process from 'node:process';

const args    = process.argv.slice(2);
const PORT    = args.includes('--port')   ? args[args.indexOf('--port')   + 1] : '5173';
const ROUNDS  = args.includes('--rounds') ? Number(args[args.indexOf('--rounds') + 1]) : 5;
const BASE    = `http://localhost:${PORT}`;
const VERBOSE = args.includes('--verbose');

const log  = (...a) => console.log('[benchmark]', ...a);

// Query set — mix of exact repeats and semantic variants
const QUERY_SET = [
  'What is hearsay evidence in United States federal law?',
  'Define hearsay under the Federal Rules of Evidence',
  'Explain the hearsay rule and its exceptions',
  'How is chain of custody established for physical evidence?',
  'What are the elements of reasonable doubt in criminal law?',
  'Define beyond reasonable doubt as a standard of proof',
  'What constitutes a Brady violation in criminal procedure?',
  'How does a prosecutor fulfill Brady disclosure obligations?',
];

async function postChat(message, timeoutMs = 60_000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0    = performance.now();
  try {
    const res = await fetch(`${BASE}/api/sse/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: ctrl.signal,
    });
    const text    = await res.text();
    const latency = Math.round(performance.now() - t0);
    return { ok: res.ok || text.length > 10, latency, chars: text.length };
  } catch (e) {
    return { ok: false, latency: Math.round(performance.now() - t0), chars: 0, error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Warm-up: prime L1 for all queries ────────────────────────────────────────
log(`Warming up with ${QUERY_SET.length} queries (L3 cold miss pass)...`);
const warmup = [];
for (const q of QUERY_SET) {
  const r = await postChat(q, 90_000);
  warmup.push(r);
  if (VERBOSE) log(`  warm: ${q.slice(0, 50).padEnd(50)} ${r.latency}ms ${r.ok ? '✓' : '✗'}`);
}
log(`Warm-up done. Avg L3 latency: ${Math.round(warmup.reduce((s,r) => s + r.latency, 0) / warmup.length)}ms`);

// ── Benchmark rounds ──────────────────────────────────────────────────────────
log(`\nRunning ${ROUNDS} benchmark rounds across ${QUERY_SET.length} queries...`);

const allLatencies   = [];
const l1Latencies    = [];  // < 50ms  (Redis exact)
const l2Latencies    = [];  // 50–500ms (Qdrant semantic)
const l3Latencies    = [];  // > 500ms  (Bifrost → Ollama)
let   totalChars     = 0;
let   totalRequests  = 0;

for (let round = 1; round <= ROUNDS; round++) {
  if (VERBOSE) log(`\n  Round ${round}/${ROUNDS}`);
  for (const q of QUERY_SET) {
    const r = await postChat(q, 60_000);
    totalRequests++;
    if (!r.ok) continue;
    allLatencies.push(r.latency);
    totalChars += r.chars;
    if (r.latency < 50)        l1Latencies.push(r.latency);
    else if (r.latency < 500)  l2Latencies.push(r.latency);
    else                       l3Latencies.push(r.latency);
    if (VERBOSE) log(`    ${q.slice(0, 45).padEnd(45)} ${r.latency}ms (${r.latency < 50 ? 'L1' : r.latency < 500 ? 'L2' : 'L3'})`);
  }
}

// ── Statistics ────────────────────────────────────────────────────────────────
const avg    = arr => arr.length ? Math.round(arr.reduce((s,v) => s+v, 0) / arr.length) : 'N/A';
const p95    = arr => {
  if (!arr.length) return 'N/A';
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.floor(s.length * 0.95)] ?? s[s.length - 1];
};

const totalHits = l1Latencies.length + l2Latencies.length;
const hitRate   = allLatencies.length
  ? Math.round((totalHits / allLatencies.length) * 100)
  : 0;

// Approximate tokens/sec: assume avg ~4 chars/token, measured over L3 latency
const avgL3    = avg(l3Latencies);
const estTps   = l3Latencies.length && typeof avgL3 === 'number'
  ? Math.round((totalChars / l3Latencies.length / 4) / (avgL3 / 1000))
  : 'N/A';

console.log('\n' + '='.repeat(64));
console.log('BENCHMARK RESULTS');
console.log('='.repeat(64));
console.log(`Queries run:        ${totalRequests}`);
console.log(`Successful:         ${allLatencies.length}`);
console.log(`Cache hit rate:     ${hitRate}%  (L1: ${l1Latencies.length}  L2: ${l2Latencies.length}  L3: ${l3Latencies.length})`);
console.log('');
console.log(`L1 (Redis exact)`);
console.log(`  count:  ${l1Latencies.length}  avg: ${avg(l1Latencies)}ms  p95: ${p95(l1Latencies)}ms`);
console.log('');
console.log(`L2 (Qdrant semantic)`);
console.log(`  count:  ${l2Latencies.length}  avg: ${avg(l2Latencies)}ms  p95: ${p95(l2Latencies)}ms`);
console.log('');
console.log(`L3 (Bifrost → Ollama)`);
console.log(`  count:  ${l3Latencies.length}  avg: ${avg(l3Latencies)}ms  p95: ${p95(l3Latencies)}ms`);
console.log('');
console.log(`Est. tokens/sec:    ${estTps}`);
console.log(`Overall avg:        ${avg(allLatencies)}ms`);
console.log(`Overall p95:        ${p95(allLatencies)}ms`);
console.log('='.repeat(64));

process.exit(0);
