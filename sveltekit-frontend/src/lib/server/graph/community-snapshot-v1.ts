import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ATLAS_IMPORT_CLUSTER_UNION_FIND_V1 = 'atlas.import_cluster_union_find.v1' as const;

export const CommunityMemberV1Schema = z.object({
	communityOrdinal: z.number().int().nonnegative(),
	communityFingerprint: z.string().min(1),
	clusterIds: z.array(z.number().int()).min(1),
	memberCount: z.number().int().nonnegative(),
	cohesionScore: z.number().finite().nonnegative(),
	summary: z.string(),
	purpose: z.string(),
	tags: z.array(z.string()),
}).strict();

export const CommunitySnapshotV1Schema = z.object({
	schema: z.literal('atlas.community-snapshot.v1'),
	snapshotId: z.string().min(1),
	graphRevision: z.string().min(1),
	topologyHash: z.string().min(1),
	semanticRevision: z.string().min(1),
	clusterAssignmentRevision: z.string().min(1),
	algorithmId: z.literal(ATLAS_IMPORT_CLUSTER_UNION_FIND_V1),
	edgeKinds: z.array(z.string().min(1)).min(1),
	edgeWeightThreshold: z.number().finite().nonnegative(),
	membershipHash: z.string().min(1),
	communities: z.array(CommunityMemberV1Schema),
	receiptRef: z.string().min(1),
}).strict();

export type CommunityMemberV1 = z.infer<typeof CommunityMemberV1Schema>;
export type CommunitySnapshotV1 = z.infer<typeof CommunitySnapshotV1Schema>;

export interface CommunityRecordLikeV1 {
	id: number;
	clusterIds: readonly number[];
	memberCount: number;
	cohesionScore: number;
	summary: string;
	purpose: string;
	tags: readonly string[];
}

function sha256(value: string): string {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalClusterIds(clusterIds: readonly number[]): number[] {
	return [...new Set(clusterIds.map(Number))].sort((a, b) => a - b);
}

/**
 * Stable across sequential community-id renumbering. The fingerprint depends on
 * membership plus the actual custom algorithm contract, never on `record.id`.
 */
export function buildCommunityFingerprintV1(input: {
	clusterIds: readonly number[];
	edgeKinds: readonly string[];
	edgeWeightThreshold: number;
	clusterAssignmentRevision: string;
}): string {
	const canonical = JSON.stringify({
		algorithmId: ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
		clusterAssignmentRevision: input.clusterAssignmentRevision,
		clusterIds: canonicalClusterIds(input.clusterIds),
		edgeKinds: [...new Set(input.edgeKinds)].sort(),
		edgeWeightThreshold: input.edgeWeightThreshold,
	});
	return sha256(canonical);
}

export function buildCommunitySnapshotV1(input: {
	graphRevision: string;
	topologyHash: string;
	semanticRevision: string;
	clusterAssignmentRevision: string;
	edgeKinds?: readonly string[];
	edgeWeightThreshold: number;
	receiptRef: string;
	records: readonly CommunityRecordLikeV1[];
}): CommunitySnapshotV1 {
	const edgeKinds = [...new Set(input.edgeKinds ?? ['IMPORTS'])].sort();
	const communities = input.records
		.map((record, communityOrdinal) => {
			const clusterIds = canonicalClusterIds(record.clusterIds);
			return CommunityMemberV1Schema.parse({
				communityOrdinal,
				communityFingerprint: buildCommunityFingerprintV1({
					clusterIds,
					edgeKinds,
					edgeWeightThreshold: input.edgeWeightThreshold,
					clusterAssignmentRevision: input.clusterAssignmentRevision,
				}),
				clusterIds,
				memberCount: record.memberCount,
				cohesionScore: record.cohesionScore,
				summary: record.summary,
				purpose: record.purpose,
				tags: [...new Set(record.tags)].sort(),
			});
		})
		.sort((a, b) => a.communityFingerprint.localeCompare(b.communityFingerprint))
		.map((community, communityOrdinal) => ({ ...community, communityOrdinal }));

	const membershipHash = sha256(JSON.stringify(communities.map((community) => ({
		communityFingerprint: community.communityFingerprint,
		clusterIds: community.clusterIds,
	}))));

	const snapshotId = sha256(JSON.stringify({
		algorithmId: ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
		clusterAssignmentRevision: input.clusterAssignmentRevision,
		edgeKinds,
		edgeWeightThreshold: input.edgeWeightThreshold,
		graphRevision: input.graphRevision,
		membershipHash,
		semanticRevision: input.semanticRevision,
		topologyHash: input.topologyHash,
	}));

	return CommunitySnapshotV1Schema.parse({
		schema: 'atlas.community-snapshot.v1',
		snapshotId,
		graphRevision: input.graphRevision,
		topologyHash: input.topologyHash,
		semanticRevision: input.semanticRevision,
		clusterAssignmentRevision: input.clusterAssignmentRevision,
		algorithmId: ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
		edgeKinds,
		edgeWeightThreshold: input.edgeWeightThreshold,
		membershipHash,
		communities,
		receiptRef: input.receiptRef,
	});
}
