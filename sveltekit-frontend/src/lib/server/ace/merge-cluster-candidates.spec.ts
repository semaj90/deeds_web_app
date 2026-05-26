import { describe, expect, it } from 'vitest';

import { mergeClusterCandidates } from './merge-cluster-candidates.ts';
import type { HotCluster } from './hot-cluster-reader.ts';

function makeHotCluster(overrides: Partial<HotCluster> & Pick<HotCluster, 'clusterId' | 'hotness' | 'scalarSeed'>): HotCluster {
  return {
    clusterKey: `cluster:gpu:${overrides.clusterId}`,
    clusterId: overrides.clusterId,
    hotness: overrides.hotness,
    source: overrides.source ?? 'ace:cluster:hot',
    fileCount: overrides.fileCount ?? 1,
    summary: overrides.summary ?? `Summary ${overrides.clusterId}`,
    purpose: overrides.purpose ?? `Purpose ${overrides.clusterId}`,
    riskLevel: overrides.riskLevel ?? 'low',
    mitigationProtocols: overrides.mitigationProtocols ?? ['dry-run'],
    topTags: overrides.topTags ?? ['tag-a', 'tag-b'],
    topFiles: overrides.topFiles ?? [`src/${overrides.clusterId}.ts`],
    topoClasses: overrides.topoClasses ?? ['server'],
    metadataSummary: overrides.metadataSummary ?? `Cluster ${overrides.clusterId} summary`,
    scalarSeed: overrides.scalarSeed,
  };
}

describe('mergeClusterCandidates', () => {
  it('carries hot-cluster metadata into the merged output', () => {
    const hotCluster = makeHotCluster({
      clusterId: 7,
      hotness: 0.82,
      scalarSeed: 0.74,
      fileCount: 42,
      metadataSummary: 'Cluster 7 focuses on legal ingestion.',
    });

    const merged = mergeClusterCandidates(
      [{ clusterId: 7, score: 0.8 }],
      [hotCluster],
      { hotThreshold: 0.1, hotWeight: 0.5, maxShould: 4 }
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      clusterId: 7,
      fromHot: true,
      hotness: 0.82,
      source: 'ace:cluster:hot',
      fileCount: 42,
      metadataSummary: 'Cluster 7 focuses on legal ingestion.',
      scalarSeed: 0.74,
    });
    expect(merged[0].score).toBeCloseTo(0.91, 6);
  });

  it('uses hot-cluster metadata as a deterministic tie-breaker', () => {
    const hotClusters = [
      makeHotCluster({
        clusterId: 1,
        hotness: 0.8,
        scalarSeed: 0.2,
        fileCount: 10,
        metadataSummary: 'Cluster 1',
      }),
      makeHotCluster({
        clusterId: 2,
        hotness: 0.8,
        scalarSeed: 0.9,
        fileCount: 99,
        metadataSummary: 'Cluster 2',
      }),
    ];

    const merged = mergeClusterCandidates(
      [
        { clusterId: 1, score: 1 },
        { clusterId: 2, score: 1 },
      ],
      hotClusters,
      { hotThreshold: 0.1, hotWeight: 0.5, maxShould: 4 }
    );

    expect(merged.map((cluster) => cluster.clusterId)).toEqual([2, 1]);
    expect(merged[0]).toMatchObject({
      clusterId: 2,
      scalarSeed: 0.9,
      fileCount: 99,
      metadataSummary: 'Cluster 2',
    });
  });
});