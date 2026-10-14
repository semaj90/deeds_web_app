import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client.js', () => ({ pool: { query: mockQuery } }));

describe('traverseGraphV1 snapshot admission', () => {
  beforeEach(() => mockQuery.mockReset());

  it('rejects superseded snapshots before traversing edges', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'SUPERSEDED' }] });
    const { traverseGraphV1 } = await import('./graph-traversal.js');

    await expect(traverseGraphV1({
      snapshotId: '5ed8371a-7df7-47c0-9ec9-8500ca8786cc',
      seedNodeKeys: ['packet:test'],
    })).rejects.toThrow('GRAPH_SNAPSHOT_NOT_TRAVERSABLE:SUPERSEDED');
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', [], 'MISSING'],
    ['building', [{ status: 'BUILDING' }], 'BUILDING'],
  ])('rejects %s snapshots before traversing edges', async (_label, rows, status) => {
    mockQuery.mockResolvedValueOnce({ rows });
    const { traverseGraphV1 } = await import('./graph-traversal.js');

    await expect(traverseGraphV1({
      snapshotId: '5ed8371a-7df7-47c0-9ec9-8500ca8786cc',
      seedNodeKeys: ['packet:test'],
    })).rejects.toThrow(`GRAPH_SNAPSHOT_NOT_TRAVERSABLE:${status}`);
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it('traverses only a validated snapshot and repeats the status predicate in graph queries', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'VALIDATED' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { traverseGraphV1 } = await import('./graph-traversal.js');

    const result = await traverseGraphV1({
      snapshotId: '5ed8371a-7df7-47c0-9ec9-8500ca8786cc',
      seedNodeKeys: ['packet:test'],
      maxHops: 1,
    });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(String(mockQuery.mock.calls[1][0])).toContain("s.status = 'VALIDATED'");
    expect(String(mockQuery.mock.calls[1][0]).match(/s\.status = 'VALIDATED'/g)).toHaveLength(2);
  });
});
