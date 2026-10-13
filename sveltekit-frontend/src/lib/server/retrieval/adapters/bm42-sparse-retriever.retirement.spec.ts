import { describe, expect, it, vi } from 'vitest';

const { getQdrantManager } = vi.hoisted(() => ({
  getQdrantManager: vi.fn(),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({ getQdrantManager }));

import { createBm42SparseRetriever } from './bm42-sparse-retriever.js';
import { createQdrantBM42Retriever } from './qdrant-bm42-retriever.js';

describe('deferred hashed-sparse compatibility adapters', () => {
  it('returns no candidates without opening Qdrant', async () => {
    const result = await createBm42SparseRetriever().retrieve({ query: 'test', limit: 5 });

    expect(result).toEqual([]);
    expect(getQdrantManager).not.toHaveBeenCalled();
  });

  it('keeps the configurable compatibility factory inert too', async () => {
    const result = await createQdrantBM42Retriever({ collection: 'codebase_chunks_384_hybrid' }).retrieve({
      query: 'test',
      limit: 5,
    });

    expect(result).toEqual([]);
    expect(getQdrantManager).not.toHaveBeenCalled();
  });
});
