import { describe, expect, it } from 'vitest';
import { ClientInferenceCacheEntryV1Schema } from './client-inference-cache-entry-v1.js';

const sha = `sha256:${'a'.repeat(64)}`;
const validEntry = () => ({
	schema: 'atlas.client-inference-cache-entry.v1',
	schemaVersion: 1,
	cacheKey: sha,
	model: { id: 'preview-model', revision: 'model:sha256:abc' },
	representation: { id: 'preview-text', revision: 'preview-policy:v1' },
	tokenizer: { id: 'preview-tokenizer', revision: 'tokenizer:v1' },
	inputChecksum: sha,
	previewText: 'bounded result',
	previewChecksum: sha,
	createdAt: '2026-09-27T10:00:00.000Z',
	expiresAt: '2026-09-27T10:30:00.000Z',
	canonicalAuthority: false,
});

describe('ClientInferenceCacheEntryV1', () => {
	it('admits a revision-bound, checksummed preview with a bounded TTL', () => {
		expect(ClientInferenceCacheEntryV1Schema.parse(validEntry())).toMatchObject({
			schemaVersion: 1,
			canonicalAuthority: false,
		});
	});

	it('rejects missing revisions, malformed checksums, and canonical authority', () => {
		const missingRevision = validEntry();
		missingRevision.model.revision = '';
		expect(ClientInferenceCacheEntryV1Schema.safeParse(missingRevision).success).toBe(false);

		const malformedChecksum = validEntry();
		malformedChecksum.inputChecksum = 'not-a-digest';
		expect(ClientInferenceCacheEntryV1Schema.safeParse(malformedChecksum).success).toBe(false);

		const canonical = validEntry();
		canonical.canonicalAuthority = true;
		expect(ClientInferenceCacheEntryV1Schema.safeParse(canonical).success).toBe(false);
	});

	it('rejects expired, overlong-TTL, oversized, and non-preview payload fields', () => {
		const expired = validEntry();
		expired.expiresAt = expired.createdAt;
		expect(ClientInferenceCacheEntryV1Schema.safeParse(expired).success).toBe(false);

		const longTtl = validEntry();
		longTtl.expiresAt = '2026-09-29T10:00:00.000Z';
		expect(ClientInferenceCacheEntryV1Schema.safeParse(longTtl).success).toBe(false);

		const oversized = validEntry();
		oversized.previewText = 'x'.repeat(8_001);
		expect(ClientInferenceCacheEntryV1Schema.safeParse(oversized).success).toBe(false);

		expect(ClientInferenceCacheEntryV1Schema.safeParse({ ...validEntry(), hiddenThoughts: 'forbidden' }).success).toBe(false);
		expect(ClientInferenceCacheEntryV1Schema.safeParse({ ...validEntry(), kv_cache: 'forbidden' }).success).toBe(false);
		expect(ClientInferenceCacheEntryV1Schema.safeParse({ ...validEntry(), tensor: [] }).success).toBe(false);
		expect(ClientInferenceCacheEntryV1Schema.safeParse({ ...validEntry(), embedding: [] }).success).toBe(false);
	});

	it('cannot carry canonical identity, ordinal, vector, or promotion authority', () => {
		for (const field of ['canonicalId', 'candidateOrdinal', 'vector', 'ontologyTuple', 'promotionEligible']) {
			expect(ClientInferenceCacheEntryV1Schema.safeParse({
				...validEntry(), [field]: field === 'candidateOrdinal' ? 7 : 'forbidden',
			}).success).toBe(false);
		}
	});
});
