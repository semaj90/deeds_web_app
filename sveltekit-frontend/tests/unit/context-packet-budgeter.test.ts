import { describe, it, expect } from 'vitest';
import { ContextPacketBudgeter, DEFAULT_BUDGET } from '../../src/lib/server/ace/context-packet-budgeter.js';

describe('ContextPacketBudgeter', () => {
  it('should trim items exceeding the budget', () => {
    const packet = {
      taskDistillates: [1, 2, 3, 4, 5],
      clusterCards: [1, 2, 3, 4, 5],
      graphPaths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      hits: Array(20).fill({ id: 'chunk' })
    };

    const budget = { ...DEFAULT_BUDGET, maxTaskDistillates: 2, maxClusterCards: 2 };
    const trimmed = ContextPacketBudgeter.budget(packet, budget);

    expect(trimmed.taskDistillates).toHaveLength(2);
    expect(trimmed.clusterCards).toHaveLength(2);
    expect(trimmed.graphPaths).toHaveLength(DEFAULT_BUDGET.maxGraphPaths);
    expect(trimmed.hits).toHaveLength(DEFAULT_BUDGET.maxRawChunks);
  });

  it('should not trim items within the budget', () => {
    const packet = {
      taskDistillates: [1],
      clusterCards: [1]
    };

    const trimmed = ContextPacketBudgeter.budget(packet);
    expect(trimmed.taskDistillates).toHaveLength(1);
    expect(trimmed.clusterCards).toHaveLength(1);
  });
});
