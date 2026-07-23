import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildRgJsonArgs, parseRgJsonLines, planKMeansRouting, runExactRgJson, validateTreeNodeIdentities } from './candidate-foundation.js';

describe('Atlas candidate foundation', () => {
  it('rejects a tree identity collision instead of choosing a packet', () => {
    expect(() => validateTreeNodeIdentities([
      { packetKey: 'packet:a', treeNodeId: 'tree:shared', sourceRef: 'src/a.ts', corpusSnapshotId: 'snapshot:1' },
      { packetKey: 'packet:b', treeNodeId: 'tree:shared', sourceRef: 'src/b.ts', corpusSnapshotId: 'snapshot:1' },
    ])).toThrow(/TREE_NODE_ID_COLLISION/);
  });

  it('selects nearest clusters while preserving global ANN fallback', () => {
    const plan = planKMeansRouting([1, 0], {
      modelId: 'kmeans-384-v1', corpusSnapshotId: 'snapshot:1', vectorLaneId: 'dense_384', dimension: 2,
      centroids: [{ clusterId: 7, vector: [1, 0] }, { clusterId: 8, vector: [0, 1] }, { clusterId: 9, vector: [-1, 0] }],
    });
    expect(plan).toMatchObject({ status: 'ACTIVE', selectedClusterIds: [7, 8, 9], globalAnnFallback: true });
  });

  it('degrades cluster routing on an incompatible vector dimension', () => {
    const plan = planKMeansRouting([1, 0, 0], {
      modelId: 'kmeans-384-v1', corpusSnapshotId: 'snapshot:1', vectorLaneId: 'dense_384', dimension: 2,
      centroids: [{ clusterId: 7, vector: [1, 0] }],
    });
    expect(plan).toMatchObject({ status: 'DEGRADED', globalAnnFallback: true });
  });

  it('retains exact rg line and column evidence inside the workspace', () => {
    const lines = [JSON.stringify({ type: 'match', data: { path: { text: 'src/router.ts' }, line_number: 12, lines: { text: 'export const scoreAllClusters = true;\n' }, submatches: [{ start: 13, end: 29 }] } })];
    expect(parseRgJsonLines(lines, 'C:/repo', 'scoreAllClusters')).toEqual([expect.objectContaining({ sourceRef: 'src/router.ts', line: 12, column: 14, matchedText: 'scoreAllClusters' })]);
    expect(buildRgJsonArgs(['scoreAllClusters'])).toContain('--json');
  });

  it('runs exact rg through a bounded no-shell adapter', async () => {
    const result = await runExactRgJson({ workspaceRoot: join(process.cwd(), 'src/lib/server/atlas'), keywords: ['planKMeansRouting'], maxResults: 5, timeoutMs: 5_000 });
    expect(result.status).toBe('ACTIVE');
    expect(result.matches[0]).toMatchObject({ matchKind: 'exact_identifier', matchedText: 'planKMeansRouting' });
  });
});
