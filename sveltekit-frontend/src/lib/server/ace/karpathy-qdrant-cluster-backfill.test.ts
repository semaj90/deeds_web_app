import { describe, expect, it } from 'vitest';

import { buildKarpathyClusterBackfillRows, buildKarpathyClusterPayloadPatch } from './karpathy-qdrant-cluster-backfill.js';

describe('karpathy qdrant cluster backfill', () => {
  it('builds additive payload patches from publish-split clusters', () => {
    const patch = buildKarpathyClusterPayloadPatch({
      clusterKey: 'cluster:gpu:55',
      clusterId: 55,
      hotness: 0.91,
      summary: 'table-def chunks in `src/lib/server/db` (tag: database)',
      purpose: 'cluster narrative',
      riskLevel: 'high',
      mitigationProtocols: ['dry-run', 'rollback'],
      topTags: ['database', 'schema', 'drizzle'],
      topFiles: ['src/lib/server/db/schema-postgres.ts', 'src/lib/server/db/schema.ts'],
      topoClasses: ['src/lib/server/db', 'src/lib/server/db/schema'],
      scalarSeed: 0.8123,
      metadataSummary: 'summary | purpose | risk',
      source: 'ace:cluster:hot',
    });

    expect(patch).toMatchObject({
      cluster_id: 55,
      cluster_key: 'cluster:gpu:55',
      cluster_hotness: 0.91,
      cluster_hotness_bucket: 'hot',
      cluster_summary_text: 'table-def chunks in `src/lib/server/db` (tag: database)',
      cluster_purpose: 'cluster narrative',
      cluster_risk_level: 'high',
      cluster_patterns: ['database', 'schema', 'drizzle'],
      cluster_warnings: ['high'],
      cluster_tags: ['src/lib/server/db/schema-postgres.ts', 'src/lib/server/db/schema.ts'],
      cluster_top_tags: ['database', 'schema', 'drizzle'],
      cluster_top_files: ['src/lib/server/db/schema-postgres.ts', 'src/lib/server/db/schema.ts'],
      cluster_topo_classes: ['src/lib/server/db', 'src/lib/server/db/schema'],
      cluster_scalar_seed: 0.8123,
      cluster_metadata_summary: 'summary | purpose | risk',
      cluster_source: 'ace:cluster:hot',
    });
  });

  it('builds rows for multiple clusters', () => {
    const rows = buildKarpathyClusterBackfillRows([
      {
        clusterKey: 'cluster:gpu:1',
        clusterId: 1,
        hotness: 0.6,
        summary: 's1',
        purpose: '',
        riskLevel: 'medium',
        mitigationProtocols: [],
        topTags: ['a'],
        topFiles: ['f1'],
        topoClasses: ['db'],
        scalarSeed: 0.5,
        metadataSummary: 'm1',
        source: 'ace:cluster:hot',
      },
      {
        clusterKey: 'cluster:gpu:2',
        clusterId: 2,
        hotness: 0.2,
        summary: 's2',
        purpose: '',
        riskLevel: 'low',
        mitigationProtocols: [],
        topTags: ['b'],
        topFiles: ['f2'],
        topoClasses: ['routes'],
        scalarSeed: 0.4,
        metadataSummary: 'm2',
        source: 'ace:cluster:hot',
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].patch.cluster_hotness_bucket).toBe('warm');
    expect(rows[1].patch.cluster_hotness_bucket).toBe('cold');
  });
});

