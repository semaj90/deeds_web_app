// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getQdrantManager } = vi.hoisted(() => ({
	getQdrantManager: vi.fn(),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	getQdrantManager,
}));

import { batchSearch } from './batch-search.js';

describe('retired 384-D batch-search boundary', () => {
	beforeEach(() => {
		getQdrantManager.mockClear();
	});

	it('rejects retired codebase collections before requesting Qdrant', async () => {
		for (const collection of [
			'codebase_chunks_384',
			'codebase_chunks_384_hybrid',
			'codebase_chunks_384_v2',
		]) {
			await expect(batchSearch(collection, [{ vector: new Array(384).fill(0) }])).rejects.toThrow(
				'LEGACY_384_BATCH_SEARCH_DISABLED',
			);
		}

		expect(getQdrantManager).not.toHaveBeenCalled();
	});
});
