import { describe, expect, it } from 'vitest';

import { buildPrefixCacheIdentityV2 } from './bifrost-cache-manager.js';

const base = {
	tokenIds: [1, 2, 3, 4],
	modelRevision: 'ornith-r1',
	tokenizerRevision: 'tok-r1',
	promptTemplateRevision: 'prompt-r1',
	contextManifestChecksum: 'manifest-r1'
} as const;

describe('buildPrefixCacheIdentityV2', () => {
	it('is deterministic for exact replay', () => {
		expect(buildPrefixCacheIdentityV2(base)).toBe(buildPrefixCacheIdentityV2(base));
	});

	it('changes when exact token IDs change', () => {
		expect(buildPrefixCacheIdentityV2(base)).not.toBe(
			buildPrefixCacheIdentityV2({ ...base, tokenIds: [1, 2, 3, 5] })
		);
	});

	it('changes when runtime identity changes', () => {
		const original = buildPrefixCacheIdentityV2(base);
		expect(buildPrefixCacheIdentityV2({ ...base, modelRevision: 'ornith-r2' })).not.toBe(original);
		expect(buildPrefixCacheIdentityV2({ ...base, tokenizerRevision: 'tok-r2' })).not.toBe(original);
		expect(buildPrefixCacheIdentityV2({ ...base, promptTemplateRevision: 'prompt-r2' })).not.toBe(original);
		expect(buildPrefixCacheIdentityV2({ ...base, adapterRevision: 'adapter-r1' })).not.toBe(original);
		expect(buildPrefixCacheIdentityV2({ ...base, cacheSalt: 'tenant-a' })).not.toBe(original);
	});
});
