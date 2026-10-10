import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
	buildCentroidArtifactV1,
	buildCentroidCardV1,
	buildCentroidManifestV1,
} from '../cache/centroid-artifact-v1.js';
import {
	assertCentroidCardCandidateCrosswalkV1,
	resolveCentroidCardCandidatesV1,
} from './centroid-card-candidate-crosswalk-v1.js';

const workspaceRevision = 'workspace:r1';
const candidateSnapshotRevision = 'snapshot:r1';
const representationRevision = 'semantic_768:r1';

function fixture() {
	const ordinalMap = materializeCandidateOrdinalMap({
		workspaceRevision,
		candidateSnapshotRevision,
		producerRevision: 'candidate-map-producer:r1',
		candidates: ['a', 'b', 'c'].map((id) => ({
			canonicalId: `canonical:${id}`,
			packetKey: `packet:${id}`,
			sourceRef: `src/${id}.ts`,
			symbolVersionId: `symbol:${id}:r1`,
			treeNodeId: null,
			workspaceRevision,
			sourceRevision: `sha256:${id.repeat(64)}`,
			graphRevision: null,
			semanticRevision: null,
			degradedIdentity: false,
			evidenceRefs: [],
			representationBindings: [],
		})),
	});
	const members = ordinalMap.candidates.map((candidate) => candidate.canonicalId);
	const artifacts = [0, 1].map((cluster) => buildCentroidArtifactV1({
		centroidId: `centroid:${cluster}`,
		workspaceRevision,
		representationRevision,
		clusteringRevision: 'clustering:r1',
		vector: [1, cluster + 1],
		memberIds: members.slice(0, 2),
		artifactRef: `artifact:${cluster}`,
	}));
	const manifest = buildCentroidManifestV1({
		workspaceRevision,
		candidateSnapshotRevision,
		representationRevision,
		ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
		clusteringPassId: 'pass:r1',
		algorithmRevision: 'kmeans:r1',
		parametersChecksum: 'd'.repeat(64),
		candidateCount: ordinalMap.rowCount,
		centroids: artifacts.map((artifact) => ({
			centroidId: artifact.centroidId,
			artifactRef: artifact.artifactRef,
			artifactChecksum: artifact.checksum,
			memberCount: artifact.memberCount,
			memberSetChecksum: artifact.memberSetChecksum,
		})),
		memberAssignmentChecksum: 'e'.repeat(64),
	});
	const card = buildCentroidCardV1({
		centroidId: 'centroid:0',
		clusteringPassId: manifest.clusteringPassId,
		workspaceRevision,
		candidateSnapshotRevision,
		representationRevision,
		ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
		candidateCount: ordinalMap.rowCount,
		clusterSize: 2,
		exemplarOrdinals: [0, 2],
		domainHints: ['code'],
		conceptHints: ['symbols'],
		centroidArtifactRef: artifacts[0].artifactRef,
		centroidArtifactChecksum: artifacts[0].checksum,
	});
	return { ordinalMap, manifest, card };
}

describe('resolveCentroidCardCandidatesV1', () => {
	it('resolves only the card exemplar ordinals through the exact frozen candidate map', () => {
		const input = fixture();
		const result = resolveCentroidCardCandidatesV1(input);
		expect(result.candidates.map((candidate) => candidate.canonicalId)).toEqual(['canonical:a', 'canonical:c']);
		expect(result.evidenceStatus).toBe('UNVERIFIED');
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
		expect(assertCentroidCardCandidateCrosswalkV1(JSON.parse(JSON.stringify(result)))).toEqual(result);
		expect(() => assertCentroidCardCandidateCrosswalkV1({ ...result, centroidId: 'tampered' })).toThrow(/CROSSWALK_CHECKSUM_MISMATCH/);
	});

	it('rejects snapshot, workspace, ordinal checksum, and row-count mismatches', () => {
		const input = fixture();
		expect(() => resolveCentroidCardCandidatesV1({
			...input,
			ordinalMap: { ...input.ordinalMap, workspaceRevision: 'workspace:r2' },
		})).toThrow(/WORKSPACE_REVISION_MISMATCH/);
		expect(() => resolveCentroidCardCandidatesV1({
			...input,
			ordinalMap: { ...input.ordinalMap, candidateSnapshotRevision: 'snapshot:r2' },
		})).toThrow(/SNAPSHOT_REVISION_MISMATCH/);
		expect(() => resolveCentroidCardCandidatesV1({
			...input,
			ordinalMap: { ...input.ordinalMap, ordinalMapChecksum: 'f'.repeat(64) },
		})).toThrow(/CHECKSUM_MISMATCH/);
		expect(() => resolveCentroidCardCandidatesV1({
			...input,
			manifest: { ...input.manifest, candidateCount: input.manifest.candidateCount + 1 },
		})).toThrow(/CHECKSUM_MISMATCH/);
	});

	it('rejects a tampered centroid card or a stale card-to-manifest binding', () => {
		const input = fixture();
		expect(() => resolveCentroidCardCandidatesV1({
			...input,
			card: { ...input.card, exemplarOrdinals: [1] },
		})).toThrow(/CHECKSUM_MISMATCH/);
		expect(() => resolveCentroidCardCandidatesV1({
			...input,
			card: { ...input.card, centroidId: 'centroid:1' },
		})).toThrow(/CHECKSUM_MISMATCH/);
	});
});
