/**
 * Parent Atlas OaK Judge, GEPA Held-Out Isolation & Promotion Gate (v1)
 *
 * Implements:
 * - GEPA-HELDOUT-01: Frozen train/validation/held-out split with zero leakage
 *   and single-evaluation enforcement per candidate checksum.
 * - OAK-JUDGE-01: Maps bounded execution receipts (svelte-check, Vitest,
 *   atlas.retrieval-admission.v1, live DSPy) to structured judge feedback.
 * - PROMOTION-01: Requires held-out non-regression, hard gates passing, and
 *   explicit human approval before emitting an immutable promotion receipt.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const FrozenEvalSplitV1Schema = z
	.object({
		splitId: z.string().min(1),
		trainIds: z.array(z.string().min(1)).min(1),
		validationIds: z.array(z.string().min(1)).min(1),
		heldOutTestIds: z.array(z.string().min(1)).min(1)
	})
	.strict();

export type FrozenEvalSplitV1 = z.infer<typeof FrozenEvalSplitV1Schema>;

export interface BoundedExecutionReceiptsV1 {
	readonly candidateChecksum: string;
	readonly svelteCheckErrors: number;
	readonly vitestPassed: number;
	readonly vitestFailed: number;
	readonly retrievalPromotionStatus: 'PROVEN' | 'CREATED' | 'UNRESOLVED' | 'REJECTED';
	readonly heldOutPassRate: number;
	readonly baselineHeldOutPassRate: number;
}

export interface OakJudgeVerdictV1 {
	readonly schema: 'atlas.oak-judge-verdict.v1';
	readonly candidateChecksum: string;
	readonly hardGatesPassed: boolean;
	readonly nonRegressionPassed: boolean;
	readonly failedGates: string[];
	readonly repairSuggestions: string[];
}

export interface GepaPromotionReceiptV1 {
	readonly schema: 'atlas.gepa-promotion-receipt.v1';
	readonly candidateChecksum: string;
	readonly splitId: string;
	readonly humanReviewerId: string;
	readonly approved: true;
	readonly heldOutPassRate: number;
	readonly baselineHeldOutPassRate: number;
	readonly receiptChecksum: string;
}

/**
 * GEPA-HELDOUT-01: Validates zero overlap across train/validation/held-out splits
 * and prevents reusing the same held-out evaluation on the same candidate.
 */
export function assertFrozenHeldOutIsolationV1(
	split: FrozenEvalSplitV1,
	candidateChecksum: string,
	consumedCandidateChecksums: ReadonlySet<string>
): void {
	const parsed = FrozenEvalSplitV1Schema.parse(split);
	sha256Hex.parse(candidateChecksum);

	const trainSet = new Set(parsed.trainIds);
	const valSet = new Set(parsed.validationIds);

	for (const id of parsed.validationIds) {
		if (trainSet.has(id)) {
			throw new Error(`HELDOUT_LEAKAGE_DETECTED: '${id}' in both train and validation`);
		}
	}
	for (const id of parsed.heldOutTestIds) {
		if (trainSet.has(id) || valSet.has(id)) {
			throw new Error(`HELDOUT_LEAKAGE_DETECTED: '${id}' in heldOutTestIds overlaps train/val`);
		}
	}
	if (consumedCandidateChecksums.has(candidateChecksum)) {
		throw new Error(
			`HELDOUT_ALREADY_CONSUMED: candidate '${candidateChecksum}' already evaluated on held-out split`
		);
	}
}

/**
 * OAK-JUDGE-01: Maps real execution receipts to judge feedback without auto-promotion.
 */
export function evaluateOakJudgeReceiptsV1(
	receipts: BoundedExecutionReceiptsV1
): OakJudgeVerdictV1 {
	sha256Hex.parse(receipts.candidateChecksum);
	const failedGates: string[] = [];
	const repairSuggestions: string[] = [];

	if (receipts.svelteCheckErrors > 0) {
		failedGates.push('SVELTE_CHECK_NONZERO_ERRORS');
		repairSuggestions.push('Resolve TypeScript/Svelte diagnostics to 0 errors before promotion.');
	}
	if (receipts.vitestFailed > 0 || receipts.vitestPassed === 0) {
		failedGates.push('VITEST_GATE_FAILED');
		repairSuggestions.push('Ensure all targeted Vitest suites pass with zero failures.');
	}
	if (receipts.retrievalPromotionStatus !== 'PROVEN') {
		failedGates.push(`RETRIEVAL_NOT_PROVEN:${receipts.retrievalPromotionStatus}`);
		repairSuggestions.push('Resolve missing packets, revisions, or validation receipts.');
	}

	const nonRegressionPassed =
		receipts.heldOutPassRate >= receipts.baselineHeldOutPassRate &&
		receipts.heldOutPassRate >= 0 &&
		receipts.heldOutPassRate <= 1;

	if (!nonRegressionPassed) {
		failedGates.push('HELDOUT_REGRESSION');
		repairSuggestions.push(
			`Held-out pass rate (${receipts.heldOutPassRate}) < baseline (${receipts.baselineHeldOutPassRate}).`
		);
	}

	return {
		schema: 'atlas.oak-judge-verdict.v1',
		candidateChecksum: receipts.candidateChecksum,
		hardGatesPassed:
			receipts.svelteCheckErrors === 0 &&
			receipts.vitestFailed === 0 &&
			receipts.vitestPassed > 0 &&
			receipts.retrievalPromotionStatus === 'PROVEN',
		nonRegressionPassed,
		failedGates,
		repairSuggestions
	};
}

/**
 * PROMOTION-01: Requires passing judge verdict + explicit human review approval
 * to emit an immutable SHA-256 promotion receipt.
 */
export function promoteGepaCandidateWithReviewV1(input: {
	split: FrozenEvalSplitV1;
	receipts: BoundedExecutionReceiptsV1;
	consumedCandidateChecksums: Set<string>;
	humanReview: { reviewerId: string; approved: boolean };
}): GepaPromotionReceiptV1 {
	assertFrozenHeldOutIsolationV1(
		input.split,
		input.receipts.candidateChecksum,
		input.consumedCandidateChecksums
	);
	const verdict = evaluateOakJudgeReceiptsV1(input.receipts);

	// Mark held-out split consumed for this candidate regardless of outcome
	input.consumedCandidateChecksums.add(input.receipts.candidateChecksum);

	if (!verdict.hardGatesPassed || !verdict.nonRegressionPassed) {
		throw new Error(`PROMOTION_BLOCKED_GATES: ${verdict.failedGates.join(', ')}`);
	}
	if (!input.humanReview.approved || !input.humanReview.reviewerId.trim()) {
		throw new Error('PROMOTION_BLOCKED_HUMAN_REVIEW_REQUIRED');
	}

	const body = {
		schema: 'atlas.gepa-promotion-receipt.v1' as const,
		candidateChecksum: input.receipts.candidateChecksum,
		splitId: input.split.splitId,
		humanReviewerId: input.humanReview.reviewerId.trim(),
		approved: true as const,
		heldOutPassRate: input.receipts.heldOutPassRate,
		baselineHeldOutPassRate: input.receipts.baselineHeldOutPassRate
	};

	const receiptChecksum = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
	return { ...body, receiptChecksum };
}
