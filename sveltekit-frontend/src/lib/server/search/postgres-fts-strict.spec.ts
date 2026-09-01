import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('$lib/server/db/client', () => ({ pool: { query } }));

describe('searchCodeLexicalStrictV1', () => {
  beforeEach(() => query.mockReset());

  it('rejects empty or out-of-range requests before querying', async () => {
    const { searchCodeLexicalStrictV1, PostgresFtsReadErrorV1 } = await import('./postgres-fts.js');

    await expect(searchCodeLexicalStrictV1('')).rejects.toBeInstanceOf(PostgresFtsReadErrorV1);
    await expect(searchCodeLexicalStrictV1('term', { limit: 101 })).rejects.toThrow('FTS_QUERY_INVALID');
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves database failures as typed strict errors', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    const { searchCodeLexicalStrictV1 } = await import('./postgres-fts.js');

    await expect(searchCodeLexicalStrictV1('term')).rejects.toThrow('FTS_QUERY_FAILED');
  });

  it('accepts and validates a bounded FTS row', async () => {
    query.mockResolvedValueOnce({ rows: [{
      stable_key: 'file:src/a.ts:fn', file_path: 'src/a.ts', symbol_name: 'fn',
      symbol_kind: 'function', language: 'typescript', content: 'export function fn() {}',
      tags: '', topo_class: null, graph_authority_score: 0, lexical_score: 1,
      headline: 'fn',
    }] });
    const { searchCodeLexicalStrictV1 } = await import('./postgres-fts.js');

    await expect(searchCodeLexicalStrictV1('term', { limit: 1 })).resolves.toHaveLength(1);
  });
});
