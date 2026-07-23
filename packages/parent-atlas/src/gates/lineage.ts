import { runGateScript } from './runner.js';
import type { GateReport, RunOptions } from './types.js';

/**
 * Gate: Lineage Validation (7-layer Atlas → CHR97 chain)
 *
 *   L1: atlas_feature_map coverage (≥70% with feature_id)
 *   L2: task_semantic_packets 100% feature_id + hash
 *   L3: nes_chrom_packets existence and feature_id alignment
 *   L4: chr97-sprites.ndjson exists with engramKey + sprite.hash
 *   L5: chr97-eval-bouts.ndjson exists
 *   L6: nes_chrom_kag_dag_hits has entries
 *   L7: nes_chrom feature_ids present in atlas_feature_map (≥80%)
 *
 * Wraps: scripts/atlas/audit-lineage-validation.mjs
 */
export async function runLineageGate(opts: RunOptions = {}): Promise<GateReport> {
  return runGateScript('audit-lineage-validation.mjs', opts);
}

/**
 * Gate: CHR97 Packet Sub-Chain (13 checks)
 *
 * Validates the deeper nes_chrom_packets → kag_dag_hits → sprite → bout chain.
 *
 * Wraps: scripts/atlas/audit-lineage-chr97-validation.mjs
 */
export async function runChr97Gate(opts: RunOptions = {}): Promise<GateReport> {
  return runGateScript('audit-lineage-chr97-validation.mjs', opts);
}
