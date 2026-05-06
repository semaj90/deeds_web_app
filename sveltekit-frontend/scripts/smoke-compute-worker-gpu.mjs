#!/usr/bin/env node
/**
 * smoke-compute-worker-gpu.mjs
 *
 * Targeted smoke test for gpu-worker.mjs — the one-shot async N-API worker
 * used by libtorch-bridge.ts async wrappers (kmeansWithCentroidsAsync etc.).
 *
 * gpu-worker.mjs receives workerData (not postMessage) and sends one result
 * back via parentPort before terminating — one-shot protocol.
 * Tests the full transfer pipeline:
 *   workerData args -> N-API call -> copyTyped() -> postMessage(..., [buffers])
 *
 * Tests:
 *   kmeansWithCentroids  -> { assignments: Int32Array, centroids: Float32Array }
 *   trainSOM             -> { weights: Float32Array, bmu: Int32Array }
 *   graphSimilarity      -> Float32Array (n*n cosine similarity matrix)
 *   pageRankGPU          -> Float32Array (n PageRank scores summing to 1)
 *   attentionScoreGPU    -> Float32Array (n attention scores)
 *
 * Exits 0 if addon unavailable (SKIP, not FAIL).
 *
 * Usage:
 *   node scripts/smoke-compute-worker-gpu.mjs
 *   node scripts/smoke-compute-worker-gpu.mjs --verbose
 */

import { Worker } from 'worker_threads';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { existsSync } from 'fs';

const __dir   = dirname(fileURLToPath(import.meta.url));
const ROOT    = resolve(__dir, '..');
const WORKER  = resolve(ROOT, 'src/lib/workers/gpu-worker.mjs');
const VERBOSE = process.argv.includes('--verbose');

const color = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

// Resolve addon path from several candidates
const ADDON_CANDIDATES = [
  join(ROOT, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  join(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  resolve(process.cwd(), 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
];
const LIB_PATHS = [
  'C:\\libtorch-win-shared-with-deps-2.9.0+cu130\\libtorch\\lib',
  'C:\\libtorch\\lib',
];

const _req = createRequire(import.meta.url);
let addonPath = null;
for (const cand of ADDON_CANDIDATES) {
  try { _req(cand); addonPath = cand; break; } catch { /* next */ }
}
const libPath = LIB_PATHS.find(p => existsSync(p)) ?? null;

if (!addonPath) {
  console.log(`\n${color.yellow('SKIP')}  tensorrt_bridge.node not found`);
  console.log(`${color.dim('   Build: cd simd-bridge/cpp && cmake -B build && cmake --build build --config Release')}\n`);
  process.exit(0);
}

console.log(`\n${color.bold(color.cyan('gpu-worker smoke test'))}  ${color.dim('(workerData one-shot protocol)')}`);
console.log(`${color.dim('Addon:   ' + addonPath)}`);
console.log(`${color.dim('LibPath: ' + (libPath ?? '(using PATH)'))}\n`);

function runGpuTask(fn, args, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: { fn, addonPath, libPath, args } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error(`'${fn}' timed out`)); }, timeoutMs);
    worker.on('message', msg => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (msg.ok) resolve(msg.result);
      else reject(new Error(msg.error));
    });
    worker.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

const results = [];

async function test(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    results.push({ name, pass: true, ms });
    console.log(`  ${color.green('v')} ${name.padEnd(38)} ${color.dim(ms + 'ms')}`);
    return result;
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ name, pass: false, ms, error: err.message });
    console.log(`  ${color.red('x')} ${name.padEnd(38)} ${color.dim(ms + 'ms')}`);
    console.log(`    ${color.red(err.message.slice(0, 200))}`);
    return null;
  }
}

// Sample data
const N = 64, DIM = 32, K = 8, GW = 4, GH = 4;
const data = new Float32Array(N * DIM);
for (let i = 0; i < N; i++)
  for (let d = 0; d < DIM; d++)
    data[i * DIM + d] = Math.sin(i * 0.1 + d * 0.05);

const adj = new Float32Array(N * N);
for (let i = 0; i < N; i++) {
  adj[i * N + (i + 1) % N] = 1;
  adj[i * N + (i - 1 + N) % N] = 1;
}

// Tests
await test('kmeansWithCentroids (n=64, dim=32, k=8)', async () => {
  const { assignments, centroids, reseeded } = await runGpuTask('kmeansWithCentroids', [data, N, DIM, K, 50]);
  if (!(assignments instanceof Int32Array) || assignments.length !== N) throw new Error('assignments shape error');
  if (!(centroids instanceof Float32Array) || centroids.length !== K * DIM) throw new Error('centroids shape error');
  console.log(`    ${color.dim('-> ' + new Set(assignments).size + '/' + K + ' clusters, reseeded=' + reseeded)}`);
});

await test('trainSOM (n=64, dim=32, 4x4 grid)', async () => {
  const rI = Math.sqrt(GW * GW + GH * GH) / 2;
  const { weights, bmu } = await runGpuTask('trainSOM', [data, N, DIM, GW, GH, 30, 0.5, 0.01, rI, 1.0]);
  if (!(weights instanceof Float32Array) || weights.length !== GW * GH * DIM) throw new Error('weights shape error');
  if (!(bmu instanceof Int32Array) || bmu.length !== N) throw new Error('bmu shape error');
  console.log(`    ${color.dim('-> ' + new Set(bmu).size + '/' + (GW*GH) + ' BMUs used')}`);
});

const SN = 16;
await test('graphSimilarity (n=16, dim=32)', async () => {
  const sub = data.slice(0, SN * DIM);
  const matrix = await runGpuTask('graphSimilarity', [sub, SN, DIM]);
  if (!(matrix instanceof Float32Array) || matrix.length !== SN * SN) throw new Error('matrix shape error');
  const diagOk = Array.from({ length: SN }, (_, i) => matrix[i * SN + i]).every(v => Math.abs(v - 1) < 0.01);
  if (!diagOk) throw new Error('Diagonal != 1.0 (self-similarity invariant violated)');
  console.log(`    ${color.dim('-> diag=' + matrix[0].toFixed(4) + ', [0,1]=' + matrix[1].toFixed(4))}`);
});

await test('pageRankGPU (n=64, damping=0.85)', async () => {
  const scores = await runGpuTask('pageRankGPU', [adj, N, 0.85, 50]);
  if (!(scores instanceof Float32Array) || scores.length !== N) throw new Error('scores shape error');
  const sum = scores.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.05) throw new Error('PageRank sum=' + sum.toFixed(4) + ' != 1.0');
  console.log(`    ${color.dim('-> sum=' + sum.toFixed(4) + ', max=' + Math.max(...scores).toFixed(4))}`);
});

await test('attentionScoreGPU (query dim=32, n=64 keys)', async () => {
  const query = data.slice(0, DIM);
  const scores = await runGpuTask('attentionScoreGPU', [query, DIM, data, N]);
  if (!(scores instanceof Float32Array) || scores.length !== N) throw new Error('scores shape error');
  if (!Array.from(scores).every(s => isFinite(s))) throw new Error('NaN/Inf in scores');
  console.log(`    ${color.dim('-> max=' + Math.max(...scores).toFixed(4) + ', self=' + scores[0].toFixed(4))}`);
});

// Summary
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const totalMs = results.reduce((s, r) => s + r.ms, 0);

console.log('\n' + '-'.repeat(55));
console.log(color.bold('GPU worker: ') + color.green(passed + ' passed') + '  ' + (failed > 0 ? color.red(failed + ' failed') : color.dim('0 failed')) + '  ' + color.dim(totalMs + 'ms total'));

if (failed > 0) {
  results.filter(r => !r.pass).forEach(r => console.log('  x ' + r.name + ': ' + r.error));
  process.exit(1);
} else {
  console.log(color.green('All gpu-worker N-API functions operational.') + '\n');
}
