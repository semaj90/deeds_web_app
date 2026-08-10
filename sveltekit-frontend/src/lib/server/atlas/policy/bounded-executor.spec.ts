import { describe, expect, it } from 'vitest';
import { runBoundedExecutionPlan } from './bounded-executor';

describe('runBoundedExecutionPlan', () => {
  it('respects dependencies and deterministic completion receipts', async () => {
    const order: string[] = [];
    const receipts = await runBoundedExecutionPlan([
      { id: 'a', priority: 10, resourceClass: 'IO', run: async () => { order.push('a'); return 1; } },
      { id: 'b', priority: 9, dependencies: ['a'], resourceClass: 'CPU_LIGHT', run: async () => { order.push('b'); return 2; } },
      { id: 'c', priority: 8, dependencies: ['a'], resourceClass: 'IO', run: async () => { order.push('c'); return 3; } },
    ]);
    expect(order[0]).toBe('a');
    expect(receipts.every((r) => r.status === 'SUCCEEDED')).toBe(true);
  });

  it('fails closed on a dependency cycle', async () => {
    await expect(
      runBoundedExecutionPlan([
        { id: 'a', priority: 1, dependencies: ['b'], resourceClass: 'IO', run: async () => 1 },
        { id: 'b', priority: 1, dependencies: ['a'], resourceClass: 'IO', run: async () => 2 },
      ]),
    ).rejects.toThrow(/cycle|unresolved dependency/i);
  });
});
