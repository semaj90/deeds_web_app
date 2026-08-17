import { z } from 'zod';

export const CommunityBackendParityStatusV1Schema = z.enum(['PROVEN', 'PARTIAL', 'FAILED']);
export type CommunityBackendParityStatusV1 = z.infer<typeof CommunityBackendParityStatusV1Schema>;

export const CommunityBackendParityReceiptV1Schema = z.object({
	schema: z.literal('atlas.community-backend-parity.v1'),
	graphRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	topologyHash: z.string().min(1),
	algorithm: z.enum(['louvain', 'leiden']),
	oracleBackend: z.string().min(1),
	challengerBackend: z.string().min(1),
	nodeCount: z.number().int().positive(),
	adjustedRandIndex: z.number().finite().min(-1).max(1),
	normalizedMutualInformation: z.number().finite().min(0).max(1),
	pairwiseMembershipAgreement: z.number().finite().min(0).max(1),
	oracleCommunityCount: z.number().int().positive(),
	challengerCommunityCount: z.number().int().positive(),
	communityCountDelta: z.number().int().nonnegative(),
	oracleSingletonRatio: z.number().finite().min(0).max(1),
	challengerSingletonRatio: z.number().finite().min(0).max(1),
	singletonRatioDelta: z.number().finite().min(0).max(1),
	oracleModularity: z.number().finite().nullable(),
	challengerModularity: z.number().finite().nullable(),
	modularityDelta: z.number().finite().nonnegative().nullable(),
	status: CommunityBackendParityStatusV1Schema,
	reasonCodes: z.array(z.string().min(1)),
}).strict();
export type CommunityBackendParityReceiptV1 = z.infer<typeof CommunityBackendParityReceiptV1Schema>;

/**
 * Executor promotion requires a complete structured parity proof. Community
 * ids themselves are intentionally absent because they are backend-local.
 */
export function isCommunityBackendPromotionEligibleV1(
	receipt: CommunityBackendParityReceiptV1,
): boolean {
	const parsed = CommunityBackendParityReceiptV1Schema.parse(receipt);
	return parsed.status === 'PROVEN'
		&& parsed.adjustedRandIndex >= 0.95
		&& parsed.normalizedMutualInformation >= 0.95
		&& parsed.pairwiseMembershipAgreement >= 0.98
		&& parsed.modularityDelta !== null
		&& parsed.modularityDelta <= 0.02;
}
