#!/usr/bin/env node
/**
 * json-parse-bench.mjs
 *
 * Benchmarks fastJsonParse (simdjson SIMD/native, CPU not GPU) vs V8 JSON.parse
 * across three payload sizes: small (~100B), medium (~5KB), large (~50KB).
 *
 * Reports:
 *   - parse latency (ms) per method
 *   - speedup ratio
 *   - whether native addon is available
 *   - whether LRU cache is active
 *
 * Usage:
 *   node scripts/bench/json-parse-bench.mjs
 *   node scripts/bench/json-parse-bench.mjs --iters 500
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import fs from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ── Load simdjson-bridge (replicate logic from simdjson-bridge.ts) ────────────
const esmRequire = createRequire(import.meta.url);
let nativeAddon = null;
const addonPaths = [
  resolve(ROOT, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge', 'cpp', 'build', 'tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge', 'build', 'Release', 'tensorrt_bridge.node'),
];
for (const p of addonPaths) {
  if (!existsSync(p)) continue;
  try {
    const mod = esmRequire(p);
    if (typeof mod.simdJsonParse === 'function') { nativeAddon = mod; break; }
  } catch { /* try next */ }
}

function fastJsonParse(text) {
  if (nativeAddon && text.length >= 1024) {
    try { return JSON.parse(nativeAddon.simdJsonParse(text)); } catch { /* fall through */ }
  }
  return JSON.parse(text);
}

// ── Build test payloads ────────────────────────────────────────────────────────
function makePayload(sizeHint) {
  const items = [];
  const target = sizeHint;
  while (JSON.stringify(items).length < target) {
    items.push({
      id: Math.random().toString(36).slice(2),
      score: Math.random(),
      payload: {
        text: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt',
        source: `src/lib/server/vector/${Math.random().toString(36).slice(2)}.ts`,
        tags: ['retrieval', 'qdrant', 'ace'],
        cluster_id: `cluster_${Math.floor(Math.random() * 20)}`,
        updated_at: Date.now(),
      },
    });
  }
  return JSON.stringify({ result: items });
}

const PAYLOADS = {
  small:  makePayload(100),
  medium: makePayload(5_000),
  large:  makePayload(50_000),
};

// ── Bench loop ─────────────────────────────────────────────────────────────────
function bench(label, fn, iters) {
  // Warmup
  for (let i = 0; i < 5; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t0) / iters;
}

const args  = process.argv.slice(2);
const iters = parseInt(args[args.indexOf('--iters') + 1] || '0') || 200;

console.log('\n══ JSON Parse Benchmark ══════════════════════════════════════');
console.log(`  native addon : ${nativeAddon ? '✅ loaded (simdjson SIMD/CPU)' : '❌ not available — JSON.parse only'}`);
console.log(`  iterations   : ${iters} per variant`);

const rows = [];

for (const [size, payload] of Object.entries(PAYLOADS)) {
  const bytes = payload.length;
  const v8ms    = bench('v8',  () => JSON.parse(payload), iters);
  const fastms  = bench('fast',() => fastJsonParse(payload), iters);
  const speedup = v8ms / fastms;

  rows.push({ size, bytes, v8ms, fastms, speedup });

  const tag = speedup > 1.1 ? '🚀' : speedup > 0.9 ? '≈' : '⚠️ slower';
  console.log(`\n  [${size.padEnd(6)}] ${bytes.toLocaleString()} bytes`);
  console.log(`    JSON.parse   : ${v8ms.toFixed(4)} ms/iter`);
  console.log(`    fastJsonParse: ${fastms.toFixed(4)} ms/iter   ${tag} ${speedup.toFixed(2)}×`);
}

// Summary
console.log('\n── Summary ───────────────────────────────────────────────────');
for (const r of rows) {
  const note = r.bytes < 1024 ? ' (below 1KB threshold — native bypassed by design)' : '';
  console.log(`  ${r.size.padEnd(6)} ${r.speedup.toFixed(2)}×  (${r.v8ms.toFixed(4)}ms v8 → ${r.fastms.toFixed(4)}ms fast)${note}`);
}

if (!nativeAddon) {
  console.log('\n  ⚠️  Native addon not loaded — add LibTorch/CUDA DLLs to PATH to enable SIMD acceleration');
  console.log('     DLL path: C:\\libtorch-win-shared-with-deps-2.9.0+cu130\\libtorch\\lib');
}

// Write report
const report = {
  generatedAt: new Date().toISOString(),
  nativeAddon: !!nativeAddon,
  iters,
  rows,
  note: 'simdjson uses CPU SIMD (AVX2/SSE4.2), not GPU/CUDA',
};
await fs.mkdir(resolve(ROOT, '.tmp'), { recursive: true });
const outPath = resolve(ROOT, '.tmp', 'json-parse-bench.json');
await fs.writeFile(outPath, JSON.stringify(report, null, 2));
console.log(`\n  ✅ report → ${outPath}`);
console.log('══════════════════════════════════════════════════════════════\n');