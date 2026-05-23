import { describe, expect, it } from 'vitest';

import { buildKarpathyPublishSplit } from './karpathy-publish-split.js';

describe('buildKarpathyPublishSplit', () => {
  it('normalizes and orders publish-split clusters by raw hotness', () => {
    const manifest = buildKarpathyPublishSplit(
      [
        {
          id: 9,
          clusterBlend: 1.2,
          inferredTopic: 'routing and retrieval',
          size: 44,
          topTags: [
            { tag: 'routing', count: 4 },
            { tag: 'retrieval', count: 3 },
          ],
          memberFiles: [{ path: 'src/lib/server/ace/context-assembler.ts' }],
          authority: { clusterAuthorityScore: 8.2, totalFiles: 44 },
        },
        {
          id: 3,
          clusterBlend: 0.4,
          inferredTopic: 'schema and database',
          size: 12,
          topTags: [{ tag: 'database', count: 2 }],
          memberFiles: [{ path: 'src/lib/server/db/schema.ts' }],
          authority: { clusterAuthorityScore: 2.1, totalFiles: 12 },
        },
      ],
      { generatedAt: '2026-05-21T12:00:00.000Z', limit: 8 },
    );

    expect(manifest.generatedAt).toBe('2026-05-21T12:00:00.000Z');
    expect(manifest.sourceCount).toBe(2);
    expect(manifest.selectedCount).toBe(2);
    expect(manifest.selectedClusters.map((cluster) => cluster.clusterId)).toEqual([9, 3]);
    expect(manifest.selectedClusters[0]).toMatchObject({
      clusterKey: 'cluster:gpu:9',
      source: 'ace:cluster:hot',
      summary: 'routing and retrieval',
      topTags: ['routing', 'retrieval'],
      topFiles: ['src/lib/server/ace/context-assembler.ts'],
    });
    expect(manifest.redis.meta.clusterKeys).toEqual(['cluster:gpu:9', 'cluster:gpu:3']);
    expect(manifest.redis.hotSet[0]).toEqual({
      clusterKey: 'cluster:gpu:9',
      hotness: 1,
    });
    expect(Number(manifest.redis.clusterHashes['cluster:gpu:9'].hotness)).toBeCloseTo(1, 4);
    expect(manifest.scrollRows[0]).toMatchObject({
      clusterKey: 'cluster:gpu:9',
      clusterId: 9,
      source: 'ace:cluster:hot',
    });
  });

  it('limits and filters the selected clusters', () => {
    const manifest = buildKarpathyPublishSplit(
      [
        { id: 1, clusterBlend: 0.2, size: 8 },
        { id: 2, clusterBlend: 0.1, size: 9 },
        { id: 3, clusterBlend: 0.05, size: 10 },
      ],
      { generatedAt: '2026-05-21T12:00:00.000Z', limit: 2, minRawHotness: 0.1 },
    );

    expect(manifest.selectedClusters.map((cluster) => cluster.clusterId)).toEqual([1, 2]);
    expect(manifest.redis.meta.clusterKeys).toEqual(['cluster:gpu:1', 'cluster:gpu:2']);
    expect(manifest.selectedClusters.every((cluster) => cluster.hotness <= 1)).toBe(true);
  });
});

