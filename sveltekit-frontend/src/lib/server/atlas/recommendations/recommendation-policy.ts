import type { Recommendation, RecommendationAction } from '../contracts/recommendation.js';

export interface PolicyInput {
  recommendation: Recommendation;
  qdrantBridgeCoverage?: number;
  summaryEmbeddingCoverage?: number;
  graphExpansionProofPassed?: boolean;
  sparseCoverage?: number;
}

export interface PolicyOutput {
  action: RecommendationAction;
  confidence: number;
  rationale: string;
  blockedActions: RecommendationAction[];
  nextReviewAt?: Date;
}

// Rules are evaluated in priority order — first match wins.
export function evaluateRecommendationPolicy(input: PolicyInput): PolicyOutput {
  const { recommendation: rec, qdrantBridgeCoverage, summaryEmbeddingCoverage, graphExpansionProofPassed, sparseCoverage } = input;

  if (rec.decision === 'ask_permission') {
    return {
      action: 'open_blocked_task',
      confidence: 1.0,
      rationale: 'Recommendation requires operator permission before any patch can proceed.',
      blockedActions: ['repair_qdrant_identity_bridge', 'backfill_summary_embeddings', 'rerun_sparse_population'],
    };
  }

  if (qdrantBridgeCoverage !== undefined && qdrantBridgeCoverage < 0.95) {
    return {
      action: 'repair_qdrant_identity_bridge',
      confidence: 1 - qdrantBridgeCoverage,
      rationale: `Qdrant identity bridge coverage ${(qdrantBridgeCoverage * 100).toFixed(1)}% is below the 95% threshold.`,
      blockedActions: ['stop_evidence_sufficient'],
      // Allow 24h for the repair job to complete before re-evaluation
      nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  if (summaryEmbeddingCoverage !== undefined && summaryEmbeddingCoverage < 0.90) {
    return {
      action: 'backfill_summary_embeddings',
      confidence: 1 - summaryEmbeddingCoverage,
      rationale: `Summary embedding coverage ${(summaryEmbeddingCoverage * 100).toFixed(1)}% is below the 90% threshold.`,
      blockedActions: ['stop_evidence_sufficient'],
      nextReviewAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    };
  }

  if (!graphExpansionProofPassed) {
    return {
      action: 'run_graph_expansion_proof',
      confidence: 0.9,
      rationale: 'Graph expansion proof has not yet been validated for this recommendation.',
      blockedActions: [],
    };
  }

  if (sparseCoverage !== undefined && sparseCoverage < 0.80) {
    return {
      action: 'rerun_sparse_population',
      confidence: 1 - sparseCoverage,
      rationale: `Sparse vector coverage ${(sparseCoverage * 100).toFixed(1)}% is below the 80% threshold.`,
      blockedActions: [],
      nextReviewAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    };
  }

  if (rec.evidence.rerank_score >= 0.65) {
    return {
      action: 'stop_evidence_sufficient',
      confidence: rec.evidence.rerank_score,
      rationale: `Rerank score ${rec.evidence.rerank_score.toFixed(3)} meets the 0.65 sufficiency threshold.`,
      blockedActions: [],
    };
  }

  return {
    action: 'generate_research_artifact',
    confidence: 0.5,
    rationale: 'No blocking condition met and evidence is below the sufficiency threshold — generate a research artifact to gather more signal.',
    blockedActions: ['stop_evidence_sufficient'],
  };
}
