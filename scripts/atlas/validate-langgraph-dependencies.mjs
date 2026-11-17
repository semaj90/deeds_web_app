#!/usr/bin/env node
/**
 * scripts/atlas/validate-langgraph-dependencies.mjs
 * ====================================================
 * Dependency compatibility gate for @langchain/langgraph <-> @langchain/core.
 *
 * Added after a real incident (2026-08-01): @langchain/langgraph@1.4.7
 * peer-requires @langchain/core@^1.1.48, but package.json's declared
 * range (^1.0.0) let npm install 1.0.4 — well below the minimum. The
 * mismatch surfaced only as a runtime crash the first time the
 * dispatcher worker (scripts/atlas/dispatcher-worker-runtime.mts) tried
 * to import the dispatcher graph chain: "Package subpath
 * './language_models/stream' is not defined by exports in
 * @langchain/core/package.json". This gate catches that class of drift
 * before it reaches a runtime import.
 *
 * Uses the installed packages' own package.json as the source of truth
 * (not a manually maintained version-comparison table) — same approach
 * used to diagnose the original incident.
 *
 * Usage:
 *   node scripts/atlas/validate-langgraph-dependencies.mjs
 *   npm run atlas:validate:langgraph-deps   (from sveltekit-frontend/)
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', 'sveltekit-frontend');
const frontendRequire = createRequire(path.join(FRONTEND_ROOT, 'package.json'));
const PINNED_PACKAGES = [
  '@langchain/core',
  '@langchain/langgraph',
  '@langchain/langgraph-checkpoint-postgres',
];

async function readPackageJson(pkgName) {
  const pkgPath = path.join(FRONTEND_ROOT, 'node_modules', pkgName, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  return JSON.parse(raw);
}

async function readDeclaredDeps(pkgJsonPath) {
  const raw = await readFile(pkgJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  return { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
}

async function main() {
  const langgraph = await readPackageJson('@langchain/langgraph').catch(() => null);
  const core = await readPackageJson('@langchain/core').catch(() => null);
  const checkpoint = await readPackageJson('@langchain/langgraph-checkpoint-postgres').catch(() => null);

  if (!langgraph || !core || !checkpoint) {
    console.log(
      JSON.stringify({
        gate: 'LANGGRAPH_CORE_COMPATIBILITY',
        status: 'BLOCKED',
        reason: !langgraph
          ? '@langchain/langgraph not installed'
          : !core
            ? '@langchain/core not installed'
            : '@langchain/langgraph-checkpoint-postgres not installed',
      })
    );
    process.exitCode = 1;
    return;
  }

  const rootDeclared = await readDeclaredDeps(path.join(REPO_ROOT, 'package.json'));
  const frontendDeclared = await readDeclaredDeps(path.join(FRONTEND_ROOT, 'package.json'));
  const installedByPkg = {
    '@langchain/core': core.version ?? null,
    '@langchain/langgraph': langgraph.version ?? null,
    '@langchain/langgraph-checkpoint-postgres': checkpoint.version ?? null,
  };

  const mismatches = [];
  for (const pkgName of PINNED_PACKAGES) {
    const rootSpec = rootDeclared[pkgName] ?? null;
    const frontendSpec = frontendDeclared[pkgName] ?? null;
    const installedVer = installedByPkg[pkgName] ?? null;
    const exactSemver = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
    if (!exactSemver(rootSpec) || !exactSemver(frontendSpec) || rootSpec !== frontendSpec || rootSpec !== installedVer) {
      mismatches.push({ pkgName, rootSpec, frontendSpec, installedVer });
    }
  }

  console.log(
    JSON.stringify({
      gate: 'LANGGRAPH_PIN_ALIGNMENT',
      status: mismatches.length === 0 ? 'PASS' : 'FAIL',
      pinnedVersions: installedByPkg,
      mismatches,
    })
  );

  if (mismatches.length > 0) {
    process.exitCode = 1;
    return;
  }

  const requiredCoreRange = langgraph.peerDependencies?.['@langchain/core'] ?? null;
  const installedCoreVersion = core.version ?? null;

  const compatible =
    requiredCoreRange && installedCoreVersion
      ? semver.satisfies(installedCoreVersion, requiredCoreRange)
      : false;

  console.log(
    JSON.stringify({
      gate: 'LANGGRAPH_CORE_COMPATIBILITY',
      status: compatible ? 'PASS' : 'FAIL',
      langgraphVersion: langgraph.version,
      requiredCoreRange,
      installedCoreVersion,
    })
  );

  if (!compatible) {
    process.exitCode = 1;
    return;
  }

  // Proves the actual import surface, not just declared version numbers —
  // a satisfied semver range doesn't guarantee the specific subpath a
  // consumer needs actually resolves (this is exactly how the original
  // incident's root cause was confirmed).
  try {
    // Resolve from the owning SvelteKit package. A bare dynamic import here
    // resolves relative to this repo-level script and can accidentally test
    // the root dependency tree instead of the runtime that owns the graph.
    const streamPath = frontendRequire.resolve('@langchain/core/language_models/stream');
    const langgraphPath = frontendRequire.resolve('@langchain/langgraph');
    await import(pathToFileURL(streamPath).href);
    await import(pathToFileURL(langgraphPath).href);
    console.log(JSON.stringify({ gate: 'LANGGRAPH_IMPORT_COMPATIBILITY', status: 'PROVEN' }));
  } catch (err) {
    console.log(
      JSON.stringify({
        gate: 'LANGGRAPH_IMPORT_COMPATIBILITY',
        status: 'FAIL',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    process.exitCode = 1;
  }
}

main();
