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
  // Generated cache / internal-tooling dirs -- same category as .opencode/.claude
  // above but confirmed missing live 2026-08-26: a first --apply=10 pilot run
  // indexed 6MB .cache/d9-verifier/*.json cache dumps (split into 50 "semantic
  // chunks" each) and .agent/ workflow docs before any real source file, which
  // would have polluted the code-search vector index with generated noise at
  // full scale.
  '.cache',
  '.agent',
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
  if ([...DEFAULT_IGNORE_DIRS].some((name) => normalized === name || normalized.startsWith(`${name}/`) || normalized.includes(`/${name}/`))) {
    return true;
  }
  // Any dot-prefixed directory segment. Confirmed live 2026-08-26: every one
  // of .agent, .cache, .docker-build, .github, .husky, .kiro, .okf,
  // .tmp-audit, .venv_turbovec, .vscode turned out to be tooling/config/
  // generated data, not real application source -- maintaining an
  // ever-growing explicit list was already missing new ones on the second
  // pass. A dot-directory holding real indexable source would be a genuine
  // exception to repo convention; none has been found in this repo.
  return normalized.split('/').some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..');
}
