import { runGateScript } from './runner.js';
import type { GateReport, RunOptions } from './types.js';

/**
 * Gate: Identity Completion
 *
 * Verifies cross-system identity coverage:
 *   - Qdrant feature_id coverage ≥ 95%
 *   - Qdrant canonicalSourceRef ≥ 98%
 *   - Qdrant SOM coverage ≥ 99%
 *   - Qdrant karpathy_attention ≥ 90%
 *   - Neo4j canonicalSourceRef ≥ 85%
 *   - Valkey feature cache warm ≥ 90%
 *
 * Wraps: scripts/atlas/audit-identity-completion-gate.mjs
 */
export async function runIdentityGate(opts: RunOptions = {}): Promise<GateReport> {
  return runGateScript('audit-identity-completion-gate.mjs', opts);
}
