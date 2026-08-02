import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { SCRIPTS_ATLAS } from '../env.js';

export interface LibraryRegistryScanOptions {
  /** Override the JSON snapshot output path (default: docs/reports/library-registry-<date>.json) */
  jsonOutPath?: string;
  /** Timeout in ms (default: 5 minutes — pip show subprocess-per-package is slow on Windows) */
  timeout?: number;
  /** Dry run — print what would run without running it */
  dryRun?: boolean;
}

export interface LibraryRegistryScanResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Run the library registry scan pipeline.
 *
 * Script: scripts/atlas/library-registry-scan.mjs
 * Covers: npm lockfile scan (repo root + sveltekit-frontend) + pip site-packages
 *         scan (miniforge sidecar interpreter) → upsert into library_identities
 *         (Postgres, canonical) → JSON snapshot (docs/reports/).
 *
 * Addressing scheme: "npm:pkg@version" / "pip:pkg@version". Tier 1
 * (name/version/exports/types) is populated for every discovered package;
 * Tier 2 (declaration file paths) only for an explicit allow-list. Tier 3/4
 * (implementation content) are never written by this pipeline — resolved
 * on-demand via the library.registry_fetch_tier MCP tool.
 */
export function runLibraryRegistryScan(opts: LibraryRegistryScanOptions = {}): LibraryRegistryScanResult {
  const scriptPath = resolve(SCRIPTS_ATLAS, 'library-registry-scan.mjs');
  const args = opts.jsonOutPath ? [`--json=${opts.jsonOutPath}`] : [];

  if (opts.dryRun) {
    console.log(`[atlas library registry-scan] DRY RUN: node ${scriptPath} ${args.join(' ')}`);
    return { exitCode: 0, stdout: '', stderr: '', success: true };
  }

  const result = spawnSync(
    process.execPath,
    [scriptPath, ...args],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: opts.timeout ?? 5 * 60 * 1000,
      env: { ...process.env },
      stdio: 'pipe',
    },
  );

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    success: (result.status ?? 1) === 0,
  };
}
