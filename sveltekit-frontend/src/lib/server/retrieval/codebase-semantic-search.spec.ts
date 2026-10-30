import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchQdrantCodeStrictV1 } = vi.hoisted(() => ({ searchQdrantCodeStrictV1: vi.fn() }));

vi.mock('$lib/server/search/qdrant-search.js', () => ({ searchQdrantCodeStrictV1 }));

import { QDRANT_SEMANTIC_COLLECTION } from '$lib/server/atlas/retrieval/qdrant-semantic-projection.js';
import { searchCodebaseSemanticContext } from './codebase-semantic-search.js';

describe('searchCodebaseSemanticContext', () => {
	beforeEach(() => searchQdrantCodeStrictV1.mockReset());

	it('uses canonical search results, preserves semantic ranking, and respects top-K', async () => {
		const vector = Array.from({ length: 768 }, (_, index) => index + 1);
		searchQdrantCodeStrictV1.mockResolvedValue([
			{
				stable_key: 'chunk-a',
				file_path: 'src/a.ts',
				source_ref: 'src/a.ts',
				content: 'lower-ranked source',
				semantic_score: 0.42,
				qdrant_id: 'point-a',
			},
			{
				stable_key: 'chunk-b',
				file_path: 'src/b.ts',
				source_ref: 'src/b.ts',
				content: 'higher-ranked source',
				semantic_score: 0.91,
				qdrant_id: 'point-b',
			},
		]);

		const results = await searchCodebaseSemanticContext(vector, 1);

		expect(searchQdrantCodeStrictV1).toHaveBeenCalledWith(vector, 1, { exactVectorSearch: false });
		expect(results).toEqual([{
			content: 'higher-ranked source',
			similarity: 0.91,
			documentId: `${QDRANT_SEMANTIC_COLLECTION}:chunk-b`,
			sourceId: 'src/b.ts',
		}]);
	});

	it('drops empty content and invalid scores instead of fabricating results', async () => {
		searchQdrantCodeStrictV1.mockResolvedValue([
			{ stable_key: 'empty', file_path: 'src/empty.ts', content: '', semantic_score: 0.9, qdrant_id: 'empty' },
			{ stable_key: 'invalid', file_path: 'src/invalid.ts', content: 'bad score', semantic_score: Number.NaN, qdrant_id: 'invalid' },
		]);

		expect(await searchCodebaseSemanticContext([], 5)).toEqual([]);
	});

	it('fails soft when the canonical search adapter is unavailable', async () => {
		searchQdrantCodeStrictV1.mockRejectedValue(new Error('search unavailable'));

		expect(await searchCodebaseSemanticContext([], 5)).toEqual([]);
	});
});
