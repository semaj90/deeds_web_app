// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  __test,
  buildWarningCounts,
  reconcileIdentityRows,
} from '../../../src/lib/server/retrieval/retrieval-loop-reconciliation.js';

describe('retrieval-loop-reconciliation', () => {
  it('uses a versioned cache key that does not depend on aliasId alone', () => {
    const queryHash = 'abc123';
    const first = __test.makeCacheKey(queryHash, ['b.ts', 'a.ts'], ['f2', 'f1']);
    const second = __test.makeCacheKey(queryHash, ['a.ts', 'b.ts'], ['f1', 'f2']);

    expect(first).toBe(second);
    expect(first).toContain('ace:reconciliation:v1:');
  });

  it('classifies identity warnings instead of silently merging conflicts', () => {
    const evidences = reconcileIdentityRows(
      [
        {
          source_ref: 'src/lib/a.ts',
          feature_id: 'feature.a',
          packet_key: 'packet:a',
          qdrant_point_id: 'qdrant-1',
          cluster_id: '7',
          centroid_id: '7',
        },
        {
          source_ref: 'src/lib/b.ts',
          feature_id: 'feature.b',
          packet_key: 'packet:a',
          qdrant_point_id: 'qdrant-2',
          cluster_id: '8',
          centroid_id: '8',
        },
      ],
      ['src/lib/a.ts'],
      ['feature.a'],
      undefined
    );

    expect(evidences).toHaveLength(1);
    expect(evidences[0].warnings).toContain('SOURCE_REF_CONFLICT');
    expect(evidences[0].warnings).toContain('FEATURE_ID_CONFLICT');
    expect(evidences[0].warnings).toContain('DUPLICATE_QDRANT_IDENTITY');
    expect(evidences[0].warnings).toContain('MISSING_ALIAS_ID');
  });

  it('counts warnings across reconciled evidence', () => {
    const counts = buildWarningCounts([
      {
        packetKey: '',
        sourceRef: '',
        featureId: '',
        clusterIds: {},
        warnings: ['MISSING_PACKET_KEY', 'MISSING_SOURCE_REF'],
      },
      {
        packetKey: 'packet:a',
        sourceRef: 'src/lib/a.ts',
        featureId: '',
        clusterIds: {},
        warnings: ['MISSING_FEATURE_ID'],
      },
    ]);

    expect(counts.MISSING_PACKET_KEY).toBe(1);
    expect(counts.MISSING_SOURCE_REF).toBe(1);
    expect(counts.MISSING_FEATURE_ID).toBe(1);
  });
});
