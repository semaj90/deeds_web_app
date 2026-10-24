import { describe, expect, it } from 'vitest';
import {
	projectRecommendationToKanbanV1,
	recordReviewDecisionV1,
	deduplicateKanbanRecommendationsV1,
	type KanbanRecommendationProjectionV1,
} from './human-review-projection-v1.js';

describe('HumanReviewProjectionV1', () => {
	const baseGatePromote = {
		recommendation_id: 'rec-1',
		retrieval_confidence: 0.95,
		evidence_completeness: 0.9,
		duplicate_task_probability: 0.05,
		actionable: true,
		affected_paths_known: true,
		acceptance_criteria_present: true,
		permissions_resolved: true,
		permission_mode: 'proposal_only' as const,
		gate_decision: 'PROMOTE' as const,
		failure_reasons: [],
	};

	const baseGateReview = {
		...baseGatePromote,
		gate_decision: 'REVIEW_REQUIRED' as const,
		failure_reasons: ['RETRIEVAL_CONFIDENCE_BELOW_THRESHOLD'],
	};

	it('projects PROMOTE gate to proposed status', () => {
		const rec = projectRecommendationToKanbanV1({
			recommendationId: 'rec-1',
			title: 'Fix typo in auth',
			summary: 'Correct auth token decoding',
			priority: 'medium',
			targetFiles: ['src/auth.ts'],
			evidenceRefs: ['src/auth.ts#L42'],
			acceptanceCriteria: ['Auth tests pass'],
			validationCommands: ['npm test'],
			permissionMode: 'proposal_only',
			promotionGate: baseGatePromote,
			graphifyRevision: 'sha256:graph111',
			featureRevision: 'sha256:feat111',
		});
		expect(rec.status).toBe('proposed');
		expect(rec.humanDecision).toBe('pending');
	});

	it('projects REVIEW_REQUIRED gate to review_required status', () => {
		const rec = projectRecommendationToKanbanV1({
			recommendationId: 'rec-2',
			title: 'Uncertain cache fix',
			summary: 'Investigate cache invalidation race',
			priority: 'high',
			targetFiles: ['src/cache.ts'],
			evidenceRefs: ['src/cache.ts#L10'],
			acceptanceCriteria: ['Cache race tests pass'],
			validationCommands: ['npm test'],
			permissionMode: 'proposal_only',
			promotionGate: baseGateReview,
			graphifyRevision: 'sha256:graph111',
			featureRevision: 'sha256:feat111',
		});
		expect(rec.status).toBe('review_required');
	});

	it('records approve decision without treating approval as eval admission', () => {
		const rec = projectRecommendationToKanbanV1({
			recommendationId: 'rec-1',
			title: 'Fix typo in auth',
			summary: 'Correct auth token decoding',
			priority: 'medium',
			targetFiles: ['src/auth.ts'],
			evidenceRefs: ['src/auth.ts#L42'],
			acceptanceCriteria: ['Auth tests pass'],
			validationCommands: ['npm test'],
			permissionMode: 'proposal_only',
			promotionGate: baseGatePromote,
			graphifyRevision: 'sha256:graph111',
			featureRevision: 'sha256:feat111',
		});

		const result = recordReviewDecisionV1(rec, 'approve', {
			reviewerId: 'reviewer-alice',
			notes: 'Verified against spec',
		});

		expect(result.updatedRecommendation.status).toBe('approved');
		expect(result.updatedRecommendation.humanDecision).toBe('approve');
		expect(result.reviewEvent.decision).toBe('approve');
		expect(result.reviewEvent.reviewerId).toBe('reviewer-alice');
		expect(result.reviewEvent.appliedToEval).toBe(false);
		expect(result.evalTrainingCandidate).toBeUndefined();
	});

	it('records reject and request_changes decisions without creating training examples', () => {
		const rec = projectRecommendationToKanbanV1({
			recommendationId: 'rec-1',
			title: 'Fix typo in auth',
			summary: 'Correct auth token decoding',
			priority: 'medium',
			targetFiles: ['src/auth.ts'],
			evidenceRefs: ['src/auth.ts#L42'],
			acceptanceCriteria: ['Auth tests pass'],
			validationCommands: ['npm test'],
			permissionMode: 'proposal_only',
			promotionGate: baseGatePromote,
			graphifyRevision: 'sha256:graph111',
			featureRevision: 'sha256:feat111',
		});

		const rejected = recordReviewDecisionV1(rec, 'reject', {
			reviewerId: 'reviewer-bob',
			notes: 'Invalid patch idea',
		});
		expect(rejected.updatedRecommendation.status).toBe('rejected');
		expect(rejected.evalTrainingCandidate).toBeUndefined();

		const changes = recordReviewDecisionV1(rec, 'request_changes', {
			reviewerId: 'reviewer-carol',
			notes: 'Add regression tests first',
		});
		expect(changes.updatedRecommendation.status).toBe('review_required');
		expect(changes.evalTrainingCandidate).toBeUndefined();
	});

	it('deduplicates recommendations by evidence refs and graphify revision', () => {
		const recA: KanbanRecommendationProjectionV1 = {
			schema: 'atlas.kanban-recommendation-projection.v1',
			recommendationId: 'rec-a',
			title: 'A',
			summary: 'Summary A',
			status: 'proposed',
			priority: 'low',
			targetFiles: ['src/a.ts'],
			evidenceRefs: ['ev:1', 'ev:2'],
			acceptanceCriteria: ['Crit 1'],
			validationCommands: ['cmd 1'],
			permissionMode: 'proposal_only',
			humanDecision: 'pending',
			graphifyRevision: 'sha256:graph111',
			featureRevision: 'sha256:feat111',
			createdAt: '2026-10-24T00:00:00.000Z',
		};

		const recB: KanbanRecommendationProjectionV1 = {
			...recA,
			recommendationId: 'rec-b',
			priority: 'high',
			targetFiles: ['src/b.ts'],
			evidenceRefs: ['ev:2', 'ev:1'], // Same evidence set, different order
			acceptanceCriteria: ['Crit 2'],
			validationCommands: ['cmd 2'],
		};

		const recDistinct: KanbanRecommendationProjectionV1 = {
			...recA,
			recommendationId: 'rec-c',
			evidenceRefs: ['ev:3'],
		};

		const deduplicated = deduplicateKanbanRecommendationsV1([recA, recB, recDistinct]);
		expect(deduplicated).toHaveLength(2);

		const merged = deduplicated.find(r => r.recommendationId === 'rec-a')!;
		expect(merged.priority).toBe('high');
		expect(merged.targetFiles).toEqual(['src/a.ts', 'src/b.ts']);
		expect(merged.acceptanceCriteria).toEqual(['Crit 1', 'Crit 2']);
		expect(merged.validationCommands).toEqual(['cmd 1', 'cmd 2']);
	});
});
