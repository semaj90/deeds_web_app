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
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', 'sveltekit-frontend');
const frontendRequire = createRequire(path.join(FRONTEND_ROOT, 'package.json'));

async function readPackageJson(pkgName) {
  const pkgPath = path.join(FRONTEND_ROOT, 'node_modules', pkgName, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const langgraph = await readPackageJson('@langchain/langgraph').catch(() => null);
  const core = await readPackageJson('@langchain/core').catch(() => null);

  if (!langgraph || !core) {
    console.log(
      JSON.stringify({
        gate: 'LANGGRAPH_CORE_COMPATIBILITY',
        status: 'BLOCKED',
        reason: !langgraph ? '@langchain/langgraph not installed' : '@langchain/core not installed',
      })
    );
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
