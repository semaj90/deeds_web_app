import { describe, expect, it } from 'vitest';
import {
	assertCentroidCosineIndexV1,
	buildCentroidCosineIndexV1,
	type CentroidCosineVectorBindingV1,
} from './centroid-cosine-index-v1.js';
import { buildCentroidArtifactV1, buildCentroidManifestV1 } from './centroid-artifact-v1.js';

const WORKSPACE = 'workspace:r1';
const SNAPSHOT = 'snapshot:r1';
const REPRESENTATION = 'semantic_768:r1';
const ORDINAL_CHECKSUM = 'a'.repeat(64);

function fixture() {
	const vectorSpecs = [
		{ centroidId: 'centroid:a', vector: [1, 0], memberIds: ['p1'] },
		{ centroidId: 'centroid:b', vector: [0, 1], memberIds: ['p2'] },
		{ centroidId: 'centroid:c', vector: [-1, 0], memberIds: ['p3'] },
	];
	const vectors: CentroidCosineVectorBindingV1[] = vectorSpecs.map((spec) => ({
		vector: spec.vector,
		artifact: buildCentroidArtifactV1({
			centroidId: spec.centroidId,
			workspaceRevision: WORKSPACE,
			representationRevision: REPRESENTATION,
			clusteringRevision: 'kmeans:r1',
			vector: spec.vector,
			memberIds: spec.memberIds,
			artifactRef: `artifact:${spec.centroidId}`,
		}),
	}));
	const manifest = buildCentroidManifestV1({
		workspaceRevision: WORKSPACE,
		candidateSnapshotRevision: SNAPSHOT,
		representationRevision: REPRESENTATION,
		ordinalMapChecksum: ORDINAL_CHECKSUM,
		clusteringPassId: 'kmeans:r1',
		algorithmRevision: 'cpu-kmeans:r1',
		parametersChecksum: 'b'.repeat(64),
		candidateCount: 3,
		centroids: vectors.map(({ artifact }) => ({
			centroidId: artifact.centroidId,
			artifactRef: artifact.artifactRef,
			artifactChecksum: artifact.checksum,
			memberCount: artifact.memberCount,
			memberSetChecksum: artifact.memberSetChecksum,
		})),
		memberAssignmentChecksum: 'c'.repeat(64),
	});
	return { manifest, vectors };
}

function build(overrides: Partial<Parameters<typeof buildCentroidCosineIndexV1>[0]> = {}) {
	const data = fixture();
	return buildCentroidCosineIndexV1({
		manifest: data.manifest,
		queryVector: [1, 0],
		queryWorkspaceRevision: WORKSPACE,
		queryCandidateSnapshotRevision: SNAPSHOT,
		queryRepresentationRevision: REPRESENTATION,
		queryOrdinalMapChecksum: ORDINAL_CHECKSUM,
		vectors: data.vectors,
		...overrides,
	});
}

describe('Centroid cosine index v1', () => {
	it('returns deterministic cosine-ranked rows and a linked centroid dictionary', () => {
		const index = build();
		expect(index.rows.map((row) => row.centroidId)).toEqual(['centroid:a', 'centroid:b', 'centroid:c']);
		expect(index.rows.map((row) => row.cosineSimilarity)).toEqual([1, 0, -1]);
		expect(index.byCentroidId['centroid:b']).toEqual(index.rows[1]);
		expect(index).toMatchObject({
			workspaceRevision: WORKSPACE,
			candidateSnapshotRevision: SNAPSHOT,
			representationRevision: REPRESENTATION,
			ordinalMapChecksum: ORDINAL_CHECKSUM,
			canonicalAuthority: false,
			writesPerformed: false,
		});
		expect(assertCentroidCosineIndexV1(index)).toEqual(index);
	});

	it('is independent of vector binding input order', () => {
		const { vectors } = fixture();
		expect(build({ vectors: [...vectors].reverse() })).toEqual(build({ vectors }));
	});

	it.each([
		['workspace', { queryWorkspaceRevision: 'workspace:r2' }],
		['snapshot', { queryCandidateSnapshotRevision: 'snapshot:r2' }],
		['representation', { queryRepresentationRevision: 'semantic_768:r2' }],
		['ordinal map', { queryOrdinalMapChecksum: 'd'.repeat(64) }],
	] as const)('rejects stale %s lineage', (_label, override) => {
		expect(() => build(override)).toThrow(/MISMATCH/);
	});

	it('rejects incomplete, duplicate, mismatched, or tampered centroid vectors', () => {
		const { vectors } = fixture();
		expect(() => build({ vectors: vectors.slice(0, 2) })).toThrow(/INCOMPLETE/);
		expect(() => build({ vectors: [...vectors, vectors[0]!] })).toThrow(/DUPLICATE/);
		expect(() => build({ vectors: vectors.map((entry, index) => index === 0 ? { ...entry, vector: [0, 1] } : entry) })).toThrow(/VECTOR_CHECKSUM_MISMATCH/);
		const index = build();
		expect(() => assertCentroidCosineIndexV1({ ...index, candidateSnapshotRevision: 'snapshot:r2' })).toThrow(/CHECKSUM_MISMATCH/);
	});

	it('rejects non-finite, dimension-mismatched, and zero-norm vectors', () => {
		expect(() => build({ queryVector: [Number.NaN, 0] })).toThrow(/NON_FINITE/);
		expect(() => build({ queryVector: [1, 0, 0] })).toThrow(/DIMENSION_MISMATCH/);
		expect(() => build({ queryVector: [0, 0] })).toThrow(/ZERO_NORM/);
	});
});
