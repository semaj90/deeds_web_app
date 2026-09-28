import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

/**
 * CENTROID-DURABLE-ARTIFACT-01 (parent-atlas-ace-rlm-bitfrost-integration tasks.md,
 * "design gate", 2026-09-08): a durable centroid artifact descriptor, distinct from
 * BOTH `AceBitfrostCacheIdentityV1`'s `CENTROID` cacheKind (a cache-KEY identity, in
 * `ace-bitfrost-cache-identity-v1.ts` — same directory) and the ad-hoc
 * `centroid:feature:*`/`centroid:packet:*`/`centroid:directory:*` keys written by
 * `centroid-compression.ts`. This file does not merge or replace either of those — it
 * defines what a centroid IS (a durable artifact with lineage), not how it is cached
 * or keyed in Valkey/BitFrost. Reconciling the three centroid key shapes into one
 * owner remains separate, larger follow-on work — out of scope here.
 *
 * Per the design gate: a Valkey centroid cache miss must be treated as `CACHE_MISS`,
 * not as the centroid being lost — it is always rebuildable from this durable artifact
 * or from the sealed semantic population. This contract carries the checksums needed
 * to prove a rebuilt/rewarmed cache entry actually matches this artifact.
 */

export const CENTROID_ARTIFACT_SCHEMA_V1 = 'atlas.centroid-artifact.v1' as const;

export const CentroidArtifactV1Schema = z.object({
	schema: z.literal(CENTROID_ARTIFACT_SCHEMA_V1),
	centroidId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	representationRevision: z.string().min(1),
	clusteringRevision: z.string().min(1),
	dimensions: z.number().int().positive(),
	vectorChecksum: sha256HexSchema,
	memberSetChecksum: sha256HexSchema,
	memberCount: z.number().int().nonnegative(),
	artifactRef: z.string().min(1),
	checksum: sha256HexSchema,
}).strict();
export type CentroidArtifactV1 = z.infer<typeof CentroidArtifactV1Schema>;

function assertFiniteVector(vector: readonly number[], dimensions: number): void {
	if (vector.length !== dimensions) throw new Error(`CENTROID_VECTOR_DIMENSION_MISMATCH:expected=${dimensions}:actual=${vector.length}`);
	for (const component of vector) {
		if (!Number.isFinite(component)) throw new Error('CENTROID_VECTOR_CONTAINS_NON_FINITE_COMPONENT');
	}
}

export function buildCentroidArtifactV1(input: {
	centroidId: string;
	workspaceRevision: string;
	representationRevision: string;
	clusteringRevision: string;
	vector: readonly number[];
	memberIds: readonly string[];
	artifactRef: string;
}): CentroidArtifactV1 {
	const dimensions = input.vector.length;
	if (dimensions <= 0) throw new Error('CENTROID_VECTOR_MUST_BE_NON_EMPTY');
	assertFiniteVector(input.vector, dimensions);
	if (input.memberIds.length === 0) throw new Error('CENTROID_ARTIFACT_REQUIRES_AT_LEAST_ONE_MEMBER');
	const uniqueMemberIds = [...new Set(input.memberIds)];
	if (uniqueMemberIds.length !== input.memberIds.length) throw new Error('CENTROID_ARTIFACT_DUPLICATE_MEMBER_ID');
	const sortedMemberIds = [...uniqueMemberIds].sort((a, b) => a.localeCompare(b, 'en'));

	const vectorChecksum = canonicalSha256V1({ schema: 'atlas.centroid-vector.v1', vector: input.vector });
	const memberSetChecksum = canonicalSha256V1({ schema: 'atlas.centroid-member-set.v1', memberIds: sortedMemberIds });

	const body = {
		schema: CENTROID_ARTIFACT_SCHEMA_V1,
		centroidId: input.centroidId,
		workspaceRevision: input.workspaceRevision,
		representationRevision: input.representationRevision,
		clusteringRevision: input.clusteringRevision,
		dimensions,
		vectorChecksum,
		memberSetChecksum,
		memberCount: sortedMemberIds.length,
		artifactRef: input.artifactRef,
	};
	return CentroidArtifactV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function assertCentroidArtifactV1(value: CentroidArtifactV1): CentroidArtifactV1 {
	const artifact = CentroidArtifactV1Schema.parse(value);
	const { checksum, ...body } = artifact;
	if (canonicalSha256V1(body) !== checksum) throw new Error('CENTROID_ARTIFACT_CHECKSUM_MISMATCH');
	return artifact;
}

/**
 * Proves a live (re)warmed cache payload actually matches this durable artifact,
 * per CENTROID-DURABLE-ARTIFACT-01's "treat cache loss as CACHE_MISS, not
 * CENTROID_LOST — rebuild and verify against the durable artifact" requirement.
 * Pure comparison only — does not read or write any cache backend.
 */
export function verifyCentroidCachePayloadAgainstArtifactV1(
	artifact: CentroidArtifactV1,
	payload: { vector: readonly number[]; memberIds: readonly string[] },
): { matches: true } | { matches: false; reason: string } {
	assertCentroidArtifactV1(artifact);
	if (payload.vector.length !== artifact.dimensions) {
		return { matches: false, reason: `DIMENSION_MISMATCH:expected=${artifact.dimensions}:actual=${payload.vector.length}` };
	}
	const vectorChecksum = canonicalSha256V1({ schema: 'atlas.centroid-vector.v1', vector: payload.vector });
	if (vectorChecksum !== artifact.vectorChecksum) return { matches: false, reason: 'VECTOR_CHECKSUM_MISMATCH' };
	const sortedMemberIds = [...new Set(payload.memberIds)].sort((a, b) => a.localeCompare(b, 'en'));
	const memberSetChecksum = canonicalSha256V1({ schema: 'atlas.centroid-member-set.v1', memberIds: sortedMemberIds });
	if (memberSetChecksum !== artifact.memberSetChecksum) return { matches: false, reason: 'MEMBER_SET_CHECKSUM_MISMATCH' };
	return { matches: true };
}
