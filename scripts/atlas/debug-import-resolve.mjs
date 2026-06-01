#!/usr/bin/env node
/**
 * debug-import-resolve.mjs
 *
 * Utility for debugging the mapreduce import resolver.
 * Given an import path and the file it appears in, shows every
 * candidate the resolver probes and which one wins.
 *
 * Usage:
 *   node scripts/atlas/debug-import-resolve.mjs '$lib/server/redis.js' 'src/hooks.server.ts'
 *   node scripts/atlas/debug-import-resolve.mjs './$types' 'src/routes/(app)/cases/+page.server.ts'
 */

import { existsSync, statSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';

const REPO_ROOT = resolve('.');
const [importPath, fromFile] = process.argv.slice(2);

if (!importPath || !fromFile) {
  console.error('Usage: node scripts/atlas/debug-import-resolve.mjs <importPath> <fromFile>');
  process.exit(1);
}

function toRepoRelative(absPath) {
  let rel = relative(REPO_ROOT, absPath);
  rel = rel.replace(/^sveltekit-frontend[\\/]/, '');
  return rel.replace(/\//g, '\\');
}

function expandImportCandidates(rawPath) {
  const base = rawPath.replace(/[\\/]+$/, '').replace(/\.(js|mjs)$/, '');
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
    join(base, 'index.mjs'),
    `${base}.svelte`,
  ];
}

console.log(`\nResolving: ${importPath}`);
console.log(`From:      ${fromFile}`);
console.log(`Repo root: ${REPO_ROOT}\n`);

// SvelteKit $types guard
if (importPath === './$types' || importPath === './$types.js' ||
    importPath.endsWith('/$types') || importPath.endsWith('/$types.js')) {
  console.log('→ EXTERNAL (SvelteKit generated $types — never on disk)');
  process.exit(0);
}

let rawAbs = null;
if (importPath.startsWith('$lib')) {
  rawAbs = join(REPO_ROOT, 'sveltekit-frontend', 'src', 'lib', importPath.slice('$lib/'.length));
} else if (importPath.startsWith('.')) {
  const base = dirname(join(REPO_ROOT, 'sveltekit-frontend', fromFile));
  rawAbs = join(base, importPath);
} else if (importPath.startsWith('src/')) {
  rawAbs = join(REPO_ROOT, 'sveltekit-frontend', importPath);
} else {
  console.log('→ EXTERNAL (package/builtin import)');
  process.exit(0);
}

const stripped = rawAbs.replace(/\.(ts|tsx|js|mjs|cjs|json|svelte)$/i, '');
console.log(`rawAbs (before strip): ${rawAbs}`);
console.log(`rawAbs (after strip):  ${stripped}\n`);

const candidates = expandImportCandidates(stripped);
let winner = null;

for (const c of candidates) {
  const exists = existsSync(c);
  const isDir = exists && statSync(c).isDirectory();
  const marker = !exists ? '❌' : isDir ? '📁 (dir — skipped)' : '✅';
  console.log(`${marker}  ${c}`);
  if (exists && !isDir && !winner) {
    winner = c;
    console.log(`     → toRepoRelative: ${toRepoRelative(c)}`);
  }
}

console.log(winner
  ? `\n→ RESOLVES TO: ${toRepoRelative(winner)}`
  : `\n→ UNRESOLVED (dangling ref — will appear as import error in mapreduce)`);
