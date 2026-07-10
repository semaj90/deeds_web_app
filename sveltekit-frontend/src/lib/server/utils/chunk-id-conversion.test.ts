import { describe, expect, it } from 'vitest';
import {
	isRawIntChunkId,
	legacyChunkIdToUuid
} from './chunk-id-conversion';

describe('chunk-id-conversion', () => {
	it('detects raw integer chunk ids', () => {
		expect(isRawIntChunkId('3711862720')).toBe(true);
		expect(isRawIntChunkId('cc2134d1-6721-ccec-7efe-37b7412891c3')).toBe(false);
		expect(isRawIntChunkId('chunk:abc')).toBe(false);
	});

	it('derives a stable uuidv5 mapping for legacy chunk ids', () => {
		const first = legacyChunkIdToUuid('3711862720');
		const second = legacyChunkIdToUuid('3711862720');

		expect(first).toBe(second);
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	});
});
