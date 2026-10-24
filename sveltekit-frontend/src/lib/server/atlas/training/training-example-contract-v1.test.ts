import { describe, expect, it } from 'vitest';
import {
	buildTrainingExampleV1,
	type HumanReviewDecisionV1,
	type VerifiedRepairReceiptInputV1,
} from './training-example-contract-v1.js';

describe('training-example-contract-v1', () => {
	const validReceipt: VerifiedRepairReceiptInputV1 = {
		receiptId: 'receipt-001',
		workspaceRevision: 'ws-rev-42',
		receiptHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		verifiedAt: '2026-10-24T00:00:00.000Z',
		testsPassed: true,
		typecheckPassed: true,
		regressionFree: true,
	};

	const validReview: HumanReviewDecisionV1 = {
		decision: 'approved',
		reviewedBy: 'operator-1',
		reviewedAt: '2026-10-24T00:05:00.000Z',
		reviewToken: 'tok-123',
	};

	it('builds a valid training example when receipt and review are valid', () => {
		const example = buildTrainingExampleV1({
			exampleId: 'train-ex-001',
			queryText: 'Fix type mismatch in feature row builder',
			verifiedReceipt: validReceipt,
			humanReview: validReview,
			positives: [
				{
					candidateKey: 'packet::src/foo.ts#func1',
					sourceRef: 'file:///src/foo.ts',
					label: 1.0,
					role: 'gold_target',
				},
			],
			hardNegatives: [
				{
					candidateKey: 'packet::src/bar.ts#func2',
					sourceRef: 'file:///src/bar.ts',
					label: 0.0,
					miningStrategies: ['HIGH_SEMANTIC_NON_TARGET'],
					hardnessScore: 0.85,
				},
			],
		});

		expect(example.schema).toBe('atlas.training-example.v1');
		expect(example.exampleId).toBe('train-ex-001');
		expect(example.humanReviewDecision).toBe('approved');
		expect(example.checksumSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(example.positives).toHaveLength(1);
		expect(example.hardNegatives).toHaveLength(1);
	});

	it('fails closed if human review is not approved', () => {
		expect(() =>
			buildTrainingExampleV1({
				exampleId: 'train-ex-002',
				queryText: 'Fix something',
				verifiedReceipt: validReceipt,
				humanReview: { ...validReview, decision: 'rejected' },
				positives: [
					{
						candidateKey: 'packet::src/foo.ts#func1',
						sourceRef: 'file:///src/foo.ts',
						label: 1.0,
						role: 'gold_target',
					},
				],
				hardNegatives: [],
			}),
		).toThrow('UNAPPROVED_REVIEW_CANNOT_FORM_TRAINING_EXAMPLE');
	});

	it('fails closed if verified receipt indicates failed tests or regression', () => {
		expect(() =>
			buildTrainingExampleV1({
				exampleId: 'train-ex-003',
				queryText: 'Fix something',
				verifiedReceipt: { ...validReceipt, testsPassed: false },
				humanReview: validReview,
				positives: [
					{
						candidateKey: 'packet::src/foo.ts#func1',
						sourceRef: 'file:///src/foo.ts',
						label: 1.0,
						role: 'gold_target',
					},
				],
				hardNegatives: [],
			}),
		).toThrow('FAILED_VERIFIED_RECEIPT_CANNOT_FORM_TRAINING_EXAMPLE');
	});

	it('fails closed if negative overlaps with positive candidateKey or sourceRef', () => {
		expect(() =>
			buildTrainingExampleV1({
				exampleId: 'train-ex-004',
				queryText: 'Fix something',
				verifiedReceipt: validReceipt,
				humanReview: validReview,
				positives: [
					{
						candidateKey: 'packet::src/foo.ts#func1',
						sourceRef: 'file:///src/foo.ts',
						label: 1.0,
						role: 'gold_target',
					},
				],
				hardNegatives: [
					{
						candidateKey: 'packet::src/foo.ts#func1', // Duplicate candidate key
						sourceRef: 'file:///src/other.ts',
						label: 0.0,
						miningStrategies: ['HIGH_SEMANTIC_NON_TARGET'],
						hardnessScore: 0.9,
					},
				],
			}),
		).toThrow('TRAINING_EXAMPLE_LABEL_CONFLICT');

		expect(() =>
			buildTrainingExampleV1({
				exampleId: 'train-ex-005',
				queryText: 'Fix something',
				verifiedReceipt: validReceipt,
				humanReview: validReview,
				positives: [
					{
						candidateKey: 'packet::src/foo.ts#func1',
						sourceRef: 'file:///src/foo.ts',
						label: 1.0,
						role: 'gold_target',
					},
				],
				hardNegatives: [
					{
						candidateKey: 'packet::src/foo.ts#func2',
						sourceRef: 'file:///src/foo.ts', // Overlaps on positive sourceRef
						label: 0.0,
						miningStrategies: ['HIGH_SEMANTIC_NON_TARGET'],
						hardnessScore: 0.9,
					},
				],
			}),
		).toThrow('TRAINING_EXAMPLE_LABEL_CONFLICT');
	});
});
