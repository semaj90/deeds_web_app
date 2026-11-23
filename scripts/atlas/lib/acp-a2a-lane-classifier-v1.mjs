/**
 * Shared ACP/A2A 5-phase recommendation lane classifier (v1).
 * Reused by run-agentic-error-fixing-v1.mjs and route-rlm-prompts-to-error-fixing-v1.mjs.
 */

export const STALENESS_SIGNAL_RE =
  /STALE_SNAPSHOT|STALE_SOURCE_REVISION|GRAPHIFY_LIFECYCLE_STALE|RESIDENCY_LEASE_EXPIRED|TILE_EVICTED|DOMAIN_TAGS_UNPOPULATED|STALE_CRAWL_REVISION|CALL_TARGET_SYMBOL_REVISION_MISMATCH|TASK_REFERENCE_MISMATCH|LIFECYCLE_STALE/i;

export function classifyLanePhaseForCandidate(kind, diagnostic) {
  if (STALENESS_SIGNAL_RE.test(diagnostic ?? '')) {
    return {
      lanePhase: 'PHASE_1_INTAKE_AND_STALENESS_GATE',
      blockedByStaleness: true,
      acpTarget: 'acp.refresh_stale_evidence',
      a2aTarget: 'a2a-staleness-reconciler',
    };
  }
  if (kind === 'AUTHORIZATION' || kind === 'DATABASE_SCHEMA') {
    return {
      lanePhase: 'PHASE_5_HUMAN_GATED_PROMOTION',
      blockedByStaleness: false,
      acpTarget: 'acp.human_gate_review',
      a2aTarget: 'a2a-human-promotion-gate',
    };
  }
  if (kind === 'LINEAGE_ADMISSION' || kind === 'RETRIEVAL_OR_PROJECTION' || kind === 'GRAPH_OR_GPU') {
    return {
      lanePhase: 'PHASE_2_STRUCTURAL_AND_LINEAGE_RETRIEVAL',
      blockedByStaleness: false,
      acpTarget: 'acp.lineage_retrieval_probe',
      a2aTarget: 'a2a-graph-retrieval-analyst',
    };
  }
  return {
    lanePhase: 'PHASE_3_ACP_A2A_PROPOSAL_AND_CONTEXT_MANIFEST',
    blockedByStaleness: false,
    acpTarget: 'acp.kanban_prefill_error_task',
    a2aTarget: 'a2a-error-fixer',
  };
}
