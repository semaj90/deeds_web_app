import { describe, expect, it } from 'vitest';
import { classifyLegacyCentroidHintV1 } from './centroid-routing-hint-v1.js';

describe('classifyLegacyCentroidHintV1', () => {
	it('keeps a legacy cache hit diagnostic and unable to restrict retrieval', () => {
		expect(classifyLegacyCentroidHintV1({ clusterId: 7, similarity: 0.82, source: 'cpu-cosine' })).toEqual({
			status: 'DIAGNOSTIC_ONLY',
			reason: 'CANONICAL_CANDIDATE_MAP_REQUIRED',
			clusterId: 7,
			similarity: 0.82,
			source: 'cpu-cosine',
			canRestrictRetrieval: false,
			canonicalAuthority: false,
		});
	});

	it.each([
		[{ clusterId: -1, similarity: 0.5, source: 'cpu-cosine' }, 'INVALID_CENTROID_HINT_CLUSTER_ID'],
		[{ clusterId: 1, similarity: Number.NaN, source: 'cpu-cosine' }, 'INVALID_CENTROID_HINT_SIMILARITY'],
		[{ clusterId: 1, similarity: 1.1, source: 'cpu-cosine' }, 'INVALID_CENTROID_HINT_SIMILARITY'],
		[{ clusterId: 1, similarity: 0.5, source: ' ' }, 'INVALID_CENTROID_HINT_SOURCE'],
	] as const)('rejects malformed diagnostic input', (hint, code) => {
		expect(() => classifyLegacyCentroidHintV1(hint)).toThrow(code);
	});
});
