import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { SCRIPTS_ATLAS } from '../env.js';

export interface HydrateCacheOptions {
  /** Only hydrate a specific cache type: 'ace' | 'topo' | 'karpathy' | 'all' */
  target?: 'ace' | 'topo' | 'karpathy' | 'all';
  /** Dry run — print what would run */
  dryRun?: boolean;
  /** Timeout in ms (default: 10 minutes) */
  timeout?: number;
  /** Extra args */
  args?: string[];
}

export interface HydrateCacheResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

const SCRIPT_MAP: Record<string, string> = {
  ace: 'inject-ndjson-as-ace-packets.mjs',
  topo: 'atlas-lane-health-loop.mjs',
  karpathy: 'sync-engram-memory.mjs',
};

/**
 * Hydrate the Redis/Valkey ACE packet cache from NDJSON or Postgres sources.
 *
 * ace:    Reads .opencode/ndjson/ and writes ace:packet:* Redis keys
 * topo:   Runs the atlas lane health loop to warm topo-byte candidates
 * karpathy: Syncs engram memory from gpu:karpathy:* Redis keys
 * all:    Runs all three in sequence
 */
export function runHydrateCache(opts: HydrateCacheOptions = {}): HydrateCacheResult {
  const target = opts.target ?? 'all';

  if (opts.dryRun) {
    const scripts = target === 'all' ? Object.values(SCRIPT_MAP) : [SCRIPT_MAP[target]];
    console.log(`[atlas cache hydrate] DRY RUN: would run: ${scripts.join(', ')}`);
    return { exitCode: 0, stdout: '', stderr: '', success: true };
  }

  const scripts = target === 'all'
    ? Object.entries(SCRIPT_MAP).map(([, s]) => s)
    : [SCRIPT_MAP[target]].filter(Boolean);

  let combinedStdout = '';
  let combinedStderr = '';

  for (const scriptName of scripts) {
    const scriptPath = resolve(SCRIPTS_ATLAS, scriptName);
    const result = spawnSync(
      process.execPath,
      [scriptPath, ...(opts.args ?? [])],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: opts.timeout ?? 10 * 60 * 1000,
        env: { ...process.env },
        stdio: 'pipe',
      },
    );
    combinedStdout += result.stdout ?? '';
    combinedStderr += result.stderr ?? '';
    if ((result.status ?? 1) !== 0) {
      return {
        exitCode: result.status ?? 1,
        stdout: combinedStdout,
        stderr: combinedStderr,
        success: false,
      };
    }
  }

  return { exitCode: 0, stdout: combinedStdout, stderr: combinedStderr, success: true };
}
