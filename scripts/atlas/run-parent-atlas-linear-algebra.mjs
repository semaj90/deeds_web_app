#!/usr/bin/env node
/**
 * Windows/WSL-friendly launcher for Parent Atlas CUDA linear-algebra probes.
 *
 * Usage:
 *   node scripts/atlas/run-parent-atlas-linear-algebra.mjs gemm --m 1024 --n 1024 --k 1024 --require-cuda
 *   node scripts/atlas/run-parent-atlas-linear-algebra.mjs preflight --condition 1e6 --require-cuda
 *   node scripts/atlas/run-parent-atlas-linear-algebra.mjs svd-fixtures --require-cuda
 *   node scripts/atlas/run-parent-atlas-linear-algebra.mjs selftest
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const pythonRoot = path.join(repoRoot, 'sveltekit-frontend', 'python');

function resolvePython() {
  const explicit = process.env.ATLAS_PYTHON_EXE || process.env.PYTHON_EXE;
  if (explicit?.trim()) return explicit.trim();
  const candidates = [
    path.join(repoRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(repoRoot, '.venv', 'bin', 'python'),
    path.join(repoRoot, 'sveltekit-frontend', '.venv', 'Scripts', 'python.exe'),
    path.join(repoRoot, 'sveltekit-frontend', '.venv', 'bin', 'python'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const command = process.argv[2];
const rest = process.argv.slice(3);
const modules = {
  gemm: ['parent_atlas_tensor.gemm_primitives'],
  preflight: ['parent_atlas_tensor.rtx_linear_algebra_preflight'],
  'svd-fixtures': ['parent_atlas_tensor.svd_parity', '--fixtures'],
  selftest: ['parent_atlas_tensor.gemm_primitives_selftest'],
  modfkv: ['parent_atlas_tensor.modfkv_bounded'],
};

if (!command || !(command in modules)) {
  console.error('Usage: run-parent-atlas-linear-algebra.mjs <gemm|preflight|svd-fixtures|selftest|modfkv> [args...]');
  process.exit(64);
}

const python = resolvePython();
if (!python) {
  console.error('[parent-atlas-linear-algebra] no project Python found');
  console.error('Set ATLAS_PYTHON_EXE or PYTHON_EXE, or create the repo .venv.');
  process.exit(69);
}

const env = { ...process.env };
env.PYTHONPATH = env.PYTHONPATH
  ? `${pythonRoot}${path.delimiter}${env.PYTHONPATH}`
  : pythonRoot;

const [moduleName, ...prefixArgs] = modules[command];
const result = spawnSync(python, ['-m', moduleName, ...prefixArgs, ...rest], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
