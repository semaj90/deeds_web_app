import { runGateScript } from './runner.js';
import { runReplayGate } from './replay.js';
import type { GateReport, RunOptions } from './types.js';

/**
 * Gate: Production Readiness (66 gates across all subsystems)
 *
 * Covers Qdrant, Postgres, Valkey, Neo4j, filesystem, and pipeline
 * health checks.
 *
 * Wraps: scripts/atlas/audit-parent-atlas-production-readiness.mjs
 */
export async function runProductionReadinessGate(opts: RunOptions = {}): Promise<GateReport> {
  return runGateScript('audit-parent-atlas-production-readiness.mjs', opts);
}

/**
 * Gate: Final Completion (5 milestones aggregated)
 *
 * Aggregates M1 Identity + M2 Replay + M3 Lineage + M4 CHR97 + M5 Production
 * into a single pass/fail report. This is the canonical "ship gate" — all 5
 * milestones must pass before the pipeline is considered audit-complete.
 *
 * Wraps: scripts/atlas/audit-parent-atlas-final-completion.mjs
 */
export async function runFinalGate(opts: RunOptions = {}): Promise<GateReport> {
  const replay = await runReplayGate({ ...opts, all: true });
  if (replay.overall !== 'PASS') return replay;
  return runGateScript('audit-parent-atlas-final-completion.mjs', opts);
}

export interface FinalGateResult extends GateReport {
  milestones?: {
    m1_identity: string;
    m2_replay: string;
    m3_lineage: string;
    m4_chr97: string;
    m5_production: string;
  };
  convergenceMetrics?: {
    qdrantSomCoverage: number;
    karpathyHitRate: number;
    neo4jCanonicalCoverage: number;
  };
  blockers?: string[];
}
