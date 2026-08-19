import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureMatrix } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import { mergeGraphEvidenceIntoCandidate } from './graph-retrieval-feature-evidence.js';

const lineage = {
	graphRevision: 'graph-r1',
	projectionRevision: 'projection-r1',
	projectionHash: 'projection-hash-r1',
	projectionName: 'atlas_dependency_v1',
};

const evidence = {
	schema: 'atlas.graph-retrieval-feature-evidence.v1',
	canonicalId: 'canonical:a',
	packetKey: 'packet:a',
	...lineage,
	authorityNorm: 0.9,
	graphDistance: 2,
	dependencyFanout: 8,
	evidenceRefs: ['pagerank:run-1', 'fanout:request-1'],
	producerRevision: 'graph-feature-v1',
};

describe('graph retrieval feature evidence', () => {
	it('fills the existing authority/distance/fanout matrix slots without changing width', () => {
		const candidate = mergeGraphEvidenceIntoCandidate(
			{ packet_key: 'packet:a', semantic_similarity_768: 0.8 },
			evidence,
			lineage,
		);
		const matrix = buildCandidateFeatureMatrix([candidate]);
		expect(matrix.feature_count).toBe(25);
		expect(matrix.candidate_features[4]).toBeCloseTo(0.9);
		expect(matrix.candidate_features[19]).toBe(2);
		expect(matrix.candidate_features[21]).toBe(8);
		expect(matrix.presence_mask[4]).toBe(1);
		expect(matrix.presence_mask[19]).toBe(1);
		expect(matrix.presence_mask[21]).toBe(1);
	});

	it('rejects stale projection lineage', () => {
		expect(() => mergeGraphEvidenceIntoCandidate(
			{ packet_key: 'packet:a' },
			{ ...evidence, projectionHash: 'stale' },
			lineage,
		)).toThrow(/projectionHash mismatch/);
	});

	it('rejects identity mismatch instead of inventing a packet key', () => {
		expect(() => mergeGraphEvidenceIntoCandidate(
			{ packet_key: 'packet:b' },
			evidence,
			lineage,
		)).toThrow(/packet_key mismatch/);
	});
});
