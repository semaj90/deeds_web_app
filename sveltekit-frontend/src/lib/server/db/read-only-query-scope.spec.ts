import { describe, expect, it, vi } from 'vitest';
import { createReadOnlyQueryScope, type ReadOnlyScopedQueryClient } from './read-only-query-scope.js';

function makeClient() {
  const queries: Array<[string, unknown[] | undefined]> = [];
  const client: ReadOnlyScopedQueryClient & { queries: typeof queries } = {
    queries,
    query: vi.fn(async (queryText: string, values?: unknown[]) => {
      queries.push([queryText, values]);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return client;
}

describe('read-only query scope', () => {
  it('pins nested queries to one read-only transaction with a server-side statement timeout', async () => {
    const client = makeClient();
    const pool = { connect: vi.fn(async () => client) };
    const scope = createReadOnlyQueryScope(pool);

    await expect(scope.run(2000, async () => {
      expect(scope.currentClient()).toBe(client);
      await scope.currentClient()?.query('SELECT bounded_read');
      return 'read-complete';
    })).resolves.toBe('read-complete');

    expect(client.queries).toEqual([
      ['BEGIN READ ONLY', undefined],
      ["SELECT set_config('statement_timeout', $1, true)", ['2000ms']],
      ['SELECT bounded_read', undefined],
      ['ROLLBACK', undefined],
    ]);
    expect(client.release).toHaveBeenCalledOnce();
    expect(scope.currentClient()).toBeUndefined();
  });

  it('rolls back and releases the scoped client when the operation fails', async () => {
    const client = makeClient();
    const scope = createReadOnlyQueryScope({ connect: async () => client });

    await expect(scope.run(1000, async () => {
      throw new Error('read failed');
    })).rejects.toThrow('read failed');

    expect(client.queries.at(-1)?.[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects invalid timeout budgets before acquiring a client', async () => {
    const connect = vi.fn(async () => makeClient());
    const scope = createReadOnlyQueryScope({ connect });

    await expect(scope.run(0, async () => undefined)).rejects.toThrow(RangeError);
    expect(connect).not.toHaveBeenCalled();
  });
});
