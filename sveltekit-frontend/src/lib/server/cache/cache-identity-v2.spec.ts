import { describe, expect, it } from 'vitest';

import {
	buildCacheIdentityV2,
	hashFloat32VectorV2,
	hashTextV2,
	hashTokenIdsV2
} from './cache-identity-v2.js';

describe('CacheIdentityV2', () => {
	it('changes identity when any exact embedding coordinate changes', () => {
		const a = Array.from({ length: 768 }, (_, i) => i / 1000);
		const b = [...a];
		b[700] = b[700] + 0.5;
		expect(hashFloat32VectorV2(a)).not.toBe(hashFloat32VectorV2(b));
	});

	it('changes KV identity when token stream or runtime revisions change', () => {
		const tokensA = hashTokenIdsV2([1, 2, 3, 4]);
		const tokensB = hashTokenIdsV2([1, 2, 3, 5]);
		const base = buildCacheIdentityV2({
			tier: 'kv-prefix',
			kind: 'prompt-prefix',
			cacheEpoch: 4,
			payloadChecksum: tokensA,
			revisions: {
				modelRevision: 'ornith-r1',
				tokenizerRevision: 'tok-r1',
				promptTemplateRevision: 'prompt-r1',
				contextManifestChecksum: hashTextV2('manifest-a')
			}
		});
		const tokenChanged = buildCacheIdentityV2({ ...base, payloadChecksum: tokensB });
		const modelChanged = buildCacheIdentityV2({
			...base,
			payloadChecksum: tokensA,
			revisions: { ...base.revisions, modelRevision: 'ornith-r2' }
		});
		expect(tokenChanged.identityChecksum).not.toBe(base.identityChecksum);
		expect(modelChanged.identityChecksum).not.toBe(base.identityChecksum);
	});

	it('changes physical namespace when epoch advances', () => {
		const payloadChecksum = hashTextV2('same query');
		const e41 = buildCacheIdentityV2({ tier: 'atlas-lru', kind: 'query', cacheEpoch: 41, payloadChecksum });
		const e42 = buildCacheIdentityV2({ tier: 'atlas-lru', kind: 'query', cacheEpoch: 42, payloadChecksum });
		expect(e41.cacheKey).toContain(':e41:');
		expect(e42.cacheKey).toContain(':e42:');
		expect(e41.identityChecksum).not.toBe(e42.identityChecksum);
	});
});
