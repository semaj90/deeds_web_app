// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPgQuery, mockPgConnect, mockRelease } = vi.hoisted(() => ({
  mockPgQuery: vi.fn(),
  mockPgConnect: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: {
    dialect: {
      sqlToQuery: () => ({ sql: 'WITH ranked AS MATERIALIZED (SELECT id, ts_rank(search_vector, to_tsquery($1)) AS score FROM codebase_chunk_index WHERE search_vector @@ to_tsquery($1) ORDER BY score DESC, id ASC LIMIT $2) SELECT chunk.id FROM ranked JOIN codebase_chunk_index AS chunk ON chunk.id = ranked.id ORDER BY ranked.score DESC, ranked.id ASC', params: ['xyznonexistenttoken999999', 50] }),
    },
  },
  pool: { connect: mockPgConnect },
}));

import { retrieveBM25 } from './retrieve-candidates.js';

describe('retrieveBM25 fallback admission', () => {
  beforeEach(() => {
    mockPgQuery.mockReset();
    mockPgConnect.mockReset();
    mockRelease.mockReset();
    mockPgConnect.mockResolvedValue({ query: mockPgQuery, release: mockRelease });
    mockPgQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT set_config(\'statement_timeout\', $1, true)') return { rows: [] };
      return { rows: [] };
    });
  });

  it('keeps a successful zero-hit FTS result empty and reports fallback denial', async () => {
    const decisions: unknown[] = [];
    const results = await retrieveBM25('xyznonexistenttoken999999', undefined, (decision) => decisions.push(decision));

    expect(results).toEqual([]);
    expect(decisions).toEqual([{
      status: 'not_admitted',
      strategy: 'postgres_substring_like',
      reason: 'no_indexed_fallback_path',
    }]);
    const stringQueries = mockPgQuery.mock.calls.map(([query]) => query).filter((query) => typeof query === 'string');
    expect(stringQueries).toEqual([
      'BEGIN READ ONLY',
      "SELECT set_config('statement_timeout', $1, true)",
      'WITH ranked AS MATERIALIZED (SELECT id, ts_rank(search_vector, to_tsquery($1)) AS score FROM codebase_chunk_index WHERE search_vector @@ to_tsquery($1) ORDER BY score DESC, id ASC LIMIT $2) SELECT chunk.id FROM ranked JOIN codebase_chunk_index AS chunk ON chunk.id = ranked.id ORDER BY ranked.score DESC, ranked.id ASC',
      'ROLLBACK',
    ]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('propagates FTS execution errors and does not turn them into empty results', async () => {
    const decisions: unknown[] = [];
    mockPgQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT set_config(\'statement_timeout\', $1, true)') return { rows: [] };
      if (query.startsWith('WITH ranked AS MATERIALIZED')) throw new Error('PG_FTS_TEST_FAILURE');
      return { rows: [] };
    });

    await expect(retrieveBM25('xyznonexistenttoken999999', undefined, (decision) => decisions.push(decision)))
      .rejects.toThrow('PG_FTS_TEST_FAILURE');
    expect(decisions).toEqual([{
      status: 'not_admitted',
      strategy: 'postgres_substring_like',
      reason: 'no_indexed_fallback_path',
    }]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
