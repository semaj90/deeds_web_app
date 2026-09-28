import { describe, expect, it } from 'vitest';
import {
	assertCentroidArtifactV1,
	buildCentroidArtifactV1,
	verifyCentroidCachePayloadAgainstArtifactV1,
} from './centroid-artifact-v1.js';

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
