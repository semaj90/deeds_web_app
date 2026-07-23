import { runGateScript } from './runner.js';
import type { GateReport, RunOptions } from './types.js';

export interface ReplayRunOptions extends RunOptions {
  /** Number of packets to sample (default 100). Pass 0 for full table scan. */
  sample?: number;
  /** Scan all packets instead of sampling */
  all?: boolean;
}

/**
 * Gate: Replay Validation
 *
 * Validates that the identity spine in task_semantic_packets can reconstruct
 * retrieval context end-to-end. Checks source_ref_hash, feature_id presence,
 * and Qdrant cross-check for sampled packets.
 *
 * Pass threshold: replay_rate ≥ 95%
 *
 * Wraps: scripts/atlas/audit-replay-validation.mjs
 */
export async function runReplayGate(opts: ReplayRunOptions = {}): Promise<GateReport> {
  const extra: string[] = [];
  if (opts.all) {
    extra.push('--all');
  } else if (opts.sample !== undefined) {
    extra.push('--sample', String(opts.sample));
  }
  return runGateScript('audit-replay-validation.mjs', { ...opts, args: extra });
}
