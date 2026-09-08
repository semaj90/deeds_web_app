import { describe, expect, it } from 'vitest';
import {
	buildGemmaRepresentationCacheKeyV1,
	canReuseGemmaRepresentationV1,
	GemmaRepresentationCacheIdentityV1Schema,
} from './gemma-representation-cache-key-v1.js';

const checksum = (value: string) => value.repeat(64).slice(0, 64);

const base = {
	schema: 'parent-atlas.gemma-representation-cache-key.v1' as const,
	representationId: 'atlas_gemma_rank_late_interaction',
	representationRevision: 'atlas-gemma-late:v1',
	modelRevision: 'gemma4-e2b-assistant:sha256:model',
	adapterRevision: null,
	tokenizerRevision: 'gemma4-tokenizer:sha256:tokenizer',
	templateRevision: 'atlas-rerank-input-template:v1',
	canonicalId: 'chunk:123',
	sourceRevision: 'source:rev-7',
	sourceContentChecksum: checksum('a'),
	featureRevision: 'features:rev-2',
	graphRevision: 'graph:rev-3',
	tokenizationPolicyRevision: 'atlas-token-select:v1',
	maxTokens: 256,
	dimension: 64 as const,
	normalizationRevision: 'late-l2:v1',
	representationChecksum: checksum('b'),
};

describe('GemmaRepresentationCacheKeyV1', () => {
	it('is deterministic and revision-qualified', () => {
		const key = buildGemmaRepresentationCacheKeyV1(base);
		expect(buildGemmaRepresentationCacheKeyV1({ ...base })).toBe(key);
		for (const change of [
			{ modelRevision: 'model:2' },
			{ adapterRevision: 'adapter:1' },
			{ tokenizerRevision: 'tokenizer:2' },
			{ templateRevision: 'template:2' },
			{ canonicalId: 'chunk:124' },
			{ sourceRevision: 'source:rev-8' },
			{ sourceContentChecksum: checksum('c') },
			{ featureRevision: 'features:rev-4' },
			{ graphRevision: 'graph:rev-4' },
			{ representationChecksum: checksum('d') },
		]) {
			expect(buildGemmaRepresentationCacheKeyV1({ ...base, ...change })).not.toBe(key);
		}
	});

	it('keeps the late-interaction dimension and representation policy in identity', () => {
		const key = buildGemmaRepresentationCacheKeyV1(base);
		expect(buildGemmaRepresentationCacheKeyV1({ ...base, dimension: 32 })).not.toBe(key);
		expect(buildGemmaRepresentationCacheKeyV1({ ...base, maxTokens: 128 })).not.toBe(key);
		expect(buildGemmaRepresentationCacheKeyV1({ ...base, normalizationRevision: 'late-l2:v2' })).not.toBe(key);
	});

	it('requires explicit nullable producer revisions and valid checksums', () => {
		expect(GemmaRepresentationCacheIdentityV1Schema.parse(base)).toEqual(base);
		expect(() => GemmaRepresentationCacheIdentityV1Schema.parse({ ...base, graphRevision: undefined })).toThrow();
		expect(() => GemmaRepresentationCacheIdentityV1Schema.parse({ ...base, sourceContentChecksum: 'not-a-sha' })).toThrow();
	});

	it('reuses only an exact proven representation receipt', () => {
		const cacheKey = buildGemmaRepresentationCacheKeyV1(base);
		const receipt = { cacheKey, representationChecksum: base.representationChecksum, status: 'PROVEN' as const };
		expect(canReuseGemmaRepresentationV1(base, receipt)).toBe(true);
		expect(canReuseGemmaRepresentationV1({ ...base, sourceRevision: 'source:rev-8' }, receipt)).toBe(false);
		expect(canReuseGemmaRepresentationV1(base, { ...receipt, representationChecksum: checksum('z') })).toBe(false);
		expect(canReuseGemmaRepresentationV1(base, { ...receipt, status: 'PARTIAL' })).toBe(false);
	});
});
