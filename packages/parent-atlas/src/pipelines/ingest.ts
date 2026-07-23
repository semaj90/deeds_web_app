import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { SCRIPTS_ATLAS } from '../env.js';

export interface IngestOptions {
  /** Specific script to run (default: atlas-parent-indexing.mjs) */
  script?: string;
  /** Extra args forwarded to the script */
  args?: string[];
  /** Timeout in ms (default: 5 minutes) */
  timeout?: number;
  /** Dry run — print what would run without running it */
  dryRun?: boolean;
}

export interface IngestResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Run the atlas ingest pipeline.
 *
 * Default script: scripts/atlas/atlas-parent-indexing.mjs
 * Covers: codebase scan → feature extraction → atlas_feature_map upsert
 *         → task_semantic_packets aggregation → qdrant payload tagging
 */
export function runIngest(opts: IngestOptions = {}): IngestResult {
  const scriptName = opts.script ?? 'atlas-parent-indexing.mjs';
  const scriptPath = resolve(SCRIPTS_ATLAS, scriptName);

  if (opts.dryRun) {
    console.log(`[atlas ingest] DRY RUN: node ${scriptPath} ${(opts.args ?? []).join(' ')}`);
    return { exitCode: 0, stdout: '', stderr: '', success: true };
  }

  const result = spawnSync(
    process.execPath,
    [scriptPath, ...(opts.args ?? [])],
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
