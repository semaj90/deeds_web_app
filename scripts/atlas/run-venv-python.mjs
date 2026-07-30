#!/usr/bin/env node
/**
 * run-venv-python.mjs — thin launcher for .venv Python scripts on Windows
 *
 * Usage (from npm scripts):
 *   node ../scripts/atlas/run-venv-python.mjs <script.py> [args...]
 *
 * Resolves ATLAS_PYTHON_EXE/PYTHON_EXE first, then the repo-root .venv
 * Python (Windows .venv/Scripts/python.exe or Unix .venv/bin/python), and
 * spawns it with the given script + args.
 * Sets cwd to repo root so relative paths in the Python scripts work.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function resolvePythonExecutable() {
  const explicit = process.env.ATLAS_PYTHON_EXE || process.env.PYTHON_EXE;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const winPy = path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe');
  const unixPy = path.join(REPO_ROOT, '.venv', 'bin', 'python');
  return existsSync(winPy) ? winPy : existsSync(unixPy) ? unixPy : null;
}

const python = resolvePythonExecutable();

if (!python) {
  console.error('[run-venv-python] ERROR: no Python executable found');
  console.error('  Set ATLAS_PYTHON_EXE or PYTHON_EXE, or create repo-root .venv');
  process.exit(1);
}

// First arg is the script path (relative to repo root or absolute)
const [, , scriptArg, ...rest] = process.argv;
if (!scriptArg) {
  console.error('[run-venv-python] Usage: node run-venv-python.mjs <script.py> [args...]');
  process.exit(1);
}

const scriptPath = path.isAbsolute(scriptArg)
  ? scriptArg
  : path.resolve(REPO_ROOT, scriptArg);

if (!existsSync(scriptPath)) {
  console.error('[run-venv-python] Script not found:', scriptPath);
  process.exit(1);
}

const result = spawnSync(python, [scriptPath, ...rest], {
  stdio: 'inherit',
  cwd:   REPO_ROOT,
});

process.exit(result.status ?? 1);
