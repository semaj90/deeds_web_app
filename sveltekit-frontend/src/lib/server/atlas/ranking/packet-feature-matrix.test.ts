import { describe, expect, it } from 'vitest';

import {
  buildPacketFeatureMatrixFromPackets,
  buildPacketFeatureRowsFromPackets,
  buildPacketFeatureMatrix,
  getPacketFeatureRow,
  normalizeDemandUtility,
} from './packet-feature-matrix.js';

describe('packet-feature-matrix', () => {
  it('builds a stable row-major matrix', () => {
    const matrix = buildPacketFeatureMatrix([
      {
        packetKey: 'packet:1',
        semanticScore: 0.9,
        centroidAffinity: 0.8,
        quaternionAffinity: 0.7,
        graphAuthority: 0.6,
        demandUtility: normalizeDemandUtility({ hits24h: 10, avgRerank: 0.5, maxObservedHotScore: 20 }),
        executionUtility: 0.4,
        recency: 0.3,
        cacheHotness: 0.2,
        normalizedCost: 0.1,
      },
    ]);

    expect(matrix.rows).toBe(1);
    expect(matrix.cols).toBe(9);
    expect(matrix.packetKeys).toEqual(['packet:1']);
    expect(getPacketFeatureRow(matrix, 0)).toHaveLength(9);
  });

  it('derives feature rows from ranked packets deterministically', () => {
    const rows = buildPacketFeatureRowsFromPackets([
      {
        packetKey: 'packet:ranked',
        tokenCount: 24,
        vector: [0.25, 0.75, 0.6, 0.5, 0.4, 0.8, 0.9, 0.2, 0.1],
      },
    ]);

    expect(rows).toEqual([
      {
        packetKey: 'packet:ranked',
        semanticScore: 0.75,
        centroidAffinity: 0.4,
        quaternionAffinity: 0.6,
        graphAuthority: 0.5,
        demandUtility: normalizeDemandUtility({ hits24h: 25, avgRerank: 0.75, maxObservedHotScore: 100 }),
        executionUtility: 0.9,
        recency: 0.8,
        cacheHotness: 0.2,
        normalizedCost: 0.1,
      },
    ]);

    const matrix = buildPacketFeatureMatrixFromPackets([
      {
        packetKey: 'packet:ranked',
        tokenCount: 24,
        vector: [0.25, 0.75, 0.6, 0.5, 0.4, 0.8, 0.9, 0.2, 0.1],
      },
    ]);

    expect(matrix.packetKeys).toEqual(['packet:ranked']);
    expect(getPacketFeatureRow(matrix, 0)).toEqual(new Float32Array([
      0.75, 0.4, 0.6, 0.5, rows[0].demandUtility, 0.9, 0.8, 0.2, 0.1,
    ]));
  });
});
