#!/usr/bin/env node
/**
 * Launch Parent Atlas GEMM/SVD self-tests through the repo Python environment.
 *
 * Examples:
 *   node scripts/atlas/run-parent-atlas-gemm.mjs attest
 *   node scripts/atlas/run-parent-atlas-gemm.mjs gemm --m 1024 --n 1024 --k 1024
 *   node scripts/atlas/run-parent-atlas-gemm.mjs selftest --require-cuda
 *   node scripts/atlas/run-parent-atlas-gemm.mjs svd --require-cuda
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const explicit = process.env.ATLAS_PYTHON_EXE || process.env.PYTHON_EXE;
const candidates = [
  explicit,
  path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
  path.join(repoRoot, '.venv', 'bin', 'python'),
  process.platform === 'win32' ? 'python' : 'python3',
].filter(Boolean);

function resolvePython() {
  for (const candidate of candidates) {
    if (candidate === 'python' || candidate === 'python3' || existsSync(candidate)) return candidate;
  }
  return null;
}

const python = resolvePython();
if (!python) {
  console.error('[parent-atlas-gemm] no Python interpreter found');
  process.exit(1);
}

const [action = 'attest', ...rest] = process.argv.slice(2);
const pythonRoot = path.join(repoRoot, 'sveltekit-frontend', 'python');
const env = {
  ...process.env,
  PYTHONPATH: [pythonRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};

let moduleName;
let args;
if (action === 'attest') {
  moduleName = 'parent_atlas_tensor.gemm_primitives';
  args = ['--attest', ...rest];
} else if (action === 'gemm') {
  moduleName = 'parent_atlas_tensor.gemm_primitives';
  args = rest;
} else if (action === 'selftest') {
  moduleName = 'parent_atlas_tensor.gemm_selftest';
  args = rest;
} else if (action === 'svd') {
  moduleName = 'parent_atlas_tensor.svd_parity';
  args = ['--fixtures', ...rest];
} else {
  console.error(`[parent-atlas-gemm] unknown action: ${action}`);
  process.exit(2);
}

const result = spawnSync(python, ['-m', moduleName, ...args], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('[parent-atlas-gemm] launch failed:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
