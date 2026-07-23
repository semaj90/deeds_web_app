import { describe, expect, it } from 'vitest';
import { summarizeDailyGraphifyBoard } from './daily-graphify-board.js';

describe('daily graphify board', () => {
  it('separates promoted tasks from review-required intake', () => {
    const board = {
      generated: '2026-07-23T00:00:00.000Z',
      collection: 'codebase_chunks_768',
      recommendation_promotion: {
        proposal_count: 2,
        promoted_count: 1,
        review_required_count: 1,
      },
      tasks: [
        { id: 'feature_extract', priority: 'P0', label: 'Assign feature_id', blockedBy: [] },
        { id: 'recommendation:promote', priority: 'P2', label: 'Promoted rec', status: 'PROPOSED', blockedBy: [], recommendation_id: 'rec:promote', origin: 'atlas_recommendation' },
      ],
    };

    const proposalLedger = {
      contract: 'atlas.recommendation.board-proposals.v1',
      recommendations: [
        {
          recommendation_id: 'rec:promote',
          title: 'Promoted recommendation',
          evidence_refs: ['rg:match'],
          reason_codes: ['DUPLICATE_TASK_RISK'],
          created_at: '2026-07-23T00:00:00.000Z',
          task_promotion: {
            recommendation_id: 'rec:promote',
            retrieval_confidence: 0.91,
            evidence_completeness: 0.88,
            duplicate_task_probability: 0.1,
            actionable: true,
            affected_paths_known: true,
            acceptance_criteria_present: true,
            permissions_resolved: true,
            permission_mode: 'proposal_only',
            gate_decision: 'PROMOTE',
            failure_reasons: [],
          },
        },
        {
          recommendation_id: 'rec:review',
          title: 'Review recommendation',
          evidence_refs: ['rg:match'],
          reason_codes: ['DUPLICATE_TASK_RISK'],
          created_at: '2026-07-23T00:00:00.000Z',
          task_promotion: {
            recommendation_id: 'rec:review',
            retrieval_confidence: 0.91,
            evidence_completeness: 0.88,
            duplicate_task_probability: 0.4,
            actionable: true,
            affected_paths_known: true,
            acceptance_criteria_present: true,
            permissions_resolved: true,
            permission_mode: 'proposal_only',
            gate_decision: 'REVIEW_REQUIRED',
            failure_reasons: ['DUPLICATE_TASK_RISK'],
          },
        },
      ],
    };

    const summary = summarizeDailyGraphifyBoard(board, proposalLedger);

    expect(summary.collection).toBe('codebase_chunks_768');
    expect(summary.columns).toHaveLength(4);
    expect(summary.columns[0]?.tasks).toHaveLength(1);
    expect(summary.promotedRecommendations).toHaveLength(1);
    expect(summary.reviewRequiredRecommendations).toHaveLength(1);
    expect(summary.recommendationPromotion).toMatchObject({
      proposalCount: 2,
      promotedCount: 1,
      reviewRequiredCount: 1,
    });
  });
});
