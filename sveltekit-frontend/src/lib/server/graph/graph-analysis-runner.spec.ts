import { beforeEach, describe, expect, it, vi } from 'vitest';

const runBetweennessAnalysis = vi.fn();
const runStreamGdsAnalysis = vi.fn();

vi.mock('./betweenness-analysis-adapter.js', () => ({
  runBetweennessAnalysis,
}));

vi.mock('./stream-gds-analysis-adapter.js', () => ({
  runStreamGdsAnalysis,
}));

import { runGraphAnalysis } from './graph-analysis-runner.js';

describe('graph-analysis-runner betweenness routing', () => {
  beforeEach(() => {
    runBetweennessAnalysis.mockReset();
    runStreamGdsAnalysis.mockReset();
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

  it.each(['knn', 'bfs', 'dijkstra', 'astar'] as const)(
    'routes %s through the stream-only GDS adapter with zero writes',
    async (algorithm) => {
      runStreamGdsAnalysis.mockResolvedValue({
        run: { runId: `${algorithm}-run` },
        records: [],
        estimatedBytes: 1024,
        writesPerformed: false,
        canonicalAuthority: false,
      });

      const result = await runGraphAnalysis({} as any, {
        algorithm,
        limit: 10,
        k: 5,
        sourcePacketKey: 'src:1',
        targetPacketKey: 'dst:1',
      });

      expect(runStreamGdsAnalysis).toHaveBeenCalledTimes(1);
      expect(runStreamGdsAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({
          algorithm,
          limit: 10,
          k: 5,
          sourcePacketKey: 'src:1',
          targetPacketKey: 'dst:1',
        }),
      );
      expect(result.metricsWritten).toBe(0);
      expect(result.communitiesWritten).toBe(0);
    },
  );
});
