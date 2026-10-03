#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/python-runtime-capability-v1.json');
const python = process.env.PYTHON ?? 'python';
let status = 'UNAVAILABLE';
let probe = null;
let error = null;
try {
  const raw = execFileSync(python, [resolve(root, 'python/parent_atlas_runtime_probe.py')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  probe = JSON.parse(raw.trim());
  status = 'RUNTIME_RECEIPT_PROVEN';
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
}

const report = {
  schema: 'atlas.python-runtime-receipt.v1',
  generatedAt: new Date().toISOString(),
  status,
  pythonExecutable: python,
  probe,
  workerPolicy: {
    io: 'ASYNCIO_OR_THREAD_POOL',
    cpu: probe?.executor_hints?.networkx_cpu ?? 'PROCESS_POOL_UNLESS_FREE_THREADED_PROVEN',
    gpu: probe?.executor_hints?.pytorch_cuda ?? 'ISOLATED_GPU_WORKER',
    maxConcurrentGpuOwners: 1,
  },
  canonicalAuthority: false,
  writesPerformed: false,
  error,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status, python: probe?.python_version ?? null, freeThreadBuild: probe?.free_thread_build ?? null, reportPath }, null, 2));
if (status === 'UNAVAILABLE') process.exitCode = 1;
