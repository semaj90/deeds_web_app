import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProjectionClient: vi.fn(),
  getNeo4jDriver: vi.fn(),
  resolveCodebaseFilePacketKeys: vi.fn(),
  lookupPacketKey: vi.fn(),
}));

vi.mock('./neo4j-gds-client.js', () => ({
  ensureProjectionClient: mocks.ensureProjectionClient,
  getNeo4jDriver: mocks.getNeo4jDriver,
  PROJECTION_NAME: 'codeTopology',
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: mocks.getNeo4jDriver,
}));

vi.mock('./graph-packet-key-resolver.js', () => ({
  resolveCodebaseFilePacketKeys: mocks.resolveCodebaseFilePacketKeys,
  lookupPacketKey: mocks.lookupPacketKey,
}));

import { runBetweennessAnalysis } from './betweenness-analysis-adapter.js';

describe('betweenness-analysis-adapter', () => {
  it('writes a real betweenness run and metric row', async () => {
    const sessionRun = vi.fn(async (query: string) => {
      if (query.includes('gds.graph.nodeProperties.drop')) {
        return { records: [] };
      }
      if (query.includes('gds.betweenness.mutate')) {
        return { records: [] };
      }
      if (query.includes('gds.graph.nodeProperties.write')) {
        return { records: [{ get: () => 1 }] };
      }
      if (query.includes('MATCH (n:CodebaseFile)')) {
        return {
          records: [
            {
              get: (key: string) => {
                if (key === 'path') return 'src/lib/server/auth.ts';
                if (key === 'betweennessScore') return 3.5;
                return null;
              },
            },
          ],
        };
      }
      return { records: [] };
    });
    const sessionClose = vi.fn().mockResolvedValue(undefined);
    const clientQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
    const clientRelease = vi.fn();

    mocks.ensureProjectionClient.mockResolvedValue({
      nodeCount: 10,
      relationshipCount: 12,
    });
    mocks.getNeo4jDriver.mockReturnValue({
      session: () => ({
        run: sessionRun,
        close: sessionClose,
      }),
    });
    mocks.resolveCodebaseFilePacketKeys.mockResolvedValue([{ path: 'src/lib/server/auth.ts', packetKey: 'packet-a' }]);
    mocks.lookupPacketKey.mockImplementation((resolved: Array<{ path: string; packetKey: string }>, path: string) => {
      return resolved.find((row) => row.path === path)?.packetKey ?? null;
    });
    const pool = {
      connect: vi.fn().mockResolvedValue({
        query: clientQuery,
        release: clientRelease,
      }),
    };

    const result = await runBetweennessAnalysis(pool as any, { limit: 5 });

    expect(mocks.ensureProjectionClient).toHaveBeenCalledWith('atlas_feature_v1', false, [
      'BELONGS_TO_FEATURE',
      'SIMILAR_TOPOLOGY',
    ]);
    expect(sessionRun).toHaveBeenCalled();
    expect(result.metricsWritten).toBe(1);
    expect(result.unresolvedPacketKeys).toBe(0);
    expect(result.run.algorithm).toBe('betweenness');
    expect(result.run.algorithmRevision).toBe('neo4j-gds-betweenness-exact-v1');
    expect(result.run.projectionName).toBe('atlas_feature_v1');
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO graph_analysis_runs'))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO graph_node_metrics'))).toBe(true);
    expect(clientRelease).toHaveBeenCalled();
    expect(sessionClose).toHaveBeenCalled();
  });
});
