#!/usr/bin/env node
/**
 * warm-napi-libtorch-bridge.mjs
 *
 * Startup-safe warmup for tensorrt_bridge.node GPU kernels.
 * - Verifies addon presence + expected exports.
 * - Executes tiny warmup calls for PageRank, attention, and reward scoring.
 * - Writes a structured artifact for startup diagnostics.
 *
 * Exit behavior:
 * - default: always exit 0 (safe for startup lane)
 * - --strict: exit 1 when status is fail
 */

import { createRequire } from 'module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const LOG_DIR = resolve(ROOT, 'logs/task-output/pipeline-test');
const STRICT = process.argv.includes('--strict');

const requireEsm = createRequire(import.meta.url);

function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const raw of paths) {
    const p = String(raw || '').trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function ensureRuntimePath() {
  const sep = process.platform === 'win32' ? ';' : ':';
  let current = process.env.PATH || '';
  const dirs = [
    'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib',
    resolve(ROOT, '../libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib'),
    'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.0/bin',
    'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.0/bin/x64',
    'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.8/bin',
    'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.8/bin/x64',
    'C:/Program Files/NVIDIA/CUDNN/v9.16/bin/13.0',
    'C:/Program Files/NVIDIA/CUDNN/v9.8/bin/12.8',
  ];
  for (const dir of dirs) {
    if (existsSync(dir) && !current.includes(dir)) {
      current = `${dir}${sep}${current}`;
    }
  }
  process.env.PATH = current;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeArtifact(payload) {
  mkdirSync(LOG_DIR, { recursive: true });
  const text = JSON.stringify(payload, null, 2);
  const stamp = nowStamp();
  const latest = resolve(LOG_DIR, 'napi-bridge-warmup-latest.json');
  const stamped = resolve(LOG_DIR, `napi-bridge-warmup-${stamp}.json`);
  writeFileSync(latest, text);
  writeFileSync(stamped, text);
}

function candidateAddonPaths() {
  return uniquePaths([
    process.env.TENSORRT_BRIDGE_NODE_PATH,
    resolve(ROOT, '../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    resolve(ROOT, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    resolve(ROOT, '../simd-bridge/cpp/build/Debug/tensorrt_bridge.node'),
    resolve(ROOT, '../simd-bridge/cpp/build/tensorrt_bridge.node'),
    'C:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node',
    'C:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/build/Release/tensorrt_bridge.node',
  ]);
}

function loadAddon() {
  ensureRuntimePath();
  const probes = [];
  let firstLoaded = null;
  for (const addonPath of candidateAddonPaths()) {
    if (!existsSync(addonPath)) {
      probes.push({ addonPath, exists: false, loaded: false, cudaFlag: null });
      continue;
    }
    try {
      const addon = requireEsm(addonPath);
      const cudaFlag = typeof addon.checkCudaAvailable === 'function' ? addon.checkCudaAvailable() : 0;
      probes.push({
        addonPath,
        exists: true,
        loaded: true,
        cudaFlag,
        exportCount: Object.keys(addon).length,
        hasKmeansWithCentroids: typeof addon.kmeansWithCentroids === 'function',
        hasTrainSOM: typeof addon.trainSOM === 'function',
        hasBatchCosineSimilarity: typeof addon.batchCosineSimilarity === 'function',
      });
      firstLoaded ??= { addon, addonPath, probes };
      if (cudaFlag > 0) return { addon, addonPath, probes };
    } catch (error) {
      probes.push({
        addonPath,
        exists: true,
        loaded: false,
        cudaFlag: null,
        loadError: String(error?.message ?? error),
      });
    }
  }
  if (firstLoaded) return firstLoaded;
  return { addon: null, addonPath: null, probes, loadError: 'tensorrt_bridge.node not found' };
}

function makeRingAdj(n) {
  const adj = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    adj[i * n + ((i + 1) % n)] = 1;
    adj[i * n + ((i - 1 + n) % n)] = 1;
  }
  return adj;
}

function makeEmbeddingBlock(n, dim) {
  const out = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dim; d++) {
      out[i * dim + d] = Math.sin(i * 0.11 + d * 0.07);
    }
  }
  return out;
}

function timedCall(name, fn) {
  const start = performance.now();
  const value = fn();
  const ms = Math.round((performance.now() - start) * 1000) / 1000;
  return { name, ms, value };
}

function summarizeVector(vec, take = 4) {
  const arr = Array.from(vec.slice(0, Math.min(take, vec.length)));
  return { length: vec.length, preview: arr.map(v => Math.round(v * 1_000_000) / 1_000_000) };
}

function main() {
  const startedAt = new Date().toISOString();
  const info = {
    startedAt,
    status: 'pass',
    strict: STRICT,
    source: 'napi-libtorch',
    addonPath: null,
    cudaAvailable: false,
    candidateProbes: [],
    ops: [],
    errors: [],
  };

  const { addon, addonPath, loadError, probes } = loadAddon();
  info.addonPath = addonPath;
  info.candidateProbes = probes ?? [];

  if (!addon) {
    info.status = 'skip';
    info.errors.push(loadError ?? 'addon unavailable');
    info.finishedAt = new Date().toISOString();
    writeArtifact(info);
    console.log(`[napi-warmup] SKIP: ${info.errors[0]}`);
    return 0;
  }

  const requiredExports = ['pageRankGPU', 'attentionScoreGPU', 'rewardScoreGPU'];
  const missing = requiredExports.filter((name) => typeof addon[name] !== 'function');
  if (missing.length > 0) {
    info.status = 'fail';
    info.errors.push(`missing exports: ${missing.join(', ')}`);
  }

  try {
    const cudaFlag = typeof addon.checkCudaAvailable === 'function' ? addon.checkCudaAvailable() : 0;
    info.cudaAvailable = cudaFlag >= 1;
  } catch (error) {
    info.errors.push(`checkCudaAvailable failed: ${String(error?.message ?? error)}`);
  }

  const N = 24;
  const DIM = 16;
  const adj = makeRingAdj(N);
  const block = makeEmbeddingBlock(N, DIM);
  const query = block.slice(0, DIM);

  if (info.status !== 'fail') {
    try {
      const pr = timedCall('pageRankGPU', () => addon.pageRankGPU(adj, N, 0.85, 20));
      const attn = timedCall('attentionScoreGPU', () => addon.attentionScoreGPU(query, DIM, block, N));
      const reward = timedCall('rewardScoreGPU', () => addon.rewardScoreGPU(block, block, N, DIM));

      info.ops.push({
        name: pr.name,
        ms: pr.ms,
        sample: summarizeVector(pr.value),
      });
      info.ops.push({
        name: attn.name,
        ms: attn.ms,
        sample: summarizeVector(attn.value),
      });
      info.ops.push({
        name: reward.name,
        ms: reward.ms,
        sample: summarizeVector(reward.value),
      });
    } catch (error) {
      info.status = 'fail';
      info.errors.push(`warmup call failed: ${String(error?.message ?? error)}`);
    }
  }

  info.finishedAt = new Date().toISOString();
  writeArtifact(info);

  if (info.status === 'pass') {
    console.log(`[napi-warmup] PASS addon=${info.addonPath} cuda=${info.cudaAvailable} ops=${info.ops.length}`);
  } else if (info.status === 'skip') {
    console.log(`[napi-warmup] SKIP: ${info.errors.join('; ')}`);
  } else {
    console.log(`[napi-warmup] FAIL: ${info.errors.join('; ')}`);
  }

  if (STRICT && info.status === 'fail') {
    return 1;
  }
  return 0;
}

process.exitCode = main();
