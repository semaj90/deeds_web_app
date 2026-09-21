import { describe, expect, it } from 'vitest';
import {
	classifyChunkReference,
	legacyChunkIdToUuid,
	verifyResolutionKind
} from './chunk-id-conversion';

describe('chunk-id-conversion', () => {
	it('classifies raw integer chunk ids without changing their identity', () => {
		expect(classifyChunkReference('3711862720')).toEqual({
			kind: 'legacy_int',
			value: '3711862720'
		});
		expect(classifyChunkReference('cc2134d1-6721-ccec-7efe-37b7412891c3')).toEqual({
			kind: 'primary_uuid',
			value: 'cc2134d1-6721-ccec-7efe-37b7412891c3'
		});
		expect(classifyChunkReference('chunk:abc')).toEqual({
			kind: 'chunk_id',
			value: 'chunk:abc'
		});
	});

	it('fails closed instead of synthesizing UUIDs for legacy chunk ids', () => {
		expect(legacyChunkIdToUuid).toBeNull();
		expect(verifyResolutionKind({ _resolvedVia: 'chunk_id' }, 'legacy_int')).toBe(true);
		expect(verifyResolutionKind({ _resolvedVia: 'primary_uuid' }, 'legacy_int')).toBe(false);
	});
});
