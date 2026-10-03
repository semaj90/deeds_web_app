import { describe, expect, it } from 'vitest';
import { assertStageCacheKeyV1, buildStageCacheKeyV1 } from './stage-cache-key-v1.js';

const UPSTREAM = 'a'.repeat(64);

describe('buildStageCacheKeyV1', () => {
	it('is deterministic: same input produces the same key', () => {
		const a = buildStageCacheKeyV1({ stage: 'keywordRecognition', upstreamChecksum: UPSTREAM, revisionFields: { vocabularyRevision: 'v1', normalizationRevision: 'n1' } });
		const b = buildStageCacheKeyV1({ stage: 'keywordRecognition', upstreamChecksum: UPSTREAM, revisionFields: { normalizationRevision: 'n1', vocabularyRevision: 'v1' } });
		expect(a.cacheKey).toBe(b.cacheKey);
		expect(a.checksum).toBe(b.checksum);
	});

	it('is revision-sensitive: a changed revision field changes the key', () => {
		const a = buildStageCacheKeyV1({ stage: 'helperEligibility', upstreamChecksum: UPSTREAM, revisionFields: { helperRegistryRevision: 'r1' } });
		const b = buildStageCacheKeyV1({ stage: 'helperEligibility', upstreamChecksum: UPSTREAM, revisionFields: { helperRegistryRevision: 'r2' } });
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it('keeps stages independent: the same revision fields under different stages produce different keys', () => {
		const a = buildStageCacheKeyV1({ stage: 'classification', upstreamChecksum: UPSTREAM, revisionFields: { classifierRevision: 'c1' } });
		const b = buildStageCacheKeyV1({ stage: 'retrievalPlan', upstreamChecksum: UPSTREAM, revisionFields: { classifierRevision: 'c1' } });
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});

	it('rejects an empty revisionFields map', () => {
		expect(() => buildStageCacheKeyV1({ stage: 'queryExpansion', upstreamChecksum: UPSTREAM, revisionFields: {} })).toThrow(/STAGE_CACHE_KEY_REQUIRES_REVISION_FIELDS/);
	});

	it('round-trips through assertStageCacheKeyV1 and detects a tampered cacheKey', () => {
		const key = buildStageCacheKeyV1({ stage: 'retrievalPlan', upstreamChecksum: UPSTREAM, revisionFields: { producerRevision: 'p1' } });
		expect(assertStageCacheKeyV1(key)).toEqual(key);
		expect(() => assertStageCacheKeyV1({ ...key, cacheKey: 'tampered' })).toThrow(/CHECKSUM_MISMATCH/);
	});
});
