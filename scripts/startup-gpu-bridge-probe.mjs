#!/usr/bin/env node
/**
 * startup-gpu-bridge-probe.mjs
 *
 * Workspace startup probe: verifies the LibTorch/TensorRT N-API addon is
 * loadable and reports which functions are wired (vs. NO_LIBTORCH stubs).
 *
 * Used by:
 *   - VS Code startup task (workspace open)
 *   - opencode bootstrap
 *   - karpathy-gpu-enrich pre-flight
 *   - context-assembler GPU-lane decision
 *
 * Output:
 *   - .tmp/gpu-bridge-probe.json (machine-readable status)
 *   - stdout summary (human-readable)
 *
 * Exit codes:
 *   0  addon loaded + probe completed (not a GPU liveness claim)
 *   1  addon loaded but every function returned the NO_LIBTORCH stub (-99)
 *   2  addon failed to load (DLL missing, wrong arch, etc.)
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { createHash } from 'crypto';
import { bridgeCandidatePaths } from '../sveltekit-frontend/src/lib/server/gpu/native-addon-paths.mjs';
import { buildNativeProbeEvidenceClaims, classifyNativeAddonProbe, OUTCOME } from './atlas/native-addon-probe-classification.mjs';

const require = createRequire(import.meta.url);

function resolveAddonPath() {
	return bridgeCandidatePaths().find(existsSync) ?? null;
}

function getAddonMetadata(addonPath) {
  if (!addonPath || !existsSync(addonPath)) return { sha256: null, mtime: null, buildVariant: 'MISSING' };
  try {
    const buf = readFileSync(addonPath);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const mtime = statSync(addonPath).mtime.toISOString();
    const buildVariant = addonPath.includes('cuda-cublas') ? 'cuda-cublas' : addonPath.includes('cuda') ? 'cuda' : addonPath.includes('fallback') ? 'fallback' : 'stock';
    return { sha256, mtime, buildVariant };
  } catch { return { sha256: null, mtime: null, buildVariant: 'ERROR' }; }
}

const ADDON_PATH = resolveAddonPath();
const ADDON_METADATA = ADDON_PATH ? getAddonMetadata(ADDON_PATH) : { sha256: null, mtime: null, buildVariant: 'MISSING' };
const OUT_FILE = '.tmp/gpu-bridge-probe.json';
const LOG_FILE = path.resolve('logs/task-output/startup-gpu-bridge-probe.log');

if (!existsSync('.tmp')) mkdirSync('.tmp', { recursive: true });

const probe = {
  timestamp: new Date().toISOString(),
  addon_path: ADDON_PATH,
  addon_metadata: ADDON_METADATA,
  addon_loaded: false,
  load_error: null,
  exports: [],
  backend_info: null,
  functions: {},
  cuda_available: null,
  cuda_memory_mb: null,
  stub_count: 0,
  shape_valid_count: 0,
  backend_proven_count: 0,
  missing_export_count: 0,
  outcome_counts: Object.fromEntries(Object.values(OUTCOME).map((outcome) => [outcome, 0])),
  summary: '',
};

console.log('🔍 GPU Bridge Probe');
console.log('   Addon: ' + ADDON_PATH);
console.log();

if (!ADDON_PATH || !existsSync(ADDON_PATH)) {
  probe.load_error = 'tensorrt_bridge.node not found — run `cd simd-bridge/cpp && bash build.sh` (or build.bat on Windows)';
  console.error('  ✗ ' + probe.load_error);
  writeFileSync(OUT_FILE, JSON.stringify(probe, null, 2));
  process.exit(2);
}

let addon;
try {
  addon = require(ADDON_PATH);
  probe.addon_loaded = true;
  probe.exports = Object.keys(addon).sort();
  probe.backend_info = typeof addon.getBackendInfo === 'function' ? addon.getBackendInfo() : null;
  console.log(`  ✓ Addon loaded (${probe.exports.length} exports)`);
} catch (err) {
  probe.load_error = err.message;
  console.error(`  ✗ Load failed: ${err.message}`);
  console.error('    Likely cause: LibTorch/CUDA DLLs not in PATH.');
  console.error('    Fix (Windows): set PATH=%PATH%;C:\\libtorch-win-shared-with-deps-2.9.0+cu130\\libtorch\\lib');
  console.error('    Fix (Linux):   export LD_LIBRARY_PATH=/path/to/libtorch/lib:$LD_LIBRARY_PATH');
  writeFileSync(OUT_FILE, JSON.stringify(probe, null, 2));
  process.exit(2);
}

// Probe each known function with safe inputs (signatures match libtorch-bridge.ts)
function randVec(n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.random();
  return a;
}
function isFinite32(arr) {
  if (!arr) return false;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}
const PROBES = [
  {
    name: 'checkCudaAvailable',
    // Real native name (NOT isCudaAvailable). Returns 0=cpu, 1=cuda, 2=cuda+features.
    run: () => addon.checkCudaAvailable?.() ?? -99,
    isLive: (r) => typeof r === 'number' && r >= 1,
  },
  {
    name: 'getCudaMemory',
    // Signature: getCudaMemory(BigInt64Array free, BigInt64Array total) → rc
    run: () => {
      if (!addon.getCudaMemory) return null;
      const free = new BigInt64Array(1);
      const total = new BigInt64Array(1);
      const rc = addon.getCudaMemory(free, total);
      return { rc, free_mb: Number(free[0] / 1024n / 1024n), total_mb: Number(total[0] / 1024n / 1024n) };
    },
    isLive: (r) => r && (r.rc === 0 || r.total_mb > 0),
  },
  {
    name: 'pageRankGPU',
    // Signature: (adj, n, damping, iters) → Float32Array of length n
    run: () => addon.pageRankGPU?.(new Float32Array([0, 1, 0, 1, 0, 1, 0, 1, 0]), 3, 0.85, 10),
    isLive: (r) => r instanceof Float32Array && r.length === 3,
  },
  {
    name: 'attentionScoreGPU',
    // Signature: (query, dim, keys, n) → Float32Array of length n
    run: () => addon.attentionScoreGPU?.(randVec(768), 768, randVec(768 * 4), 4),
    isLive: (r) => r instanceof Float32Array && r.length === 4,
  },
  {
    name: 'kmeansWithCentroids',
    // Signature: (emb, n, dim, k, maxIters) → { assignments, centroids, reseeded }
    run: () => addon.kmeansWithCentroids?.(randVec(10 * 16), 10, 16, 3, 20),
    isLive: (r) => r && r.assignments instanceof Int32Array && r.centroids instanceof Float32Array,
  },
  {
    name: 'softmaxGPU',
    // Signature: (logits, n) → Float32Array of length n
    run: () => addon.softmaxGPU?.(new Float32Array([1, 2, 3, 4]), 4),
    isLive: (r) => r instanceof Float32Array && r.length === 4,
  },
  {
    name: 'rewardScoreGPU',
    // Signature: (gen, ref, n, dim) → Float32Array
    run: () => addon.rewardScoreGPU?.(randVec(768), randVec(768), 1, 768),
    isLive: (r) => r instanceof Float32Array,
  },
  {
    name: 'topKIndicesGPU',
    // Signature: (scores, n, k) → Int32Array of length k
    run: () => addon.topKIndicesGPU?.(new Float32Array([0.1, 0.9, 0.2, 0.8, 0.3]), 5, 3),
    isLive: (r) => r instanceof Int32Array && r.length === 3,
  },
  {
    name: 'batchCosineSimilarity',
    // Native signature: (query, dim, corpus, n, scores OUT, scoresLen) → rc
    run: () => {
      const query = new Float32Array([1, 2, -1]);
      const corpus = new Float32Array([2, 0, 1, 0, 1, 1, -1, -2, 1, 1, 2, -1]);
      const stableScores = new Float32Array(4);
      const rc = addon.batchCosineSimilarity?.(query, 3, corpus, 4, stableScores, 4);
      const expected = [
        1 / (Math.sqrt(6) * Math.sqrt(5) + 1e-12),
        1 / (Math.sqrt(6) * Math.sqrt(2) + 1e-12),
        -6 / (Math.sqrt(6) * Math.sqrt(6) + 1e-12),
        6 / (Math.sqrt(6) * Math.sqrt(6) + 1e-12),
      ];
      return { rc, scores: stableScores, expected };
    },
    isLive: (r) => r && r.rc === 0 && isFinite32(r.scores),
  },
  {
    name: 'autoencoderEncode',
    // Signature: (input, n, inputDim, W, b, hiddenDim) → Float32Array of length (n * hiddenDim)
    // Needs fitted weights. Keep the startup probe from invoking it with synthetic weights.
    externalProof: true,
    evidenceRef: 'smoke-all-gpu-lanes.mjs:lane-3',
    run: () => null,
    isLive: () => false,
  },
  {
    name: 'trainSOM',
    // Signature: (data, n, dim, gridW, gridH, iters, lrInit, lrFinal, radInit, radFinal) → {weights, bmu}
    run: () => addon.trainSOM?.(randVec(8 * 16), 8, 16, 2, 2, 5, 0.5, 0.1, 2.0, 0.5),
    isLive: (r) => r && r.weights instanceof Float32Array && r.bmu instanceof Int32Array,
  },
  {
    name: 'simdJsonParse',
    // Signature: (jsonString) → parsed object (key order/type may vary by backend)
    run: () => addon.simdJsonParse?.('{"a":1,"b":[2,3]}'),
    isLive: (r) => r != null && (r.a === 1 || (typeof r === 'object' && Object.keys(r).length >= 1)),
  },
  {
    name: 'simdJsonValidate',
    // Signature: (jsonString) → boolean
    run: () => addon.simdJsonValidate?.('{"valid":true}'),
    isLive: (r) => r === true,
  },
  {
    name: 'pcaProject',
    // Native signature: pcaProject(data, n, dim, mean, components, k) → Float32Array
    // Requires precomputed mean[dim] and components[dim*k] — skip if no real PCA fitted.
    run: () => {
      const dim = 32, k = 8, n = 20;
      const mean = new Float32Array(dim);            // zero mean
      const components = randVec(dim * k);            // random orthonormal-ish basis
      return addon.pcaProject?.(randVec(n * dim), n, dim, mean, components, k);
    },
    isLive: (r) => r instanceof Float32Array && r.length === 20 * 8,
  },
  {
    name: 'computeCaseEmbedding',
    // Native signature: (weights, embeddings, n, dim) → Float32Array of length dim
    // The "n" arg is INFERRED from weights.length; ensure weights.length === embeddings.length / dim
    run: () => {
      const dim = 64, n = 2;
      return addon.computeCaseEmbedding?.(new Float32Array([0.3, 0.7]), randVec(n * dim), n, dim);
    },
    isLive: (r) => r instanceof Float32Array && r.length === 64,
  },
  {
    name: 'graphSimilarity',
    // Signature: (embeddings, n, dim) → Float32Array of length (n*n)
    run: () => addon.graphSimilarity?.(new Float32Array([1, 0, 0, 1, 1, 1]), 3, 2),
    isLive: (r) => r instanceof Float32Array && r.length === 9,
  },
];

for (const p of PROBES) {
  let outcome, classification;
  try {
    const exported = addon[p.name] !== undefined;
    const externalProof = p.externalProof === true;
    addon.resetExecutionCounters?.();
    const r = externalProof ? null : p.run();
    const shapeValid = !externalProof && p.isLive(r);
    const counters = addon.getExecutionCounters?.() ?? null;
    let parity = null;
    if (p.name === 'batchCosineSimilarity' && r?.expected) {
      const maxAbsError = Math.max(...r.expected.map((value, index) => Math.abs(r.scores[index] - value)));
      parity = maxAbsError <= 2e-5 ? 'MATCH' : 'MISMATCH';
    } else if (p.name === 'graphSimilarity' && r instanceof Float32Array) {
      const v = [[1, 0], [0, 1], [1, 1]];
      const expected = v.flatMap((a) => v.map((b) => {
        const dot = a[0] * b[0] + a[1] * b[1];
        return dot / (Math.hypot(...a) * Math.hypot(...b) + 1e-12);
      }));
      const maxAbsError = Math.max(...expected.map((value, index) => Math.abs(r[index] - value)));
      parity = maxAbsError <= 2e-5 ? 'MATCH' : 'MISMATCH';
    }
    const backend = probe.backend_info?.per_export_backend?.[p.name]?.backend;
    const backendEvidence = {
      cudaExecutionCount: counters?.cuda_execution ?? 0,
      cpuFallbackCount: counters?.cpu_fallback ?? 0,
      libtorchCpuCount: backend === 'cpu_fallback' ? counters?.cpu_fallback ?? 0 : 0,
      backendInfoValid: Boolean(backend),
    };
    classification = classifyNativeAddonProbe({ exported, result: r, error: null, shapeValid, externalProof, backendEvidence, parity });

    let raw;
    if (r instanceof Float32Array || r instanceof Int32Array) {
      raw = `${r.constructor.name}[${r.length}] ` + Array.from(r.slice(0, 3)).map(x => Number(x).toFixed(3)).join(',') + (r.length > 3 ? ',...' : '');
    } else if (r && typeof r === 'object') {
      raw = JSON.stringify(r, (_, v) => v instanceof Float32Array || v instanceof Int32Array ? `${v.constructor.name}[${v.length}]` : v).slice(0, 100);
    } else {
      raw = String(r);
    }
    outcome = {
      ok: shapeValid && parity !== 'MISMATCH',
      classification,
      ...buildNativeProbeEvidenceClaims({
        binaryPresent: Boolean(ADDON_PATH && existsSync(ADDON_PATH)),
        implementationLinked: null,
        symbolLoaded: exported,
        executionCounters: counters,
        branchAttempted: !externalProof,
      }),
      evidenceRef: externalProof ? p.evidenceRef ?? null : null,
      backend,
      executionCounters: counters,
      parity,
      raw,
    };
    probe.outcome_counts[classification]++;
    if (classification === OUTCOME.SHAPE_VALID) probe.shape_valid_count++;
    if (classification === OUTCOME.CUDA_LIVE || classification === OUTCOME.LIBTORCH_CPU) probe.backend_proven_count++;
    if (classification === OUTCOME.MISSING_EXPORT) probe.missing_export_count++;
    if (classification === OUTCOME.NO_LIBTORCH_STUB) probe.stub_count++;
    console.log(`  ${classification === OUTCOME.CUDA_LIVE || classification === OUTCOME.LIBTORCH_CPU ? '✓' : '~'} ${p.name.padEnd(24)} → [${classification}] ${raw}`);
  } catch (e) {
    const exported = addon[p.name] !== undefined;
    classification = classifyNativeAddonProbe({ exported, result: null, error: e, shapeValid: false });
    outcome = {
      ok: false,
      classification,
      ...buildNativeProbeEvidenceClaims({
        binaryPresent: Boolean(ADDON_PATH && existsSync(ADDON_PATH)),
        implementationLinked: null,
        symbolLoaded: exported,
      }),
      error: e.message.slice(0, 80),
    };
    probe.outcome_counts[classification]++;
    console.log(`  ✗ ${p.name.padEnd(24)} → [${classification}] ${e.message.slice(0, 60)}`);
  }
  probe.functions[p.name] = outcome;
}

// Reflect actual native flag name: checkCudaAvailable (NOT isCudaAvailable)
if (probe.functions.checkCudaAvailable?.ok) {
  probe.cuda_available = true;
  if (probe.functions.getCudaMemory?.raw) {
    try {
      const mem = JSON.parse(probe.functions.getCudaMemory.raw);
      probe.cuda_memory_mb = mem.free_mb ?? null;
      probe.cuda_total_mb = mem.total_mb ?? null;
    } catch {}
  }
} else {
  probe.cuda_available = false;
}

const total = PROBES.length;
probe.summary = `${probe.backend_proven_count}/${total} backend-proven, ${probe.shape_valid_count}/${total} shape-valid, ${probe.stub_count}/${total} stub, cuda=${probe.cuda_available}`;

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Backend proven:    ${probe.backend_proven_count}/${total}`);
console.log(`Shape valid only:  ${probe.shape_valid_count}/${total}`);
console.log(`Stub functions:    ${probe.stub_count}/${total}`);
console.log(`CUDA available:    ${probe.cuda_available}`);
if (probe.cuda_memory_mb) console.log(`Free VRAM:         ${probe.cuda_memory_mb} MB`);
console.log('═══════════════════════════════════════════════════════════════');

writeFileSync(OUT_FILE, JSON.stringify(probe, null, 2));
console.log(`Probe written: ${OUT_FILE}`);

mkdirSync(path.dirname(LOG_FILE), { recursive: true });
writeFileSync(
  LOG_FILE,
  [
    `timestamp: ${probe.timestamp}`,
    `addon_path: ${probe.addon_path}`,
    `addon_loaded: ${probe.addon_loaded}`,
    `cuda_available: ${probe.cuda_available}`,
    `backend_proven_count: ${probe.backend_proven_count}`,
    `shape_valid_count: ${probe.shape_valid_count}`,
    `stub_count: ${probe.stub_count}`,
    `summary: ${probe.summary}`,
    probe.load_error ? `load_error: ${probe.load_error}` : null,
  ].filter(Boolean).join('\n') + '\n'
);
console.log(`Task log written: ${LOG_FILE}`);

// Exit code
if (probe.backend_proven_count === 0 && probe.stub_count === total) {
  console.warn('\n⚠️  All functions returned NO_LIBTORCH stubs (-99). Bridge built without LibTorch.');
  process.exit(1);
}
process.exit(0);
