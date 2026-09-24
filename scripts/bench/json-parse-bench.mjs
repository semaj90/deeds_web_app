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
 *   node scripts/bench/json-parse-bench.mjs --corpus docs/reports/receipt.json --corpus docs/reports/trace.jsonl
 *   Metadata mode is read-only, accepts only docs/reports JSON/JSONL/NDJSON,
 *   requires native parity, and never replaces semantic schema validation.
 */

import { createRequire } from 'module';
import { resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'util';

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

const args = process.argv.slice(2);
const iters = parseInt(args[args.indexOf('--iters') + 1] || '0') || 200;
const corpusPaths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--corpus' && args[i + 1]) corpusPaths.push(resolve(ROOT, args[++i]));
}
const outputArg = args.indexOf('--output');
const outputPath = outputArg >= 0 && args[outputArg + 1]
  ? resolve(ROOT, args[outputArg + 1])
  : resolve(ROOT, '.tmp', 'json-parse-bench.json');

let inputFiles = [];
let benchmarkPayloads = Object.entries(PAYLOADS);
if (corpusPaths.length) {
  benchmarkPayloads = [];
  for (const file of corpusPaths) {
    const reportsRoot = `${resolve(ROOT, 'docs', 'reports')}${sep}`.toLowerCase();
    const extension = file.toLowerCase();
    if (!extension.startsWith(reportsRoot) || !/\.(json|jsonl|ndjson)$/.test(extension)) {
      throw new Error(`SIMDJSON_METADATA_CORPUS_ONLY:${file}`);
    }
    const text = await fs.readFile(file, 'utf8');
    const records = extension.endsWith('.jsonl') || extension.endsWith('.ndjson')
      ? text.split(/\r?\n/).filter((line) => line.trim().length > 0)
      : [text];
    if (!records.length) throw new Error(`SIMDJSON_EMPTY_METADATA_CORPUS:${file}`);
    const baselineValues = records.map((record) => JSON.parse(record));
    if (!nativeAddon) throw new Error('SIMDJSON_NATIVE_UNAVAILABLE: metadata benchmark requires the native addon');
    for (let i = 0; i < records.length; i++) {
      const nativeValue = JSON.parse(nativeAddon.simdJsonParse(records[i]));
      if (!isDeepStrictEqual(nativeValue, baselineValues[i])) {
        throw new Error(`SIMDJSON_SEMANTIC_PARITY_FAILED:${file}:${i + 1}`);
      }
      benchmarkPayloads.push([`${file}:${i + 1}`, records[i]]);
    }
    inputFiles.push({
      path: file.startsWith(ROOT) ? file.slice(ROOT.length + 1).replaceAll('\\', '/') : file,
      bytes: Buffer.byteLength(text, 'utf8'),
      records: records.length,
      sha256: createHash('sha256').update(text).digest('hex'),
    });
  }
}

console.log('\n══ JSON Parse Benchmark ══════════════════════════════════════');
console.log(`  native addon : ${nativeAddon ? '✅ loaded (simdjson SIMD/CPU)' : '❌ not available — JSON.parse only'}`);
console.log(`  iterations   : ${iters} per variant`);
console.log(`  corpus mode  : ${corpusPaths.length ? 'metadata corpus (native parity required)' : 'synthetic baseline only'}`);

const rows = [];

for (const [size, payload] of benchmarkPayloads) {
  const bytes = payload.length;
  const v8ms    = bench('v8',  () => JSON.parse(payload), iters);
  const fastms  = bench('fast',() => fastJsonParse(payload), iters);
  const speedup = v8ms / fastms;

  rows.push({
    size,
    bytes,
    v8ms,
    fastms,
    speedup,
    nativeUsedInFastPath: !!nativeAddon && payload.length >= 1024,
    nativeParity: corpusPaths.length ? 'PASS' : 'NOT_RUN',
  });

  const tag = speedup > 1.1 ? '🚀' : speedup > 0.9 ? '≈' : '⚠️ slower';
  if (!corpusPaths.length) {
    console.log(`\n  [${size.padEnd(6)}] ${bytes.toLocaleString()} bytes`);
    console.log(`    JSON.parse   : ${v8ms.toFixed(4)} ms/iter`);
    console.log(`    fastJsonParse: ${fastms.toFixed(4)} ms/iter   ${tag} ${speedup.toFixed(2)}×`);
  }
}

const corpusSummaries = inputFiles.map((input) => {
  const absolutePath = resolve(ROOT, input.path);
  const samples = rows.filter((row) => row.size === absolutePath || row.size.startsWith(`${absolutePath}:`));
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  return {
    path: input.path,
    bytes: input.bytes,
    records: input.records,
    sha256: input.sha256,
    nativeDirectParity: 'PASS',
    fastPathNativeCalls: samples.filter((row) => row.nativeUsedInFastPath).length,
    fastPathV8Bypasses: samples.filter((row) => !row.nativeUsedInFastPath).length,
    medianV8Ms: median(samples.map((row) => row.v8ms)),
    medianFastPathMs: median(samples.map((row) => row.fastms)),
    medianSpeedup: median(samples.map((row) => row.speedup)),
  };
});

// Summary
console.log('\n── Summary ───────────────────────────────────────────────────');
if (corpusPaths.length) {
  for (const summary of corpusSummaries) {
    console.log(`  ${summary.path}: ${summary.records} records; native parity ${summary.nativeDirectParity}; fast-path native ${summary.fastPathNativeCalls}, V8 bypass ${summary.fastPathV8Bypasses}; median speedup ${summary.medianSpeedup?.toFixed(2) ?? 'n/a'}×`);
  }
} else {
  for (const r of rows) {
    const note = r.bytes < 1024 ? ' (below 1KB threshold — native bypassed by design)' : '';
    console.log(`  ${r.size.padEnd(6)} ${r.speedup.toFixed(2)}×  (${r.v8ms.toFixed(4)}ms v8 → ${r.fastms.toFixed(4)}ms fast)${note}`);
  }
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
  mode: corpusPaths.length ? 'METADATA_JSON_OR_JSONL_READ_ONLY_BENCHMARK' : 'SYNTHETIC_JSON_BENCHMARK',
  inputs: corpusSummaries,
  semanticSchemaOwnerChanged: false,
  semanticSchemaValidation: 'NOT_REPLACED_OR_BYPASSED; benchmark measures parser parity only',
  nativeParity: corpusPaths.length ? 'PASS' : 'NOT_RUN',
  rows: corpusPaths.length ? corpusSummaries : rows,
  note: 'simdjson uses CPU SIMD (AVX2/SSE4.2), not GPU/CUDA',
};
await fs.mkdir(dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(`\n  ✅ report → ${outputPath}`);
console.log('══════════════════════════════════════════════════════════════\n');
