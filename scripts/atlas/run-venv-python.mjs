#!/usr/bin/env node
/**
 * run-venv-python.mjs — thin launcher for .venv Python scripts on Windows
 *
 * Usage (from npm scripts):
 *   node ../scripts/atlas/run-venv-python.mjs <script.py> [args...]
 *
 * Resolves the repo-root .venv/Scripts/python.exe (Windows) or
 * .venv/bin/python (Unix) and spawns it with the given script + args.
 * Sets cwd to repo root so relative paths in the Python scripts work.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Resolve venv Python executable (Windows first, then Unix)
const winPy  = path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe');
const unixPy = path.join(REPO_ROOT, '.venv', 'bin', 'python');
const python  = existsSync(winPy) ? winPy : existsSync(unixPy) ? unixPy : null;

if (!python) {
  console.error('[run-venv-python] ERROR: .venv not found at', REPO_ROOT);
  console.error('  Run: python -m venv .venv && .venv/Scripts/pip install langextract psycopg2-binary python-dotenv');
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
