#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const outPath = path.resolve('.tmp/gpu-memory-telemetry-proof.json');
mkdirSync(path.dirname(outPath), { recursive: true });

function candidatePaths() {
  return [
    process.env.TENSORRT_BRIDGE_NODE_PATH?.trim(),
    path.resolve('simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    path.resolve('../simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    path.resolve('../simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  ].filter(Boolean);
}

const addonPath = candidatePaths().find((candidate) => existsSync(candidate));
const report = {
  schema: 'atlas.gpu-memory-telemetry-proof.v1',
  timestamp: new Date().toISOString(),
  addonPath: addonPath ?? null,
  cudaAvailableCode: null,
  getCudaMemoryRc: null,
  freeBytes: null,
  totalBytes: null,
  freeMB: null,
  totalMB: null,
  status: 'NOT_RUN',
  reason: null,
};

try {
  if (!addonPath) throw new Error('NATIVE_ADDON_NOT_FOUND');
  const addon = require(addonPath);
  if (typeof addon.checkCudaAvailable !== 'function') throw new Error('CHECK_CUDA_EXPORT_MISSING');
  if (typeof addon.getCudaMemory !== 'function') throw new Error('CUDA_MEMORY_EXPORT_MISSING');

  const cudaCode = addon.checkCudaAvailable();
  report.cudaAvailableCode = cudaCode;
  if (!(Number.isInteger(cudaCode) && cudaCode > 0)) throw new Error(`CUDA_NOT_AVAILABLE:${cudaCode}`);

  const free = new BigInt64Array(1);
  const total = new BigInt64Array(1);
  const rc = addon.getCudaMemory(free, total);
  const freeBytes = Number(free[0]);
  const totalBytes = Number(total[0]);
  report.getCudaMemoryRc = rc;
  report.freeBytes = freeBytes;
  report.totalBytes = totalBytes;
  report.freeMB = freeBytes / (1024 * 1024);
  report.totalMB = totalBytes / (1024 * 1024);

  if (rc !== 0) throw new Error(`CUDA_MEMORY_QUERY_FAILED:${rc}`);
  if (!(Number.isFinite(totalBytes) && totalBytes > 0)) throw new Error('CUDA_MEMORY_TOTAL_NOT_PROVEN');
  if (!(Number.isFinite(freeBytes) && freeBytes >= 0 && freeBytes <= totalBytes)) {
    throw new Error('CUDA_MEMORY_FREE_NOT_PROVEN');
  }

  report.status = 'CUDA_MEMORY_TELEMETRY_PROVEN';
} catch (error) {
  report.status = 'CUDA_MEMORY_TELEMETRY_NOT_PROVEN';
  report.reason = error instanceof Error ? error.message : String(error);
}

writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'CUDA_MEMORY_TELEMETRY_PROVEN') process.exitCode = 1;
