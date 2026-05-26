import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';

import { readHotClusters } from './hot-cluster-reader.ts';

describe('readHotClusters', () => {
  it('hydrates hot clusters from ace:cluster:hot and cluster tag hashes', async () => {
    const redis = {
      zrevrange: vi.fn().mockResolvedValue(['cluster:gpu:18', '0.671', 'cluster:gpu:17', '0.637']),
      hgetall: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'ace:cluster:tags:cluster:gpu:18') {
          return {
            summary: 'Cluster 18 is the CLI + tooling lane.',
            purpose: 'tooling and automation',
            risk_level: 'low',
            topTags: JSON.stringify(['cli', 'tooling', 'automation']),
            topFiles: JSON.stringify(['scripts/atlas/xgboost-hotness-score.mjs', 'scripts/atlas/warmup-bifrost-clusters.mjs']),
            topoClasses: JSON.stringify(['script', 'server']),
            mitigation_protocols: JSON.stringify(['run dry-run before write']),
            fileCount: '456',
          };
        }

        return {
          summary: 'Cluster 17 focuses on retrieval and synthesis.',
          purpose: 'retrieval lanes',
          risk_level: 'medium',
          topTags: JSON.stringify(['retrieval', 'qdrant', 'redis']),
          topFiles: JSON.stringify(['sveltekit-frontend/src/lib/server/ace/context-assembler.ts']),
          topoClasses: JSON.stringify(['server', 'route']),
          mitigation_protocols: JSON.stringify([]),
          fileCount: '211',
        };
      }),
      get: vi.fn().mockResolvedValue(null),
    } as unknown as Redis;

    const clusters = await readHotClusters(redis, 2, { preferHotSet: true });

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({
      clusterKey: 'cluster:gpu:18',
      clusterId: 18,
      hotness: 0.671,
      source: 'ace:cluster:hot',
      fileCount: 456,
    });
    expect(clusters[0].metadataSummary).toContain('Cluster 18 is the CLI + tooling lane.');
    expect(clusters[0].metadataSummary).toContain('Tags: cli, tooling, automation');
    expect(clusters[0].scalarSeed).toBeGreaterThan(0);
  });

  it('falls back to the cluster tag manifest when ace:cluster:hot is empty', async () => {
    const redis = {
      zrevrange: vi.fn().mockResolvedValue([]),
      hgetall: vi.fn().mockResolvedValue({
        summary: 'Cluster 7 is the legal doc lane.',
        purpose: 'document ingestion',
        risk_level: 'low',
        topTags: JSON.stringify(['legal', 'ingest']),
        topFiles: JSON.stringify(['scripts/ingest-uscode.ts']),
        topoClasses: JSON.stringify(['script']),
        mitigation_protocols: JSON.stringify([]),
        fileCount: '12',
      }),
      get: vi.fn().mockResolvedValue(JSON.stringify({ clusterKeys: ['cluster:gpu:7'] })),
    } as unknown as Redis;

    const clusters = await readHotClusters(redis, 10, { preferHotSet: true });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      clusterKey: 'cluster:gpu:7',
      clusterId: 7,
      hotness: 0,
      source: 'ace:cluster:tags:__meta',
    });
    expect(clusters[0].metadataSummary).toContain('Cluster 7 is the legal doc lane.');
    expect(clusters[0].scalarSeed).toBeGreaterThan(0);
  });
});