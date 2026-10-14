import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createMultiVectorCollection,
	hybridSearch,
	searchByContentEmbedding,
	updateMultiVectors,
} from './qdrant-multivector-schema.js';

describe('retired 384-D multivector adapter', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('rejects collection creation before any HTTP request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		for (const collection of ['codebase_chunks_384_hybrid', 'codebase_chunks_768', 'other']) {
			await expect(createMultiVectorCollection('http://127.0.0.1:6333', collection)).rejects.toThrow(
				'LEGACY_384_MULTIVECTOR_WRITE_DISABLED'
			);
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects vector updates before any HTTP request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			updateMultiVectors('http://127.0.0.1:6333', 'codebase_chunks_384_hybrid', 'point-1', {
				content_embedding: new Array(384).fill(0),
			})
		).rejects.toThrow('LEGACY_384_MULTIVECTOR_WRITE_DISABLED');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects direct content and hybrid search before any HTTP request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			searchByContentEmbedding('http://127.0.0.1:6333', 'codebase_chunks_384_hybrid', new Array(384).fill(0))
		).rejects.toThrow('LEGACY_384_MULTIVECTOR_SEARCH_DISABLED');
		await expect(
			hybridSearch('http://127.0.0.1:6333', 'codebase_chunks_384_hybrid', new Array(384).fill(0))
		).rejects.toThrow('LEGACY_384_MULTIVECTOR_SEARCH_DISABLED');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
