import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '$lib/server/atlas/prefill/canonical-hash-v1.js';

export const XGBOOST_PROMOTION_POLICY_V1_SCHEMA = 'atlas.xgboost-promotion-policy.v1' as const;
export const XGBOOST_PROMOTION_POLICY_REVISION_V1 = 'xgboost-promotion-policy:v1' as const;

const bodySchema = z.object({
	 schema: z.literal(XGBOOST_PROMOTION_POLICY_V1_SCHEMA),
	 policyRevision: z.literal(XGBOOST_PROMOTION_POLICY_REVISION_V1),
	 candidateSetIdentical: z.boolean(),
	 featureSchemaMatched: z.boolean(),
	 predictionCountMatched: z.boolean(),
	 finitePredictions: z.boolean(),
	 deterministicReplay: z.boolean(),
	 primaryMetric: z.literal('NDCG_AT_10'),
	 noStatisticallyCredibleRegression: z.boolean(),
	 modelRevision: z.string().trim().min(1),
	 datasetRevision: z.string().trim().min(1),
	 /** A policy receipt can never promote a model by itself. */
	 automaticPromotion: z.literal(false),
	 shadowRequired: z.literal(true),
	 canaryRequired: z.literal(true),
}).strict();

export const XgboostPromotionPolicyV1Schema = bodySchema.extend({ checksum: sha256HexSchema });
export type XgboostPromotionPolicyV1 = z.infer<typeof XgboostPromotionPolicyV1Schema>;
export type XgboostPromotionPolicyInputV1 = z.input<typeof bodySchema>;

export type XgboostPromotionPolicyReviewV1 =
	| { status: 'READY_FOR_EXPLICIT_REVIEW'; promotionAllowed: false }
	| { status: 'BLOCKED'; promotionAllowed: false; failedChecks: readonly string[] };

export function buildXgboostPromotionPolicyV1(
	input: Omit<XgboostPromotionPolicyInputV1, 'schema' | 'policyRevision'>,
): XgboostPromotionPolicyV1 {
	const body = bodySchema.parse({
		schema: XGBOOST_PROMOTION_POLICY_V1_SCHEMA,
		policyRevision: XGBOOST_PROMOTION_POLICY_REVISION_V1,
		...input,
	});
	return XgboostPromotionPolicyV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function verifyXgboostPromotionPolicyV1(value: unknown): XgboostPromotionPolicyV1 {
	const parsed = XgboostPromotionPolicyV1Schema.parse(value);
	const { checksum, ...body } = parsed;
	if (checksum !== canonicalSha256V1(body)) throw new Error('XGBOOST_PROMOTION_POLICY_CHECKSUM_MISMATCH');
	return parsed;
}

/**
 * Evaluate evidence only. This function cannot promote, change execution mode,
 * select a canary, or write a model/report artifact.
 */
export function reviewXgboostPromotionPolicyV1(
	value: unknown,
): XgboostPromotionPolicyReviewV1 {
	let policy: XgboostPromotionPolicyV1;
	try {
		policy = verifyXgboostPromotionPolicyV1(value);
	} catch {
		return { status: 'BLOCKED', promotionAllowed: false, failedChecks: ['POLICY_INVALID'] };
	}

	const checks = [
		['CANDIDATE_SET_MISMATCH', policy.candidateSetIdentical],
		['FEATURE_SCHEMA_MISMATCH', policy.featureSchemaMatched],
		['PREDICTION_COUNT_MISMATCH', policy.predictionCountMatched],
		['NON_FINITE_PREDICTION', policy.finitePredictions],
		['NON_DETERMINISTIC_REPLAY', policy.deterministicReplay],
		['STATISTICALLY_CREDIBLE_REGRESSION', policy.noStatisticallyCredibleRegression],
	] as const;
	const failedChecks = checks.filter(([, passed]) => !passed).map(([name]) => name);
	return failedChecks.length === 0
		? { status: 'READY_FOR_EXPLICIT_REVIEW', promotionAllowed: false }
		: { status: 'BLOCKED', promotionAllowed: false, failedChecks };
}
