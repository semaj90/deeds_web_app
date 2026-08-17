import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ATLAS_IMPORT_CLUSTER_UNION_FIND_V1 = 'atlas.import_cluster_union_find.v1' as const;
export const NEO4J_GDS_LOUVAIN_MUTATE_V1 = 'neo4j-gds-louvain-mutate-v1' as const;
export const NEO4J_GDS_LEIDEN_MUTATE_V1 = 'neo4j-gds-leiden-mutate-v1' as const;
export const CUGRAPH_LOUVAIN_26_06 = 'cugraph.louvain.26.06' as const;
export const CUGRAPH_LEIDEN_26_06 = 'cugraph.leiden.26.06' as const;

export const CommunityAlgorithmIdV1Schema = z.enum([
	ATLAS_IMPORT_CLUSTER_UNION_FIND_V1,
	NEO4J_GDS_LOUVAIN_MUTATE_V1,
	NEO4J_GDS_LEIDEN_MUTATE_V1,
	CUGRAPH_LOUVAIN_26_06,
	CUGRAPH_LEIDEN_26_06,
]);
export type CommunityAlgorithmIdV1 = z.infer<typeof CommunityAlgorithmIdV1Schema>;

export const CommunityBackendV1Schema = z.enum(['native-ts', 'neo4j-gds', 'cugraph']);
export type CommunityBackendV1 = z.infer<typeof CommunityBackendV1Schema>;

export const CommunityMemberV1Schema = z.object({
	communityOrdinal: z.number().int().nonnegative(),
	communityFingerprint: z.string().min(1),
	memberIds: z.array(z.string().min(1)).min(1),
	memberCount: z.number().int().nonnegative(),
	cohesionScore: z.number().finite().nonnegative().nullable(),
	modularityContribution: z.number().finite().nullable(),
	summary: z.string().nullable(),
	purpose: z.string().nullable(),
	tags: z.array(z.string()),
}).strict();

export const CommunitySnapshotV1Schema = z.object({
	schema: z.literal('atlas.community-snapshot.v1'),
	snapshotId: z.string().min(1),
	graphRevision: z.string().min(1),
	topologyHash: z.string().min(1),
	semanticRevision: z.string().min(1),
	partitionInputRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	projectionSemantics: z.string().min(1),
	algorithmId: CommunityAlgorithmIdV1Schema,
	backend: CommunityBackendV1Schema,
	backendVersion: z.string().min(1),
	algorithmParameters: z.record(z.string(), z.unknown()),
	edgeKinds: z.array(z.string().min(1)).min(1),
	membershipHash: z.string().min(1),
	modularity: z.number().finite().nullable(),
	communities: z.array(CommunityMemberV1Schema),
	receiptRef: z.string().min(1),
}).strict();

export type CommunityMemberV1 = z.infer<typeof CommunityMemberV1Schema>;
export type CommunitySnapshotV1 = z.infer<typeof CommunitySnapshotV1Schema>;

export interface CommunityRecordLikeV1 {
	/** Backend-local id only. Never used in stable identity. */
	id: string | number;
	memberIds: readonly string[];
	memberCount?: number;
	cohesionScore?: number | null;
	modularityContribution?: number | null;
	summary?: string | null;
	purpose?: string | null;
	tags?: readonly string[];
}

function sha256(value: string): string {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalMemberIds(memberIds: readonly string[]): string[] {
	return [...new Set(memberIds.map(String).filter(Boolean))].sort();
}

/**
 * Stable across backend partition-id renumbering. Fingerprints depend only on
 * canonical membership plus the exact partition contract. Sequential GDS /
 * cuGraph / Union-Find labels never become cross-revision identity.
 */
export function buildCommunityFingerprintV1(input: {
	memberIds: readonly string[];
	algorithmId: CommunityAlgorithmIdV1;
	partitionInputRevision: string;
	projectionRevision: string;
	projectionSemantics: string;
	algorithmParameters?: Readonly<Record<string, unknown>>;
}): string {
	const canonical = JSON.stringify({
		algorithmId: input.algorithmId,
		algorithmParameters: input.algorithmParameters ?? {},
		memberIds: canonicalMemberIds(input.memberIds),
		partitionInputRevision: input.partitionInputRevision,
		projectionRevision: input.projectionRevision,
		projectionSemantics: input.projectionSemantics,
	});
	return sha256(canonical);
}

export function buildCommunitySnapshotV1(input: {
	graphRevision: string;
	topologyHash: string;
	semanticRevision: string;
	partitionInputRevision: string;
	projectionRevision: string;
	projectionSemantics: string;
	algorithmId: CommunityAlgorithmIdV1;
	backend: CommunityBackendV1;
	backendVersion: string;
	algorithmParameters?: Readonly<Record<string, unknown>>;
	edgeKinds: readonly string[];
	modularity?: number | null;
	receiptRef: string;
	records: readonly CommunityRecordLikeV1[];
}): CommunitySnapshotV1 {
	const edgeKinds = [...new Set(input.edgeKinds)].sort();
	if (edgeKinds.length === 0) throw new Error('CommunitySnapshotV1 requires at least one edge kind');
	const algorithmParameters = input.algorithmParameters ?? {};

	const communities = input.records
		.map((record) => {
			const memberIds = canonicalMemberIds(record.memberIds);
			if (memberIds.length === 0) throw new Error('community record requires at least one canonical member id');
			return CommunityMemberV1Schema.parse({
				communityOrdinal: 0,
				communityFingerprint: buildCommunityFingerprintV1({
					memberIds,
					algorithmId: input.algorithmId,
					partitionInputRevision: input.partitionInputRevision,
					projectionRevision: input.projectionRevision,
					projectionSemantics: input.projectionSemantics,
					algorithmParameters,
				}),
				memberIds,
				memberCount: record.memberCount ?? memberIds.length,
				cohesionScore: record.cohesionScore ?? null,
				modularityContribution: record.modularityContribution ?? null,
				summary: record.summary ?? null,
				purpose: record.purpose ?? null,
				tags: [...new Set(record.tags ?? [])].sort(),
			});
		})
		.sort((a, b) => a.communityFingerprint.localeCompare(b.communityFingerprint))
		.map((community, communityOrdinal) => ({ ...community, communityOrdinal }));

	const membershipHash = sha256(JSON.stringify(communities.map((community) => ({
		communityFingerprint: community.communityFingerprint,
		memberIds: community.memberIds,
	}))));

	const snapshotId = sha256(JSON.stringify({
		algorithmId: input.algorithmId,
		algorithmParameters,
		backend: input.backend,
		backendVersion: input.backendVersion,
		edgeKinds,
		graphRevision: input.graphRevision,
		membershipHash,
		partitionInputRevision: input.partitionInputRevision,
		projectionRevision: input.projectionRevision,
		projectionSemantics: input.projectionSemantics,
		semanticRevision: input.semanticRevision,
		topologyHash: input.topologyHash,
	}));

	return CommunitySnapshotV1Schema.parse({
		schema: 'atlas.community-snapshot.v1',
		snapshotId,
		graphRevision: input.graphRevision,
		topologyHash: input.topologyHash,
		semanticRevision: input.semanticRevision,
		partitionInputRevision: input.partitionInputRevision,
		projectionRevision: input.projectionRevision,
		projectionSemantics: input.projectionSemantics,
		algorithmId: input.algorithmId,
		backend: input.backend,
		backendVersion: input.backendVersion,
		algorithmParameters,
		edgeKinds,
		membershipHash,
		modularity: input.modularity ?? null,
		communities,
		receiptRef: input.receiptRef,
	});
}
