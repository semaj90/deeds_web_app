import type { Recommendation, RecommendationAction } from '../contracts/recommendation.js';

export interface ActionCandidate {
  action: RecommendationAction;
  score: number;
  evidence: string[];
  requiredPermission: 'patch_allowed' | 'read_only' | 'operator_approval';
  estimatedImpact: 'high' | 'medium' | 'low';
}

// Maps gemma4 priority to a numeric weight used in score blending.
function priorityWeight(priority: string): number {
  switch (priority) {
    case 'critical': return 1.0;
    case 'high':     return 0.75;
    case 'medium':   return 0.5;
    default:         return 0.25;
  }
}

export function buildActionCandidates(recommendation: Recommendation): ActionCandidate[] {
  const { evidence, gemma4, decision, packet_key, qdrant_point_id, tree_node_id } = recommendation;

  const rerank = evidence.rerank_score;
  const pw = priorityWeight(gemma4.priority);
  const hasFullIdentity = Boolean(packet_key && qdrant_point_id && tree_node_id);

  const candidates: ActionCandidate[] = [];

  // Qdrant identity bridge — relevant when qdrant_point_id is missing
  if (!qdrant_point_id) {
    candidates.push({
      action: 'repair_qdrant_identity_bridge',
      score: Math.min(1, 0.4 + pw * 0.4 + (evidence.qdrant_hits === 0 ? 0.2 : 0)),
      evidence: [
        'qdrant_point_id is absent from identity',
        `qdrant_hits=${evidence.qdrant_hits}`,
      ],
      requiredPermission: 'patch_allowed',
      estimatedImpact: 'high',
    });
  }

  // Summary embedding backfill — relevant when qdrant hits are low
  if (evidence.qdrant_hits < 3) {
    candidates.push({
      action: 'backfill_summary_embeddings',
      score: Math.min(1, 0.3 + pw * 0.3 + (1 - Math.min(1, evidence.qdrant_hits / 5)) * 0.4),
      evidence: [
        `Only ${evidence.qdrant_hits} Qdrant hits found`,
        `rerank_score=${rerank.toFixed(3)}`,
      ],
      requiredPermission: 'patch_allowed',
      estimatedImpact: 'medium',
    });
  }

  // Graph expansion proof — relevant when graph hits are absent
  if (evidence.graph_hits === 0) {
    candidates.push({
      action: 'run_graph_expansion_proof',
      score: Math.min(1, 0.35 + pw * 0.35 + (hasFullIdentity ? 0.3 : 0)),
      evidence: [
        'graph_hits=0 — no topology neighbours found',
        hasFullIdentity ? 'full identity available for seeding' : 'identity incomplete',
      ],
      requiredPermission: 'read_only',
      estimatedImpact: 'medium',
    });
  }

  // Sparse population — relevant when rg coverage is thin
  if (evidence.rg_matches.length < 3) {
    candidates.push({
      action: 'rerun_sparse_population',
      score: Math.min(1, 0.2 + pw * 0.2 + (1 - Math.min(1, evidence.rg_matches.length / 5)) * 0.3),
      evidence: [
        `rg_matches=${evidence.rg_matches.length} (below 3)`,
      ],
      requiredPermission: 'read_only',
      estimatedImpact: 'low',
    });
  }

  // Operator approval gate — surfaced when decision is ask_permission
  if (decision === 'ask_permission') {
    candidates.push({
      action: 'open_blocked_task',
      score: 1.0,
      evidence: [
        'decision=ask_permission',
        `risk=${gemma4.risk}`,
        `rerank_score=${rerank.toFixed(3)}`,
      ],
      requiredPermission: 'operator_approval',
      estimatedImpact: 'high',
    });
  }

  // Evidence sufficient — offered when rerank is strong and identity is complete
  if (rerank >= 0.65 && hasFullIdentity) {
    candidates.push({
      action: 'stop_evidence_sufficient',
      score: rerank,
      evidence: [
        `rerank_score=${rerank.toFixed(3)} >= 0.65`,
        'packet_key, qdrant_point_id, tree_node_id all present',
      ],
      requiredPermission: 'read_only',
      estimatedImpact: 'low',
    });
  }

  // Research artifact — fallback when signal is insufficient
  if (rerank < 0.65 || candidates.length === 0) {
    candidates.push({
      action: 'generate_research_artifact',
      score: Math.min(1, 0.1 + pw * 0.4 + rerank * 0.5),
      evidence: [
        `rerank_score=${rerank.toFixed(3)} below 0.65`,
        `cache_hits=${evidence.cache_hits}`,
      ],
      requiredPermission: 'read_only',
      estimatedImpact: gemma4.priority === 'critical' ? 'high' : 'medium',
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
