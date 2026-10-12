import { describe, expect, it } from 'vitest';
import { iterateSimilarityChunks } from './libtorch-bridge.js';

describe('iterateSimilarityChunks', () => {
	it('yields bounded chunks in stable input order', () => {
		const values = Array.from({ length: 1_001 }, (_, index) => index);
		const chunks = Array.from(iterateSimilarityChunks(values));

		expect(chunks.map(({ start, rows }) => [start, rows.length])).toEqual([
			[0, 500],
			[500, 500],
			[1_000, 1],
		]);
		expect(chunks.flatMap(({ rows }) => rows)).toEqual(values);
	});

	it('rejects invalid chunk sizes', () => {
		expect(() => Array.from(iterateSimilarityChunks([1], 0))).toThrow('SIMILARITY_CHUNK_SIZE_INVALID');
		expect(() => Array.from(iterateSimilarityChunks([1], 1.5))).toThrow('SIMILARITY_CHUNK_SIZE_INVALID');
	});
});
