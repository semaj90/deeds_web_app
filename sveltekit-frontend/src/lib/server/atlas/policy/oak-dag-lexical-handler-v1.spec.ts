import { beforeEach, describe, expect, it, vi } from 'vitest';

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('$lib/server/search/postgres-fts.js', () => ({ searchCodeLexicalStrictV1: search }));

describe('oak lexical DAG handler', () => {
  beforeEach(() => search.mockReset());

  it('binds the exact implementation reference and forwards typed arguments', async () => {
    search.mockResolvedValueOnce([{ stable_key: 'file:a.ts:fn' }]);
    const { createOakDagLexicalHandlerV1 } = await import('./oak-dag-lexical-handler-v1.js');
    const handler = createOakDagLexicalHandlerV1();

    expect(handler.implementationRef).toBe('sveltekit-frontend/src/lib/server/search/postgres-fts.ts#searchCodeLexicalStrictV1');
    await expect(handler.run({
      action: {} as never,
      parentResults: [],
      binding: { boundArguments: { query: 'feature_id', limit: 5 }, action: {} } as never,
    })).resolves.toEqual([{ stable_key: 'file:a.ts:fn' }]);
    expect(search).toHaveBeenCalledWith('feature_id', { limit: 5, topoClass: undefined });
  });

  it('rejects unbounded or malformed arguments before owner invocation', async () => {
    const { createOakDagLexicalHandlerV1 } = await import('./oak-dag-lexical-handler-v1.js');
    const handler = createOakDagLexicalHandlerV1();

    await expect(handler.run({
      action: {} as never,
      parentResults: [],
      binding: { boundArguments: { query: 'x', limit: 101 }, action: {} } as never,
    })).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
});
