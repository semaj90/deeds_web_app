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

export const CENTROID_MANIFEST_SCHEMA_V1 = 'atlas.centroid-manifest.v1' as const;
export const CENTROID_CARD_SCHEMA_V1 = 'atlas.centroid-card.v1' as const;

const CentroidManifestEntryV1Schema = z.object({
	centroidId: z.string().min(1),
	artifactRef: z.string().min(1),
	artifactChecksum: sha256HexSchema,
	memberCount: z.number().int().positive(),
	memberSetChecksum: sha256HexSchema,
}).strict();

export const CentroidManifestV1Schema = z.object({
	schema: z.literal(CENTROID_MANIFEST_SCHEMA_V1),
	workspaceRevision: z.string().min(1),
	candidateSnapshotRevision: z.string().min(1),
	representationRevision: z.string().min(1),
	ordinalMapChecksum: sha256HexSchema,
	clusteringPassId: z.string().min(1),
	algorithmRevision: z.string().min(1),
	parametersChecksum: sha256HexSchema,
	candidateCount: z.number().int().positive(),
	centroids: z.array(CentroidManifestEntryV1Schema).min(1),
	memberAssignmentChecksum: sha256HexSchema,
	payloadChecksum: sha256HexSchema,
	checksum: sha256HexSchema,
	canonicalAuthority: z.literal(false),
}).strict();
export type CentroidManifestV1 = z.infer<typeof CentroidManifestV1Schema>;

export const CentroidCardV1Schema = z.object({
	schema: z.literal(CENTROID_CARD_SCHEMA_V1),
	centroidId: z.string().min(1),
	clusteringPassId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	candidateSnapshotRevision: z.string().min(1),
	representationRevision: z.string().min(1),
	ordinalMapChecksum: sha256HexSchema,
	candidateCount: z.number().int().positive(),
	clusterSize: z.number().int().positive(),
	exemplarOrdinals: z.array(z.number().int().nonnegative()).min(1),
	domainHints: z.array(z.string().min(1)),
	conceptHints: z.array(z.string().min(1)),
	centroidArtifactRef: z.string().min(1),
	centroidArtifactChecksum: sha256HexSchema,
	checksum: sha256HexSchema,
	canonicalAuthority: z.literal(false),
}).strict();
export type CentroidCardV1 = z.infer<typeof CentroidCardV1Schema>;

function assertUniqueStrings(values: readonly string[], errorCode: string): void {
	if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
		throw new Error(errorCode);
	}
}

export function buildCentroidManifestV1(input: Omit<CentroidManifestV1, 'schema' | 'payloadChecksum' | 'checksum' | 'canonicalAuthority'>): CentroidManifestV1 {
	assertUniqueStrings(input.centroids.map((centroid) => centroid.centroidId), 'DUPLICATE_CENTROID_ID');
	const centroids = [...input.centroids].sort((left, right) => left.centroidId.localeCompare(right.centroidId, 'en'));
	const payloadChecksum = canonicalSha256V1({
		schema: 'atlas.centroid-manifest-payload.v1',
		candidateSnapshotRevision: input.candidateSnapshotRevision,
		ordinalMapChecksum: input.ordinalMapChecksum,
		centroids,
		memberAssignmentChecksum: input.memberAssignmentChecksum,
	});
	const body = {
		schema: CENTROID_MANIFEST_SCHEMA_V1,
		workspaceRevision: input.workspaceRevision,
		candidateSnapshotRevision: input.candidateSnapshotRevision,
		representationRevision: input.representationRevision,
		ordinalMapChecksum: input.ordinalMapChecksum,
		clusteringPassId: input.clusteringPassId,
		algorithmRevision: input.algorithmRevision,
		parametersChecksum: input.parametersChecksum,
		candidateCount: input.candidateCount,
		centroids,
		memberAssignmentChecksum: input.memberAssignmentChecksum,
		payloadChecksum,
		canonicalAuthority: false as const,
	};
	return CentroidManifestV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function assertCentroidManifestV1(value: CentroidManifestV1): CentroidManifestV1 {
	const manifest = CentroidManifestV1Schema.parse(value);
	const { checksum, ...body } = manifest;
	if (canonicalSha256V1(body) !== checksum) throw new Error('CENTROID_MANIFEST_CHECKSUM_MISMATCH');
	const expectedPayloadChecksum = canonicalSha256V1({
		schema: 'atlas.centroid-manifest-payload.v1',
		candidateSnapshotRevision: manifest.candidateSnapshotRevision,
		ordinalMapChecksum: manifest.ordinalMapChecksum,
		centroids: manifest.centroids,
		memberAssignmentChecksum: manifest.memberAssignmentChecksum,
	});
	if (manifest.payloadChecksum !== expectedPayloadChecksum) throw new Error('CENTROID_MANIFEST_PAYLOAD_CHECKSUM_MISMATCH');
	assertUniqueStrings(manifest.centroids.map((centroid) => centroid.centroidId), 'DUPLICATE_CENTROID_ID');
	return manifest;
}

export function verifyCentroidCardAgainstManifestV1(
	card: CentroidCardV1,
	manifest: CentroidManifestV1,
): { matches: true } | { matches: false; reason: string } {
	assertCentroidCardV1(card);
	assertCentroidManifestV1(manifest);
	if (
		card.workspaceRevision !== manifest.workspaceRevision ||
		card.candidateSnapshotRevision !== manifest.candidateSnapshotRevision ||
		card.representationRevision !== manifest.representationRevision ||
		card.ordinalMapChecksum !== manifest.ordinalMapChecksum ||
		card.clusteringPassId !== manifest.clusteringPassId ||
		card.candidateCount !== manifest.candidateCount
	) return { matches: false, reason: 'CENTROID_CARD_MANIFEST_REVISION_MISMATCH' };
	const entry = manifest.centroids.find((centroid) => centroid.centroidId === card.centroidId);
	if (!entry) return { matches: false, reason: 'CENTROID_CARD_NOT_IN_MANIFEST' };
	if (
		entry.artifactRef !== card.centroidArtifactRef ||
		entry.artifactChecksum !== card.centroidArtifactChecksum ||
		entry.memberCount !== card.clusterSize
	) return { matches: false, reason: 'CENTROID_CARD_ARTIFACT_MISMATCH' };
	return { matches: true };
}

export function buildCentroidCardV1(input: Omit<CentroidCardV1, 'schema' | 'checksum' | 'canonicalAuthority'>): CentroidCardV1 {
	if (input.clusterSize > input.candidateCount) throw new Error('CENTROID_CLUSTER_SIZE_EXCEEDS_CANDIDATE_COUNT');
	if (input.exemplarOrdinals.some((ordinal) => ordinal >= input.candidateCount)) {
		throw new Error('CENTROID_EXEMPLAR_ORDINAL_OUT_OF_RANGE');
	}
	if (new Set(input.exemplarOrdinals).size !== input.exemplarOrdinals.length) {
		throw new Error('DUPLICATE_CENTROID_EXEMPLAR_ORDINAL');
	}
	assertUniqueStrings(input.domainHints, 'INVALID_CENTROID_DOMAIN_HINTS');
	assertUniqueStrings(input.conceptHints, 'INVALID_CENTROID_CONCEPT_HINTS');
	const body = {
		schema: CENTROID_CARD_SCHEMA_V1,
		centroidId: input.centroidId,
		clusteringPassId: input.clusteringPassId,
		workspaceRevision: input.workspaceRevision,
		candidateSnapshotRevision: input.candidateSnapshotRevision,
		representationRevision: input.representationRevision,
		ordinalMapChecksum: input.ordinalMapChecksum,
		candidateCount: input.candidateCount,
		clusterSize: input.clusterSize,
		exemplarOrdinals: [...input.exemplarOrdinals].sort((left, right) => left - right),
		domainHints: [...input.domainHints].sort((left, right) => left.localeCompare(right, 'en')),
		conceptHints: [...input.conceptHints].sort((left, right) => left.localeCompare(right, 'en')),
		centroidArtifactRef: input.centroidArtifactRef,
		centroidArtifactChecksum: input.centroidArtifactChecksum,
		canonicalAuthority: false as const,
	};
	return CentroidCardV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function assertCentroidCardV1(value: CentroidCardV1): CentroidCardV1 {
	const card = CentroidCardV1Schema.parse(value);
	const { checksum, ...body } = card;
	if (canonicalSha256V1(body) !== checksum) throw new Error('CENTROID_CARD_CHECKSUM_MISMATCH');
	if (card.clusterSize > card.candidateCount) throw new Error('CENTROID_CLUSTER_SIZE_EXCEEDS_CANDIDATE_COUNT');
	if (card.exemplarOrdinals.some((ordinal) => ordinal >= card.candidateCount)) {
		throw new Error('CENTROID_EXEMPLAR_ORDINAL_OUT_OF_RANGE');
	}
	if (new Set(card.exemplarOrdinals).size !== card.exemplarOrdinals.length) {
		throw new Error('DUPLICATE_CENTROID_EXEMPLAR_ORDINAL');
	}
	return card;
}

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

// ── HASHCENT-02: verifiable clustering parameters (binds seed / k / executor into parametersChecksum) ──

export const CENTROID_CLUSTERING_PARAMETERS_SCHEMA_V1 = 'atlas.centroid-clustering-parameters.v1' as const;

/**
 * The manifest's `parametersChecksum` is opaque on its own. This is the parameter object whose canonical
 * hash it must equal, so `k`, `seed` and the executor (e.g. cuVS KMeans vs the CPU oracle) are bound and
 * verifiable without changing the strict manifest schema (which would alter existing manifest checksums).
 */
export const CentroidClusteringParametersV1Schema = z.object({
	schema: z.literal(CENTROID_CLUSTERING_PARAMETERS_SCHEMA_V1),
	/** Executor identity + version, e.g. `cuvs-kmeans:26.06` or `sklearn-minibatch-kmeans:<ver>`. */
	executorRevision: z.string().min(1),
	k: z.number().int().positive(),
	seed: z.number().int().nonnegative(),
	metric: z.enum(['cosine', 'l2']),
	init: z.string().min(1),
	maxIterations: z.number().int().positive(),
}).strict();
export type CentroidClusteringParametersV1 = z.infer<typeof CentroidClusteringParametersV1Schema>;

export function centroidClusteringParametersChecksumV1(parameters: CentroidClusteringParametersV1): string {
	return canonicalSha256V1(CentroidClusteringParametersV1Schema.parse(parameters));
}

/** True only when the manifest's `parametersChecksum` is the hash of exactly these parameters and `k` matches the centroid count. */
export function verifyCentroidManifestParametersV1(
	manifest: CentroidManifestV1,
	parameters: CentroidClusteringParametersV1,
): { matches: true } | { matches: false; reason: 'PARAMETERS_CHECKSUM_MISMATCH' | 'K_CENTROID_COUNT_MISMATCH' } {
	const parsed = CentroidClusteringParametersV1Schema.parse(parameters);
	if (centroidClusteringParametersChecksumV1(parsed) !== manifest.parametersChecksum) {
		return { matches: false, reason: 'PARAMETERS_CHECKSUM_MISMATCH' };
	}
	if (parsed.k !== manifest.centroids.length) return { matches: false, reason: 'K_CENTROID_COUNT_MISMATCH' };
	return { matches: true };
}
