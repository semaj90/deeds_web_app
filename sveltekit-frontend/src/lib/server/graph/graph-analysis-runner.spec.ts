import { beforeEach, describe, expect, it, vi } from 'vitest';

const runBetweennessAnalysis = vi.fn();

vi.mock('./betweenness-analysis-adapter.js', () => ({
  runBetweennessAnalysis,
}));

import { runGraphAnalysis } from './graph-analysis-runner.js';

describe('graph-analysis-runner betweenness routing', () => {
  beforeEach(() => {
    runBetweennessAnalysis.mockReset();
  });

  it('routes betweenness through the dedicated adapter', async () => {
    runBetweennessAnalysis.mockResolvedValue({
      run: { runId: 'betweenness-run' },
      metricsWritten: 11,
      unresolvedPacketKeys: 0,
      excludedPacketKeys: 0,
    });

    const result = await runGraphAnalysis({} as any, {
      algorithm: 'betweenness',
      limit: 11,
    });

    expect(runBetweennessAnalysis).toHaveBeenCalledTimes(1);
    expect(runBetweennessAnalysis).toHaveBeenCalledWith({}, { limit: 11 });
    expect(result.metricsWritten).toBe(11);
    expect(result.communitiesWritten).toBe(0);
    expect(result.unresolvedPacketKeys).toBe(0);
    expect(result.excludedPacketKeys).toBe(0);
  });
});
