#!/usr/bin/env node
/**
 * Read-only structural audit for @deeds/parent-atlas-retrieval.
 *
 * Verifies:
 * - package export targets have source counterparts;
 * - every relative TS import/export resolves within the package source tree;
 * - production source does not import SvelteKit aliases or source files;
 * - production source does not reintroduce the removed package-local TurboVec owner.
 *
 * This script performs no package install/build and no runtime/data writes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_ROOT = join(REPO_ROOT, 'packages/parent-atlas-retrieval');
const SRC_ROOT = join(PACKAGE_ROOT, 'src');
const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function productionTs(path) {
  return extname(path) === '.ts' && !/\.(?:test|spec)\.ts$/i.test(path);
}

function resolveRelativeImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  const candidates = [];
  if (/\.js$/i.test(base)) candidates.push(base.replace(/\.js$/i, '.ts'));
  else if (/\.mjs$/i.test(base)) candidates.push(base.replace(/\.mjs$/i, '.mts'));
  else {
    candidates.push(`${base}.ts`, `${base}.mts`, join(base, 'index.ts'), join(base, 'index.mts'));
  }
  return candidates.find(existsSync) ?? null;
}

function sourcePathForExportTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('./dist/')) return null;
  const relativeTarget = target.slice('./dist/'.length);
  if (relativeTarget.endsWith('.d.ts')) return join(SRC_ROOT, relativeTarget.replace(/\.d\.ts$/i, '.ts'));
  if (relativeTarget.endsWith('.js')) return join(SRC_ROOT, relativeTarget.replace(/\.js$/i, '.ts'));
  return null;
}

const files = walk(SRC_ROOT).filter(productionTs);
const missingRelativeImports = [];
const forbiddenApplicationImports = [];
const forbiddenLocalTurboVecImports = [];

const importPattern = /(?:from\s+|import\s*\()(['"])([^'"\n]+)\1/g;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[2];
    if (specifier.startsWith('.')) {
      if (!resolveRelativeImport(file, specifier)) {
        missingRelativeImports.push({ file: relative(REPO_ROOT, file), specifier });
      }
      if (/(?:^|\/)turbovec(?:\/|$)/i.test(specifier)) {
        forbiddenLocalTurboVecImports.push({ file: relative(REPO_ROOT, file), specifier });
      }
    }
    if (specifier.startsWith('$lib/') || specifier.startsWith('$app/') || specifier.includes('sveltekit-frontend/')) {
      forbiddenApplicationImports.push({ file: relative(REPO_ROOT, file), specifier });
    }
  }
}

const exportTargets = [];
for (const [subpath, declaration] of Object.entries(packageJson.exports ?? {})) {
  if (!declaration || typeof declaration !== 'object') continue;
  for (const key of ['types', 'default']) {
    const target = declaration[key];
    const sourcePath = sourcePathForExportTarget(target);
    exportTargets.push({
      subpath,
      condition: key,
      target,
      sourcePath: sourcePath ? relative(REPO_ROOT, sourcePath) : null,
      sourceExists: sourcePath ? existsSync(sourcePath) : false,
    });
  }
}

const missingExportSources = exportTargets.filter((item) => !item.sourceExists);
const pass =
  missingRelativeImports.length === 0 &&
  forbiddenApplicationImports.length === 0 &&
  forbiddenLocalTurboVecImports.length === 0 &&
  missingExportSources.length === 0;

const receipt = {
  schema: 'atlas.parent-atlas-retrieval-package-boundary-audit.v1',
  status: pass ? 'PARENT_ATLAS_RETRIEVAL_PACKAGE_BOUNDARY_PROVEN' : 'PARENT_ATLAS_RETRIEVAL_PACKAGE_BOUNDARY_BLOCKED',
  package: '@deeds/parent-atlas-retrieval',
  productionSourceFiles: files.length,
  exportTargets,
  missingExportSources,
  missingRelativeImports,
  forbiddenApplicationImports,
  forbiddenLocalTurboVecImports,
  ownership: {
    packageOwnsTurboVec: false,
    packageOwnsSearchRuntime: false,
    packageOwnsQdrantCanonicalProjection: false,
    packageOwnsCrossEncoderAdapter: true,
    packageOwnsGpuSimdBridges: true,
  },
  canonicalAuthority: false,
  writesPerformed: false,
};

console.log(JSON.stringify(receipt, null, 2));
process.exitCode = pass ? 0 : 1;
