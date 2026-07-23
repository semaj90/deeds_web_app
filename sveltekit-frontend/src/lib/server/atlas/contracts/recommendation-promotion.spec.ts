import { describe, expect, it } from 'vitest';
import {
  ACPRecommendationPacketSchema,
  evaluateTaskPromotion,
  RecommendationRecordSchema,
} from './recommendation.js';

const gateInput = {
  recommendation_id: 'rec:cluster-routing',
  retrieval_confidence: 0.91,
  evidence_completeness: 0.92,
  duplicate_task_probability: 0.1,
  actionable: true,
  affected_paths_known: true,
  acceptance_criteria_present: true,
  permissions_resolved: true,
  permission_mode: 'proposal_only' as const,
};

describe('Atlas recommendation promotion', () => {
  it('persists versioned scalar recommendation features only', () => {
    const parsed = RecommendationRecordSchema.parse({
      recommendation_id: 'rec:1', query_id: 'query:1', candidate_tree_node_id: 'tree:1',
      usefulness_probability: 0.9, confidence: 0.8, ranker_model_id: 'logreg-v1',
      feature_contract_version: 'atlas.recommendation.features.v1', feature_values: { semantic_similarity: 0.8, authority_percentile: 0.7 },
      evidence_refs: ['evidence:1'], reason_codes: ['SEMANTIC_MATCH'], corpus_snapshot_id: 'snapshot:1', graph_projection_id: 'projection:1',
      created_at: '2026-07-23T00:00:00.000Z',
    });
    expect(parsed.feature_values.semantic_similarity).toBe(0.8);
    expect(() => RecommendationRecordSchema.parse({ ...parsed, feature_values: { token_ids: 12 } })).toThrow(/model tensors or tokenizer IDs/i);
  });

  it('keeps ACP packets within token, path, and source-root budgets', () => {
    expect(() => ACPRecommendationPacketSchema.parse({
      contract: 'atlas.acp.recommendation.v1', query_id: 'query:1', intent: 'inspect', corpus_snapshot_id: 'snapshot:1',
      budget: { max_source_files: 1, max_raw_tokens: 100, max_tool_calls: 2, max_graph_hops: 2 },
      permissions: { mode: 'read_only', allowed_roots: ['src/lib'] },
      candidates: [{ tree_node_id: 'tree:1', source_ref: 'src/lib/router.ts', relevance_probability: 0.8, reason_codes: ['EXACT_MATCH'], evidence_refs: ['evidence:1'], estimated_context_tokens: 101, graph_paths: [] }],
    })).toThrow(/token budget/i);
  });

  it('rejects missing acceptance criteria and read-only patch proposals', () => {
    expect(evaluateTaskPromotion({ ...gateInput, acceptance_criteria_present: false }).gate_decision).toBe('REJECT');
    expect(evaluateTaskPromotion({ ...gateInput, permission_mode: 'read_only' }).gate_decision).toBe('REJECT');
  });

  it('requires review for weak evidence, duplicates, or unknown paths', () => {
    expect(evaluateTaskPromotion({ ...gateInput, evidence_completeness: 0.7 }).gate_decision).toBe('REVIEW_REQUIRED');
    expect(evaluateTaskPromotion({ ...gateInput, duplicate_task_probability: 0.3 }).gate_decision).toBe('REVIEW_REQUIRED');
    expect(evaluateTaskPromotion({ ...gateInput, affected_paths_known: false }).gate_decision).toBe('REVIEW_REQUIRED');
  });

  it('promotes only a complete bounded proposal', () => {
    expect(evaluateTaskPromotion(gateInput)).toMatchObject({ gate_decision: 'PROMOTE', failure_reasons: [] });
  });
});
