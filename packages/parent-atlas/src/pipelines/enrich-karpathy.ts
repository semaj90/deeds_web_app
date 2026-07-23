import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../env.js';

export interface KarpathyEnrichOptions {
  /** Use incremental (dirty-files) mode instead of full top-N run */
  dirty?: boolean;
  /** Dry run — show what would run */
  dryRun?: boolean;
  /** Number of top files to enrich (default: 50) */
  limit?: number;
  /** Timeout in ms (default: 10 minutes) */
  timeout?: number;
  /** Extra args forwarded to the script */
  args?: string[];
}

export interface KarpathyEnrichResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

const KARPATHY_SCRIPT = resolve(REPO_ROOT, 'sveltekit-frontend', 'scripts', 'karpathy-gpu-enrich.mjs');

/**
 * Run the Karpathy GPU authority enrichment pipeline.
 *
 * Combines Neo4j PageRank + attentionScoreGPU + graph authority into a
 * blended score stored in Redis at gpu:karpathy:scores (24h TTL).
 *
 * Blend: 0.4·PR + 0.3·attn + 0.3·authority
 *
 * Requires: Qdrant codebase_chunks_768, Neo4j, TurboQuant or Ollama running.
 */
export function runKarpathyEnrich(opts: KarpathyEnrichOptions = {}): KarpathyEnrichResult {
  const args: string[] = [...(opts.args ?? [])];
  if (opts.dirty) args.push('--dirty');
  if (opts.limit !== undefined) args.push('--limit', String(opts.limit));

  if (opts.dryRun) {
    console.log(`[atlas enrich karpathy] DRY RUN: node ${KARPATHY_SCRIPT} ${args.join(' ')}`);
    return { exitCode: 0, stdout: '', stderr: '', success: true };
  }

  const result = spawnSync(
    process.execPath,
    [KARPATHY_SCRIPT, ...args],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: opts.timeout ?? 10 * 60 * 1000,
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
