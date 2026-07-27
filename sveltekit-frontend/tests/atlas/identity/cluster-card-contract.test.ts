// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildClusterCardQueryHash,
  clusterCardRequestSchema,
  makeClusterCardCacheKey,
  mapLegacyClusterCardRow,
} from '../../../src/lib/server/retrieval/cluster-card-contract.js';

describe('cluster-card-contract', () => {
  it('builds a stable query hash and includes limit in the contract', () => {
    const req = clusterCardRequestSchema.parse({
      sourceRef: 'src/lib/server',
      featureId: 'auth.sessions',
      limit: 5,
    });

    const same = buildClusterCardQueryHash(req);
    const changed = buildClusterCardQueryHash({ ...req, limit: 6 });

    expect(buildClusterCardQueryHash(req)).toBe(same);
    expect(changed).not.toBe(same);
    expect(makeClusterCardCacheKey(same)).toContain('ace:cluster-cards:v1:');
  });

  it('maps a legacy cluster_cards row into the canonical DTO', () => {
    const card = mapLegacyClusterCardRow(
      {
        id: '45',
        centroid_dim: 768,
        created_at: '2026-07-01T00:00:00.000Z',
        card: {
          id: '45',
          cluster_label: 'Cluster 45',
          summary: 'Legacy cluster summary',
          files: ['src/routes/api/atlas/cluster-cards/+server.ts'],
          features: ['atlas.cluster-cards'],
          member_count: 12,
          authority_score: 0.72,
        },
      },
      [
        {
          source_ref: 'src/routes/api/atlas/cluster-cards/+server.ts',
          feature_id: 'atlas.cluster-cards',
          packet_key: 'packet:123',
          cluster_id: '45',
          centroid_id: '258',
        },
      ]
    );

    expect(card.clusterId).toBe('45');
    expect(card.label).toBe('Cluster 45');
    expect(card.packetKeys).toEqual(['packet:123']);
    expect(card.featureIds).toContain('atlas.cluster-cards');
    expect(card.sourceRefs).toContain('src/routes/api/atlas/cluster-cards/+server.ts');
    expect(card.score).toBe(0.72);
  });
});
