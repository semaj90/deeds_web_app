import { createHash } from 'node:crypto';
import { z } from 'zod';

export const TrainingCandidateRoleV1Schema = z.enum(['gold_target', 'gold_evidence']);

export const PositiveCandidateV1Schema = z.object({
	candidateKey: z.string().min(1),
	sourceRef: z.string().min(1),
	label: z.literal(1.0),
	role: TrainingCandidateRoleV1Schema,
}).strict();

export type PositiveCandidateV1 = z.infer<typeof PositiveCandidateV1Schema>;

export const HardNegativeCandidateV1Schema = z.object({
	candidateKey: z.string().min(1),
	sourceRef: z.string().min(1),
	label: z.literal(0.0),
	miningStrategies: z.array(z.string().min(1)).min(1),
	hardnessScore: z.number().finite().min(0),
}).strict();

export type HardNegativeCandidateV1 = z.infer<typeof HardNegativeCandidateV1Schema>;

export const HumanReviewDecisionV1Schema = z.object({
	decision: z.enum(['approved', 'rejected', 'request_changes']),
	reviewedBy: z.string().min(1),
	reviewedAt: z.string().datetime(),
	reviewToken: z.string().min(1),
}).strict();

export type HumanReviewDecisionV1 = z.infer<typeof HumanReviewDecisionV1Schema>;

export const VerifiedRepairReceiptInputV1Schema = z.object({
	receiptId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	receiptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	verifiedAt: z.string().datetime(),
	testsPassed: z.boolean(),
	typecheckPassed: z.boolean(),
	regressionFree: z.boolean(),
}).strict();

export type VerifiedRepairReceiptInputV1 = z.infer<typeof VerifiedRepairReceiptInputV1Schema>;

export const TrainingExampleV1Schema = z.object({
	schema: z.literal('atlas.training-example.v1'),
	exampleId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	receiptHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	humanReviewDecision: z.literal('approved'),
	reviewedBy: z.string().min(1),
	reviewToken: z.string().min(1),
	queryText: z.string().min(1),
	positives: z.array(PositiveCandidateV1Schema).min(1),
	hardNegatives: z.array(HardNegativeCandidateV1Schema),
	checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export type TrainingExampleV1 = z.infer<typeof TrainingExampleV1Schema>;

export interface BuildTrainingExampleInputV1 {
	exampleId: string;
	queryText: string;
	verifiedReceipt: VerifiedRepairReceiptInputV1;
	humanReview: HumanReviewDecisionV1;
	positives: readonly PositiveCandidateV1[];
	hardNegatives: readonly HardNegativeCandidateV1[];
}

/**
 * Builds an immutable TrainingExampleV1 record only from verified repair receipts
 * and human-approved review decisions.
 *
 * Invariants:
 * 1. Rejects unapproved, rejected, or pending human review decisions.
 * 2. Rejects receipts with failed tests, failed typecheck, or detected regressions.
 * 3. Enforces strict disjointness between positive candidates and hard negatives (zero label leakage).
 * 4. Generates a deterministic content-addressed SHA-256 checksum.
 */
export function buildTrainingExampleV1(input: BuildTrainingExampleInputV1): TrainingExampleV1 {
	const parsedReceipt = VerifiedRepairReceiptInputV1Schema.parse(input.verifiedReceipt);
	const parsedReview = HumanReviewDecisionV1Schema.parse(input.humanReview);

	if (parsedReview.decision !== 'approved') {
		throw new Error(
			`UNAPPROVED_REVIEW_CANNOT_FORM_TRAINING_EXAMPLE: Review decision is '${parsedReview.decision}', must be 'approved'`,
		);
	}

	if (!parsedReceipt.testsPassed || !parsedReceipt.typecheckPassed || !parsedReceipt.regressionFree) {
		throw new Error(
			`FAILED_VERIFIED_RECEIPT_CANNOT_FORM_TRAINING_EXAMPLE: testsPassed=${parsedReceipt.testsPassed}, typecheckPassed=${parsedReceipt.typecheckPassed}, regressionFree=${parsedReceipt.regressionFree}`,
		);
	}

	const parsedPositives = input.positives.map((p) => PositiveCandidateV1Schema.parse(p));
	if (parsedPositives.length === 0) {
		throw new Error('NO_POSITIVE_CANDIDATES_PROVIDED');
	}

	const parsedNegatives = input.hardNegatives.map((n) => HardNegativeCandidateV1Schema.parse(n));

	const positiveKeys = new Set<string>();
	const positiveRefs = new Set<string>();
	for (const p of parsedPositives) {
		if (positiveKeys.has(p.candidateKey)) {
			throw new Error(`DUPLICATE_POSITIVE_CANDIDATE_KEY: '${p.candidateKey}'`);
		}
		positiveKeys.add(p.candidateKey);
		positiveRefs.add(p.sourceRef);
	}

	const negativeKeys = new Set<string>();
	for (const n of parsedNegatives) {
		if (negativeKeys.has(n.candidateKey)) {
			throw new Error(`DUPLICATE_NEGATIVE_CANDIDATE_KEY: '${n.candidateKey}'`);
		}
		negativeKeys.add(n.candidateKey);

		if (positiveKeys.has(n.candidateKey) || positiveRefs.has(n.sourceRef)) {
			throw new Error(
				`TRAINING_EXAMPLE_LABEL_CONFLICT: Negative candidate '${n.candidateKey}' overlaps with positive candidate key or source ref '${n.sourceRef}'`,
			);
		}
	}

	const sortedPositives = [...parsedPositives].sort((a, b) =>
		a.candidateKey.localeCompare(b.candidateKey),
	);
	const sortedNegatives = [...parsedNegatives].sort((a, b) =>
		a.candidateKey.localeCompare(b.candidateKey),
	);

	const canonical = JSON.stringify({
		exampleId: input.exampleId,
		workspaceRevision: parsedReceipt.workspaceRevision,
		receiptHash: parsedReceipt.receiptHash,
		humanReviewDecision: parsedReview.decision,
		reviewedBy: parsedReview.reviewedBy,
		reviewToken: parsedReview.reviewToken,
		queryText: input.queryText,
		positives: sortedPositives,
		hardNegatives: sortedNegatives,
	});

	const checksumSha256 = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;

	return TrainingExampleV1Schema.parse({
		schema: 'atlas.training-example.v1',
		exampleId: input.exampleId,
		workspaceRevision: parsedReceipt.workspaceRevision,
		receiptHash: parsedReceipt.receiptHash,
		humanReviewDecision: 'approved',
		reviewedBy: parsedReview.reviewedBy,
		reviewToken: parsedReview.reviewToken,
		queryText: input.queryText,
		positives: sortedPositives,
		hardNegatives: sortedNegatives,
		checksumSha256,
	});
}
