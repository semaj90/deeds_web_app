import { describe, expect, it } from 'vitest';
import {
	buildXgboostPromotionPolicyV1,
	reviewXgboostPromotionPolicyV1,
	verifyXgboostPromotionPolicyV1,
} from './xgboost-promotion-policy-v1.js';

const base = {
	candidateSetIdentical: true,
	featureSchemaMatched: true,
	predictionCountMatched: true,
	finitePredictions: true,
	deterministicReplay: true,
	primaryMetric: 'NDCG_AT_10' as const,
	noStatisticallyCredibleRegression: true,
	modelRevision: 'sha256:model-v1',
	datasetRevision: 'sha256:dataset-v1',
	automaticPromotion: false as const,
	shadowRequired: true as const,
	canaryRequired: true as const,
};

describe('XgboostPromotionPolicyV1', () => {
	it('is deterministic, checksum-bound, and never allows automatic promotion', () => {
		const first = buildXgboostPromotionPolicyV1(base);
		const second = buildXgboostPromotionPolicyV1({ ...base });
		expect(first).toEqual(second);
		expect(verifyXgboostPromotionPolicyV1(first)).toEqual(first);
		expect(first.automaticPromotion).toBe(false);
		expect(reviewXgboostPromotionPolicyV1(first)).toEqual({
			status: 'READY_FOR_EXPLICIT_REVIEW',
			promotionAllowed: false,
		});
	});

	it('blocks any missing evidence without numeric quality assumptions', () => {
		const result = reviewXgboostPromotionPolicyV1(buildXgboostPromotionPolicyV1({
			...base,
			featureSchemaMatched: false,
			deterministicReplay: false,
		}));
		expect(result).toEqual({
			status: 'BLOCKED',
			promotionAllowed: false,
			failedChecks: ['FEATURE_SCHEMA_MISMATCH', 'NON_DETERMINISTIC_REPLAY'],
		});
	});

	it('rejects tampered policy receipts and invalid promotion flags', () => {
		const policy = buildXgboostPromotionPolicyV1(base);
		expect(() => verifyXgboostPromotionPolicyV1({ ...policy, modelRevision: 'sha256:other' })).toThrow(/CHECKSUM/);
		expect(() => buildXgboostPromotionPolicyV1({ ...base, automaticPromotion: true as never })).toThrow();
		expect(reviewXgboostPromotionPolicyV1({ ...policy, checksum: 'a'.repeat(64) })).toEqual({
			status: 'BLOCKED',
			promotionAllowed: false,
			failedChecks: ['POLICY_INVALID'],
		});
	});
});
