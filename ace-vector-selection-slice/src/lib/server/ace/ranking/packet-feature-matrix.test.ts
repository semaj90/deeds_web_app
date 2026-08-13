import { describe, expect, it } from 'vitest';
import {
  PACKET_FEATURE_COUNT,
  buildPacketFeatureMatrix,
  getPacketFeatureRow,
  normalizeDemandUtility,
} from './packet-feature-matrix';

describe('packet-feature-matrix', () => {
  it('packs packet rows deterministically in row-major order', () => {
    const matrix = buildPacketFeatureMatrix([
      {
        packetKey: 'ace:cluster:0:r1',
        semanticScore: 0.9,
        centroidAffinity: 0.8,
        quaternionAffinity: 0.7,
        graphAuthority: 0.6,
        demandUtility: 0.5,
        executionUtility: 0.4,
        recency: 0.3,
        cacheHotness: 0.2,
        normalizedCost: 0.1,
      },
      {
        packetKey: 'ace:cluster:1:r1',
        semanticScore: 0.1,
        centroidAffinity: 0.2,
        quaternionAffinity: 0.3,
        graphAuthority: 0.4,
        demandUtility: 0.5,
        executionUtility: 0.6,
        recency: 0.7,
        cacheHotness: 0.8,
        normalizedCost: 0.9,
      },
    ]);

    expect(matrix.packetKeys).toEqual([
      'ace:cluster:0:r1',
      'ace:cluster:1:r1',
    ]);
    expect(matrix.rows).toBe(2);
    expect(matrix.cols).toBe(PACKET_FEATURE_COUNT);
    expect(matrix.values.length).toBe(2 * PACKET_FEATURE_COUNT);

    const first = Array.from(getPacketFeatureRow(matrix, 0));
    expect(first[0]).toBeCloseTo(0.9, 5);
    expect(first[1]).toBeCloseTo(0.8, 5);
    expect(first[8]).toBeCloseTo(0.1, 5);
  });

  it('derives bounded demand utility from hit log signals', () => {
    expect(
      normalizeDemandUtility({
        hits24h: 50,
        avgRerank: 0.8,
        maxObservedHotScore: 100,
      }),
    ).toBeCloseTo(0.4, 6);

    expect(
      normalizeDemandUtility({
        hits24h: 1000,
        avgRerank: 1,
        maxObservedHotScore: 100,
      }),
    ).toBe(1);
  });
});
