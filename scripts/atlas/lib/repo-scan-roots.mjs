#!/usr/bin/env node

export const DEFAULT_SCAN_ROOTS = [
  'sveltekit-frontend',
  'scripts',
  'packages',
  'crates',
  'simd-bridge',
  'proto',
  'docs',
  'go',
  'python',
  'services',
];

export const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  '.tmp',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  '.venv-py313-backup',
  'deeds_labs',
  'granite-docling-258M',
  'logs',
  'coverage',
  'archived',
  '.opencode',
  '.claude',
]);

export function parseRoots(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function shouldSkipDirectory(dir) {
  if (!dir) return false;
  const normalized = String(dir).replaceAll('\\', '/');
  return [...DEFAULT_IGNORE_DIRS].some((name) => normalized === name || normalized.startsWith(`${name}/`) || normalized.includes(`/${name}/`));
}
