#!/usr/bin/env node
/**
 * smoke-gpu-hardening.mjs
 *
 * GPU safety smoke tests — verifies clusterEmbeddings and graphSimilarity
 * produce valid (non-NaN) results and respect safety guards.
 *
 * Exits 0 if addon unavailable (SKIP, not FAIL).
 *
 * Usage:
 *   node scripts/smoke-gpu-hardening.mjs
 *   node scripts/smoke-gpu-hardening.mjs --verbose
 */

import { createRequire } from 'module';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');
const VERBOSE = process.argv.includes('--verbose');

const ADDON_CANDIDATES = [
  join(ROOT, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  join(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  resolve(process.cwd(), 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
];

const color = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const _req = createRequire(import.meta.url);
let native = null;
for (const cand of ADDON_CANDIDATES) {
  try { native = _req(cand); break; } catch { /* next */ }
}

if (!native) {
  console.log(`\n${color.yellow('SKIP')}  tensorrt_bridge.node not found — GPU hardening tests skipped\n`);
  process.exit(0);
}

console.log(`\n${color.bold(color.cyan('GPU hardening smoke tests'))}\n`);

const results = [];

function test(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    const ms = Date.now() - t0;
    results.push({ name, pass: true, ms });
    console.log(`  ${color.green('✓')} ${name.padEnd(50)} ${color.dim(ms + 'ms')}`);
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ name, pass: false, ms, error: err.message });
    console.log(`  ${color.red('✗')} ${name.padEnd(50)} ${color.dim(ms + 'ms')}`);
    if (VERBOSE) console.log(`    ${color.red(err.message.slice(0, 200))}`);
  }
}

// ── Test data ─────────────────────────────────────────────────────────────────
const N = 64, DIM = 16, K = 8;
const data = new Float32Array(N * DIM);
for (let i = 0; i < N * DIM; i++) data[i] = Math.sin(i * 0.1 + 0.3);

// Test 1: clusterEmbeddings — no NaN centroids
test('clusterEmbeddings: no NaN centroids (n=64, k=8)', () => {
  const { assignments, centroids } = native.kmeansWithCentroids(data, N, DIM, K, 30);
  if (!(assignments instanceof Int32Array)) throw new Error('assignments not Int32Array');
  if (!(centroids instanceof Float32Array)) throw new Error('centroids not Float32Array');
  const hasNaN = Array.from(centroids).some((v) => !isFinite(v));
  if (hasNaN) throw new Error('NaN/Inf detected in centroids');
  const clusterCount = new Set(assignments).size;
  if (VERBOSE) console.log(`    clusters used: ${clusterCount}/${K}`);
});

// Test 2: clusterEmbeddings — k=1, all assignments should be 0
test('clusterEmbeddings: k=1 assigns all to cluster 0', () => {
  const { assignments } = native.kmeansWithCentroids(data, N, DIM, 1, 10);
  const allZero = Array.from(assignments).every((v) => v === 0);
  if (!allZero) throw new Error('k=1: some assignments are not 0');
});

// Test 3: graphSimilarity — valid matrix (within N cap)
if (typeof native.graphSimilarity === 'function') {
  const SN = 16;
  test('graphSimilarity: valid cosine matrix (n=16)', () => {
    const sub = data.slice(0, SN * DIM);
    const matrix = native.graphSimilarity(sub, SN, DIM);
    if (!(matrix instanceof Float32Array) || matrix.length !== SN * SN)
      throw new Error(`unexpected shape: ${matrix?.length}`);
    const hasNaN = Array.from(matrix).some((v) => !isFinite(v));
    if (hasNaN) throw new Error('NaN/Inf in similarity matrix');
    // Diagonal should be ~1.0 (self-similarity)
    const diagOk = Array.from({ length: SN }, (_, i) => matrix[i * SN + i]).every((v) => Math.abs(v - 1) < 0.02);
    if (!diagOk) throw new Error('Diagonal ≠ 1.0 (self-similarity invariant violated)');
  });
} else {
  console.log(`  ${color.dim('○')} graphSimilarity not exported — skipping`);
}

// Summary
console.log('\n' + '-'.repeat(60));
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
const totalMs = results.reduce((s, r) => s + r.ms, 0);

console.log(
  color.bold('GPU hardening: ') +
  color.green(`${passed} passed`) + '  ' +
  (failed > 0 ? color.red(`${failed} failed`) : color.dim('0 failed')) +
  '  ' + color.dim(`${totalMs}ms total`)
);

if (failed > 0) process.exit(1);
console.log(color.green('All GPU safety invariants hold.\n'));
