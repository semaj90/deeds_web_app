import { describe, expect, it } from 'vitest';
import {
	assertFrozenHeldOutIsolationV1,
	evaluateOakJudgeReceiptsV1,
	promoteGepaCandidateWithReviewV1,
	type FrozenEvalSplitV1
} from './oak-gepa-heldout-gate-v1.js';

const SPLIT: FrozenEvalSplitV1 = {
	splitId: 'split-2026-11-21',
	trainIds: ['t1', 't2'],
	validationIds: ['v1'],
	heldOutTestIds: ['h1', 'h2']
};

describe('OaK Judge, GEPA Held-Out Isolation & Promotion Gate (v1)', () => {
	it('blocks held-out leakage and repeated held-out evaluation of the same candidate', () => {
		const leaked: FrozenEvalSplitV1 = {
			...SPLIT,
			heldOutTestIds: ['t1', 'h2']
		};
		expect(() =>
			assertFrozenHeldOutIsolationV1(leaked, 'a'.repeat(64), new Set())
		).toThrow(/HELDOUT_LEAKAGE_DETECTED/);

		expect(() =>
			assertFrozenHeldOutIsolationV1(SPLIT, 'a'.repeat(64), new Set(['a'.repeat(64)]))
		).toThrow(/HELDOUT_ALREADY_CONSUMED/);
	});

	it('requires hard gates, non-regression, and human review before emitting promotion receipt', () => {
		const consumed = new Set<string>();
		const cand = 'b'.repeat(64);

		// Fails without human review
		expect(() =>
			promoteGepaCandidateWithReviewV1({
				split: SPLIT,
				receipts: {
					candidateChecksum: cand,
					svelteCheckErrors: 0,
					vitestPassed: 10,
					vitestFailed: 0,
					retrievalPromotionStatus: 'PROVEN',
					heldOutPassRate: 0.92,
					baselineHeldOutPassRate: 0.85
				},
				consumedCandidateChecksums: consumed,
				humanReview: { reviewerId: 'james', approved: false }
			})
		).toThrow(/PROMOTION_BLOCKED_HUMAN_REVIEW_REQUIRED/);

		// Regression caught by OaK judge
		const verdict = evaluateOakJudgeReceiptsV1({
			candidateChecksum: 'c'.repeat(64),
			svelteCheckErrors: 1,
			vitestPassed: 10,
			vitestFailed: 0,
			retrievalPromotionStatus: 'UNRESOLVED',
			heldOutPassRate: 0.7,
			baselineHeldOutPassRate: 0.85
		});
		expect(verdict.hardGatesPassed).toBe(false);
		expect(verdict.nonRegressionPassed).toBe(false);
		expect(verdict.failedGates).toContain('SVELTE_CHECK_NONZERO_ERRORS');
		expect(verdict.failedGates).toContain('HELDOUT_REGRESSION');

		// Full pass + human approval -> immutable promotion receipt
		const cand2 = 'd'.repeat(64);
		const receipt = promoteGepaCandidateWithReviewV1({
			split: SPLIT,
			receipts: {
				candidateChecksum: cand2,
				svelteCheckErrors: 0,
				vitestPassed: 10,
				vitestFailed: 0,
				retrievalPromotionStatus: 'PROVEN',
				heldOutPassRate: 0.94,
				baselineHeldOutPassRate: 0.85
			},
			consumedCandidateChecksums: consumed,
			humanReview: { reviewerId: 'james', approved: true }
		});
		expect(receipt.approved).toBe(true);
		expect(receipt.receiptChecksum).toMatch(/^[0-9a-f]{64}$/);
	});
});
