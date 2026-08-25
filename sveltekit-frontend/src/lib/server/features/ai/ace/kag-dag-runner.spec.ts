import { describe, expect, it, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const valuesMock = vi.fn((row: unknown) => {
  insertMock(row);
  return Promise.resolve();
});
vi.mock('$lib/server/db/client', () => ({
  db: {
    insert: () => ({ values: valuesMock }),
  },
}));

describe('KAG DAG: topologicalSortDagNodes', () => {
  it('orders nodes so every dependency precedes its dependent', async () => {
    const { topologicalSortDagNodes } = await import('./kag-dag-runner.js');
    const nodes = new Map([
      ['c', { name: 'c', dependsOn: ['a', 'b'], run: async () => ({}) }],
      ['a', { name: 'a', dependsOn: [], run: async () => ({}) }],
      ['b', { name: 'b', dependsOn: ['a'], run: async () => ({}) }],
    ] as const);

    const order = topologicalSortDagNodes(nodes as any);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(order).toHaveLength(3);
  });

  it('drops dependsOn edges pointing at unregistered nodes instead of deadlocking', async () => {
    const { topologicalSortDagNodes } = await import('./kag-dag-runner.js');
    const nodes = new Map([
      ['a', { name: 'a', dependsOn: ['ghost'], run: async () => ({}) }],
    ] as const);

    const order = topologicalSortDagNodes(nodes as any);
    expect(order).toEqual(['a']);
  });

  it('throws on a real cycle among registered nodes', async () => {
    const { topologicalSortDagNodes } = await import('./kag-dag-runner.js');
    const nodes = new Map([
      ['a', { name: 'a', dependsOn: ['b'], run: async () => ({}) }],
      ['b', { name: 'b', dependsOn: ['a'], run: async () => ({}) }],
    ] as const);

    expect(() => topologicalSortDagNodes(nodes as any)).toThrow(/cyclic/i);
  });
});

describe('KAG DAG: persistKagDagRunFromSteps', () => {
  beforeEach(() => {
    insertMock.mockClear();
    valuesMock.mockClear();
  });

  it('persists one run row and one node row per step, chained by edges', async () => {
    const { persistKagDagRunFromSteps } = await import('./kag-dag-runner.js');
    const result = await persistKagDagRunFromSteps({
      query: 'what depends on auth.ts',
      workflowState: 'COMPLETE',
      steps: [
        { name: 'validate_request', status: 'completed', durationMs: 0 },
        { name: 'canonical_search', status: 'completed', durationMs: 42 },
        { name: 'rust_shadow_compare', status: 'skipped', durationMs: 0, detail: 'disabled' },
      ],
      finalJson: { topPacketKeys: ['packet:a'] },
    });

    expect(result?.runId).toBeTruthy();

    const runInsert = insertMock.mock.calls.find(([row]) => 'query' in (row as Record<string, unknown>));
    expect(runInsert?.[0]).toEqual(
      expect.objectContaining({
        query: 'what depends on auth.ts',
        status: 'success',
        totalDurationMs: 42,
        finalJson: expect.objectContaining({ workflowState: 'COMPLETE', topPacketKeys: ['packet:a'] }),
      }),
    );

    const nodeInserts = insertMock.mock.calls.filter(([row]) => 'nodeKey' in (row as Record<string, unknown>));
    expect(nodeInserts).toHaveLength(3);
    expect(nodeInserts[1]?.[0]).toEqual(
      expect.objectContaining({ nodeKey: 'canonical_search', status: 'success', durationMs: 42, cacheHit: false }),
    );
    expect(nodeInserts[2]?.[0]).toEqual(
      expect.objectContaining({ nodeKey: 'rust_shadow_compare', status: 'skipped', cacheHit: true }),
    );

    const edgeInserts = insertMock.mock.calls.filter(([row]) => 'fromNodeKey' in (row as Record<string, unknown>));
    expect(edgeInserts).toHaveLength(2);
    expect(edgeInserts[0]?.[0]).toEqual(
      expect.objectContaining({ fromNodeKey: 'validate_request', toNodeKey: 'canonical_search' }),
    );
  });

  it('marks the run failed when any step failed', async () => {
    const { persistKagDagRunFromSteps } = await import('./kag-dag-runner.js');
    await persistKagDagRunFromSteps({
      query: 'q',
      workflowState: 'FAILED',
      steps: [{ name: 'canonical_search', status: 'failed', durationMs: 5, detail: 'boom' }],
    });

    const runInsert = insertMock.mock.calls.find(([row]) => 'query' in (row as Record<string, unknown>));
    expect(runInsert?.[0]).toEqual(expect.objectContaining({ status: 'failed' }));
  });

  it('is a no-op for the run row on DB error — fails open, never throws', async () => {
    valuesMock.mockImplementationOnce(() => Promise.reject(new Error('connection refused')));
    const { persistKagDagRunFromSteps } = await import('./kag-dag-runner.js');
    const result = await persistKagDagRunFromSteps({
      query: 'q',
      workflowState: 'COMPLETE',
      steps: [{ name: 'canonical_search', status: 'completed', durationMs: 1 }],
    });

    expect(result).toBeNull();
  });
});
