import { beforeEach, describe, expect, it, vi } from 'vitest';

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('$lib/server/search/qdrant-search.js', () => ({ searchQdrantCodeStrictV1: search }));

describe('oak semantic Qdrant DAG handler', () => {
  beforeEach(() => search.mockReset());

  it('uses the exact semantic owner and preserves physical executor lineage', async () => {
    search.mockResolvedValueOnce([{ qdrant_id: 'point:1' }, { qdrant_id: 'point:2' }]);
    const { createOakDagSemanticQdrantHandlerV1 } = await import('./oak-dag-semantic-qdrant-handler-v1.js');
    const handler = createOakDagSemanticQdrantHandlerV1();
    const embedding = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
    const result = await handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { embedding, limit: 2, collection: 'codebase_chunks_768_v2' }, action: {} } as never });

    expect(handler.implementationRef).toBe('sveltekit-frontend/src/lib/server/search/qdrant-search.ts#searchQdrantCodeStrictV1');
    expect(result).toMatchObject({ executor: 'qdrant', representation: 'semantic_768', collection: 'codebase_chunks_768_v2', vectorName: 'content', writesPerformed: false });
    expect(search).toHaveBeenCalledWith(embedding, 2, { collection: 'codebase_chunks_768_v2', topoClass: undefined, exactVectorSearch: true });
  });

  it('rejects non-canonical representation dimensions and collections', async () => {
    const { createOakDagSemanticQdrantHandlerV1 } = await import('./oak-dag-semantic-qdrant-handler-v1.js');
    const handler = createOakDagSemanticQdrantHandlerV1();

    await expect(handler.run({ action: {} as never, parentResults: [], binding: { boundArguments: { embedding: [1], collection: 'codebase_chunks_768' }, action: {} } as never })).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
});
