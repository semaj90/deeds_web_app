import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { SCRIPTS_ATLAS, REPO_ROOT } from '../env.js';

export interface MapReduceOptions {
  /** Which MapReduce job to run: 'ndjson' | 'duckdb' | 'all' */
  job?: 'ndjson' | 'duckdb' | 'all';
  /** Dry run — print what would run */
  dryRun?: boolean;
  /** Timeout in ms (default: 15 minutes) */
  timeout?: number;
  /** Extra args */
  args?: string[];
}

export interface MapReduceResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Run the Atlas MapReduce pipelines.
 *
 * ndjson: NES/CHROM NDJSON join → SOM cluster summaries + adjacency edges
 *         Reads .opencode/ndjson/ → 396 cluster summaries + 745 edges + 2.5KB ACE index
 *         Script: sveltekit-frontend/scripts/ndjson-mapreduce.mjs
 *
 * duckdb: DuckDB-backed MapReduce over atlas_feature_map + task_semantic_packets
 *         for aggregation, coverage metrics, and cross-system join analysis
 *         Script: scripts/atlas/audit-contract-map.mjs (uses DuckDB for joins)
 *
 * all:    Runs both in sequence
 */
export function runMapReduce(opts: MapReduceOptions = {}): MapReduceResult {
  const job = opts.job ?? 'all';

  const jobs: Array<{ label: string; scriptPath: string }> = [];

  if (job === 'ndjson' || job === 'all') {
    jobs.push({
      label: 'ndjson',
      scriptPath: resolve(SCRIPTS_ATLAS, 'ndjson-mapreduce-join.mjs'),
    });
  }

  if (job === 'duckdb' || job === 'all') {
    jobs.push({
      label: 'duckdb',
      scriptPath: resolve(SCRIPTS_ATLAS, 'audit-contract-map.mjs'),
    });
  }

  if (opts.dryRun) {
    for (const j of jobs) {
      console.log(`[atlas mapreduce] DRY RUN (${j.label}): node ${j.scriptPath} ${(opts.args ?? []).join(' ')}`);
    }
    return { exitCode: 0, stdout: '', stderr: '', success: true };
  }

  let combinedStdout = '';
  let combinedStderr = '';

  for (const j of jobs) {
    const result = spawnSync(
      process.execPath,
      [j.scriptPath, ...(opts.args ?? [])],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: opts.timeout ?? 15 * 60 * 1000,
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
