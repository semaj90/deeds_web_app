import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '$lib/server/atlas/prefill/canonical-hash-v1.js';

export const XGBOOST_CANARY_V1_SCHEMA = 'atlas.xgboost-canary.v1' as const;
export const XGBOOST_CANARY_POLICY_REVISION_V1 = 'xgboost-canary-policy:v1' as const;

const STAGE_BASIS_POINTS = {
	DISABLED: 0,
	ONE_PERCENT: 100,
	FIVE_PERCENT: 500,
	TEN_PERCENT: 1000,
} as const;

export const XgboostCanaryStageV1Schema = z.enum([
	'DISABLED',
	'ONE_PERCENT',
	'FIVE_PERCENT',
	'TEN_PERCENT',
]);
export type XgboostCanaryStageV1 = z.infer<typeof XgboostCanaryStageV1Schema>;

const bodySchema = z.object({
	schema: z.literal(XGBOOST_CANARY_V1_SCHEMA),
	policyRevision: z.literal(XGBOOST_CANARY_POLICY_REVISION_V1),
	modelRevision: z.string().trim().min(1),
	datasetRevision: z.string().trim().min(1),
	stage: XgboostCanaryStageV1Schema,
	basisPoints: z.number().int().min(0).max(10_000),
	rollbackMode: z.literal('shadow'),
}).strict().superRefine((value, ctx) => {
	if (value.basisPoints !== STAGE_BASIS_POINTS[value.stage]) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['basisPoints'],
			message: 'XGBOOST_CANARY_STAGE_BASIS_POINTS_MISMATCH',
		});
	}
});

export const XgboostCanaryPlanV1Schema = bodySchema.extend({ checksum: sha256HexSchema });
export type XgboostCanaryPlanV1 = z.infer<typeof XgboostCanaryPlanV1Schema>;

export interface XgboostCanaryAssignmentV1 {
	schema: typeof XGBOOST_CANARY_V1_SCHEMA;
	requestId: string;
	modelRevision: string;
	datasetRevision: string;
	stage: XgboostCanaryStageV1;
	bucket: number;
	basisPoints: number;
	isCanary: boolean;
	rollbackMode: 'shadow';
	checksum: string;
}

export function buildXgboostCanaryPlanV1(input: {
	modelRevision: string;
	datasetRevision: string;
	stage: XgboostCanaryStageV1;
}): XgboostCanaryPlanV1 {
	const body = bodySchema.parse({
		schema: XGBOOST_CANARY_V1_SCHEMA,
		policyRevision: XGBOOST_CANARY_POLICY_REVISION_V1,
		modelRevision: input.modelRevision,
		datasetRevision: input.datasetRevision,
		stage: input.stage,
		basisPoints: STAGE_BASIS_POINTS[input.stage],
		rollbackMode: 'shadow',
	});
	return XgboostCanaryPlanV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function verifyXgboostCanaryPlanV1(value: unknown): XgboostCanaryPlanV1 {
	const parsed = XgboostCanaryPlanV1Schema.parse(value);
	const { checksum, ...body } = parsed;
	if (checksum !== canonicalSha256V1(body)) throw new Error('XGBOOST_CANARY_CHECKSUM_MISMATCH');
	return parsed;
}

function requestBucket(requestId: string): number {
	const digest = createHash('sha256').update(requestId, 'utf8').digest('hex');
	return Number.parseInt(digest.slice(0, 8), 16) % 10_000;
}

/**
 * Pure, replayable assignment. It never changes XGBOOST_RERANK_MODE and never
 * writes an impression, model, report, or datastore record.
 */
export function assignXgboostCanaryV1(
	planValue: unknown,
	requestId: string,
): XgboostCanaryAssignmentV1 {
	const plan = verifyXgboostCanaryPlanV1(planValue);
	const normalizedRequestId = requestId.trim();
	if (!normalizedRequestId) throw new Error('XGBOOST_CANARY_REQUEST_ID_REQUIRED');
	const bucket = requestBucket(normalizedRequestId);
	const body = {
		schema: XGBOOST_CANARY_V1_SCHEMA,
		requestId: normalizedRequestId,
		modelRevision: plan.modelRevision,
		datasetRevision: plan.datasetRevision,
		stage: plan.stage,
		bucket,
		basisPoints: plan.basisPoints,
		isCanary: bucket < plan.basisPoints,
		rollbackMode: 'shadow' as const,
	};
	return { ...body, checksum: canonicalSha256V1(body) };
}
