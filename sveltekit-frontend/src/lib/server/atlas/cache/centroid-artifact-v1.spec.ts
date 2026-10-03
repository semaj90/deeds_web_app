import { describe, expect, it } from 'vitest';
import {
	assertCentroidCardV1,
	assertCentroidArtifactV1,
	assertCentroidManifestV1,
	buildCentroidArtifactV1,
	buildCentroidCardV1,
	buildCentroidManifestV1,
	verifyCentroidCardAgainstManifestV1,
	verifyCentroidCachePayloadAgainstArtifactV1,
} from './centroid-artifact-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const VECTOR = [0.1, 0.2, 0.3, 0.4];
const MEMBERS = ['pkt:1', 'pkt:2', 'pkt:3'];

function build() {
	return buildCentroidArtifactV1({
		centroidId: 'centroid:feature:auth.sessions',
		workspaceRevision: 'workspace:r1',
		representationRevision: 'semantic_768:r1',
		clusteringRevision: 'kmeans:2026-09-27',
		vector: VECTOR,
		memberIds: MEMBERS,
		artifactRef: 'postgres:gpu_cluster_centroids:42',
	});
}

describe('buildCentroidArtifactV1', () => {
	it('is deterministic and dimension/member-count correct', () => {
		const artifact = build();
		expect(artifact.dimensions).toBe(4);
		expect(artifact.memberCount).toBe(3);
		expect(build().checksum).toBe(artifact.checksum);
	});

	it('member-set checksum is order-independent (member order in input does not matter)', () => {
		const a = buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: VECTOR, memberIds: ['a', 'b', 'c'], artifactRef: 'ref' });
		const b = buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: VECTOR, memberIds: ['c', 'a', 'b'], artifactRef: 'ref' });
		expect(a.memberSetChecksum).toBe(b.memberSetChecksum);
		expect(a.checksum).toBe(b.checksum);
	});

	it('vector checksum IS order-sensitive (component order matters)', () => {
		const a = buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: [1, 2, 3], memberIds: MEMBERS, artifactRef: 'ref' });
		const b = buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: [3, 2, 1], memberIds: MEMBERS, artifactRef: 'ref' });
		expect(a.vectorChecksum).not.toBe(b.vectorChecksum);
	});

	it('rejects an empty vector, duplicate members, non-finite components, and empty member sets', () => {
		expect(() => buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: [], memberIds: MEMBERS, artifactRef: 'ref' })).toThrow(/CENTROID_VECTOR_MUST_BE_NON_EMPTY/);
		expect(() => buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: VECTOR, memberIds: ['a', 'a'], artifactRef: 'ref' })).toThrow(/DUPLICATE_MEMBER_ID/);
		expect(() => buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: [1, Number.NaN], memberIds: MEMBERS, artifactRef: 'ref' })).toThrow(/NON_FINITE_COMPONENT/);
		expect(() => buildCentroidArtifactV1({ centroidId: 'c1', workspaceRevision: 'w1', representationRevision: 'r1', clusteringRevision: 'k1', vector: VECTOR, memberIds: [], artifactRef: 'ref' })).toThrow(/REQUIRES_AT_LEAST_ONE_MEMBER/);
	});
});

describe('assertCentroidArtifactV1', () => {
	it('round-trips and detects a tampered checksum', () => {
		const artifact = build();
		expect(assertCentroidArtifactV1(artifact)).toEqual(artifact);
		expect(() => assertCentroidArtifactV1({ ...artifact, artifactRef: 'tampered' })).toThrow(/CHECKSUM_MISMATCH/);
	});
});

describe('verifyCentroidCachePayloadAgainstArtifactV1', () => {
	it('matches an identical rewarmed payload (order-independent members)', () => {
		const artifact = build();
		const result = verifyCentroidCachePayloadAgainstArtifactV1(artifact, { vector: VECTOR, memberIds: [...MEMBERS].reverse() });
		expect(result).toEqual({ matches: true });
	});

	it('detects a CACHE_MISS-shaped divergence: dimension, vector, and member-set mismatches are each distinguishable', () => {
		const artifact = build();
		expect(verifyCentroidCachePayloadAgainstArtifactV1(artifact, { vector: [1, 2], memberIds: MEMBERS })).toEqual({ matches: false, reason: expect.stringContaining('DIMENSION_MISMATCH') });
		expect(verifyCentroidCachePayloadAgainstArtifactV1(artifact, { vector: [9, 9, 9, 9], memberIds: MEMBERS })).toEqual({ matches: false, reason: 'VECTOR_CHECKSUM_MISMATCH' });
		expect(verifyCentroidCachePayloadAgainstArtifactV1(artifact, { vector: VECTOR, memberIds: ['pkt:99'] })).toEqual({ matches: false, reason: 'MEMBER_SET_CHECKSUM_MISMATCH' });
	});
});

describe('CentroidManifestV1', () => {
	function buildManifest() {
		const artifactChecksum = 'a'.repeat(64);
		const memberSetChecksum = 'b'.repeat(64);
		return buildCentroidManifestV1({
			workspaceRevision: 'workspace:r1',
			candidateSnapshotRevision: 'snapshot:r1',
			representationRevision: 'semantic_768:r1',
			ordinalMapChecksum: 'c'.repeat(64),
			clusteringPassId: 'pass:kmeans:r1',
			algorithmRevision: 'cuvs-kmeans:r1',
			parametersChecksum: 'd'.repeat(64),
			candidateCount: 8,
			centroids: [
				{ centroidId: 'centroid:b', artifactRef: 'file:b', artifactChecksum, memberCount: 4, memberSetChecksum },
				{ centroidId: 'centroid:a', artifactRef: 'file:a', artifactChecksum, memberCount: 4, memberSetChecksum },
			],
			memberAssignmentChecksum: 'e'.repeat(64),
		});
	}

	it('seals deterministically and canonicalizes centroid order without claiming authority', () => {
		const manifest = buildManifest();
		expect(buildManifest()).toEqual(manifest);
		expect(manifest.centroids.map(({ centroidId }) => centroidId)).toEqual(['centroid:a', 'centroid:b']);
		expect(manifest.canonicalAuthority).toBe(false);
		expect(assertCentroidManifestV1(manifest)).toEqual(manifest);
	});

	it('binds payload checksum to candidate snapshot, ordinal map, assignments, and artifact refs', () => {
		const manifest = buildManifest();
		expect(manifest.payloadChecksum).toBe(canonicalSha256V1({
			schema: 'atlas.centroid-manifest-payload.v1',
			candidateSnapshotRevision: manifest.candidateSnapshotRevision,
			ordinalMapChecksum: manifest.ordinalMapChecksum,
			centroids: manifest.centroids,
			memberAssignmentChecksum: manifest.memberAssignmentChecksum,
		}));
		expect(() => assertCentroidManifestV1({ ...manifest, candidateSnapshotRevision: 'snapshot:r2' })).toThrow(/CHECKSUM_MISMATCH/);
		expect(() => buildCentroidManifestV1({ ...manifest, centroids: [...manifest.centroids, manifest.centroids[0]] })).toThrow(/DUPLICATE_CENTROID_ID/);
	});
});

describe('CentroidCardV1', () => {
	function buildCard() {
		return buildCentroidCardV1({
			centroidId: 'centroid:a',
			clusteringPassId: 'pass:kmeans:r1',
			workspaceRevision: 'workspace:r1',
			candidateSnapshotRevision: 'snapshot:r1',
			representationRevision: 'semantic_768:r1',
			ordinalMapChecksum: 'a'.repeat(64),
			candidateCount: 8,
			clusterSize: 4,
			exemplarOrdinals: [7, 2],
			domainHints: ['payments', 'auth'],
			conceptHints: ['session', 'token'],
			centroidArtifactRef: 'file:centroid:a',
			centroidArtifactChecksum: 'b'.repeat(64),
		});
	}

	it('seals deterministic routing cards with revision-qualified ordinal hints only', () => {
		const card = buildCard();
		expect(buildCard()).toEqual(card);
		expect(card.exemplarOrdinals).toEqual([2, 7]);
		expect(card.domainHints).toEqual(['auth', 'payments']);
		expect(card.conceptHints).toEqual(['session', 'token']);
		expect(card.canonicalAuthority).toBe(false);
		expect(assertCentroidCardV1(card)).toEqual(card);
	});

	it('rejects out-of-snapshot ordinals, duplicate exemplars, and oversized clusters', () => {
		const card = buildCard();
		expect(() => buildCentroidCardV1({ ...card, exemplarOrdinals: [8] })).toThrow(/ORDINAL_OUT_OF_RANGE/);
		expect(() => buildCentroidCardV1({ ...card, exemplarOrdinals: [2, 2] })).toThrow(/DUPLICATE_CENTROID_EXEMPLAR/);
		expect(() => buildCentroidCardV1({ ...card, clusterSize: 9 })).toThrow(/CLUSTER_SIZE_EXCEEDS/);
		expect(() => assertCentroidCardV1({ ...card, checksum: 'c'.repeat(64), canonicalAuthority: true } as never)).toThrow();
	});

	it('requires exact snapshot, ordinal-map, and centroid artifact parity with its manifest', () => {
		const card = buildCard();
		const manifest = buildCentroidManifestV1({
			workspaceRevision: card.workspaceRevision,
			candidateSnapshotRevision: card.candidateSnapshotRevision,
			representationRevision: card.representationRevision,
			ordinalMapChecksum: card.ordinalMapChecksum,
			clusteringPassId: card.clusteringPassId,
			algorithmRevision: 'cuvs-kmeans:r1',
			parametersChecksum: 'c'.repeat(64),
			candidateCount: card.candidateCount,
			centroids: [{
				centroidId: card.centroidId,
				artifactRef: card.centroidArtifactRef,
				artifactChecksum: card.centroidArtifactChecksum,
				memberCount: card.clusterSize,
				memberSetChecksum: 'd'.repeat(64),
			}],
			memberAssignmentChecksum: 'e'.repeat(64),
		});
		expect(verifyCentroidCardAgainstManifestV1(card, manifest)).toEqual({ matches: true });
		const mismatchedCard = buildCentroidCardV1({ ...card, ordinalMapChecksum: 'f'.repeat(64) });
		expect(verifyCentroidCardAgainstManifestV1(mismatchedCard, manifest)).toEqual({
			matches: false,
			reason: 'CENTROID_CARD_MANIFEST_REVISION_MISMATCH',
		});
	});
});
