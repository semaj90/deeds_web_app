import { describe, expect, it } from 'vitest';
import {
  computeKendallTauDistance,
  computePearsonCorrelation,
  detectCollinearAuthorityAlias,
  runPageRankAuthorityAblationV1,
  type CandidateScoresForAblation,
} from './pagerank-authority-ablation-v1.js';

describe('pagerank-authority-ablation-v1', () => {
  it('computes Pearson correlation accurately', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10]; // perfectly collinear
    expect(computePearsonCorrelation(x, y)).toBeCloseTo(1.0, 5);

    const negY = [10, 8, 6, 4, 2]; // perfectly anti-correlated
    expect(computePearsonCorrelation(x, negY)).toBeCloseTo(-1.0, 5);
  });

  it('detects and flags collinear authority aliases (|r| >= 0.99)', () => {
    const pagerankScores = [0.1, 0.2, 0.3, 0.4, 0.5];
    // Alias that duplicates PageRank (e.g. legacy authority_score)
    const duplicateAlias = [0.1001, 0.2001, 0.3001, 0.4001, 0.5001];

    const detection = detectCollinearAuthorityAlias(
      pagerankScores,
      duplicateAlias,
      'legacy_authority_score',
    );

    expect(detection.isCollinear).toBe(true);
    expect(detection.correlation).toBeGreaterThan(0.999);
  });

  it('computes Kendall tau distance between rankings', () => {
    const orderA = ['a', 'b', 'c', 'd'];
    const orderB = ['a', 'b', 'c', 'd']; // identical -> tau = 0
    expect(computeKendallTauDistance(orderA, orderB)).toBe(0);

    const reversed = ['d', 'c', 'b', 'a']; // completely reversed -> tau = 1
    expect(computeKendallTauDistance(orderA, reversed)).toBe(1);

    const partial = ['a', 'c', 'b', 'd']; // 1 discordant pair out of 6
    expect(computeKendallTauDistance(orderA, partial)).toBeCloseTo(1 / 6, 4);
  });

  it('passes ablation when PageRank provides non-redundant ranking signal and obeys bounded boost', () => {
    const candidates: CandidateScoresForAblation[] = [
      {
        packetKey: 'pkt:A',
        dense: 0.85,
        sparse: 0.80,
        ast: 0.70,
        pagerankAuthority: 0.25, // low PR
      },
      {
        packetKey: 'pkt:B',
        dense: 0.82,
        sparse: 0.78,
        ast: 0.75,
        pagerankAuthority: 0.95, // high PR: central infrastructure node
      },
      {
        packetKey: 'pkt:C',
        dense: 0.60,
        sparse: 0.65,
        ast: 0.50,
        pagerankAuthority: 0.40,
      },
      {
        packetKey: 'pkt:D',
        dense: 0.40,
        sparse: 0.45,
        ast: 0.30,
        pagerankAuthority: 0.10,
      },
      {
        packetKey: 'pkt:E',
        dense: 0.20,
        sparse: 0.15,
        ast: 0.20,
        pagerankAuthority: 0.80, // high PR but low relevance: relevance must still dominate
      },
    ];

    const report = runPageRankAuthorityAblationV1({
      candidates,
      maxAuthorityBoost: 0.15,
    });

    expect(report.schema).toBe('atlas.pagerank-authority-ablation-report.v1');
    expect(report.sampleCount).toBe(5);
    expect(report.collinearAliasDetected).toBe(false);
    expect(report.boundedBoostInvariantPassed).toBe(true);
    expect(report.maxAuthorityBoostObserved).toBeLessThanOrEqual(0.15);
    expect(report.kendallTauDistance).toBeGreaterThan(0); // PageRank changed ordering
    expect(report.ablationUtilityPassed).toBe(true);
  });

  it('fails ablation when candidate vectors contain a duplicate authority alias', () => {
    const candidates: CandidateScoresForAblation[] = [
      {
        packetKey: 'pkt:A',
        dense: 0.9,
        sparse: 0.8,
        ast: 0.7,
        pagerankAuthority: 0.9,
        aliases: { authority_score_alias: 0.9 }, // exact copy!
      },
      {
        packetKey: 'pkt:B',
        dense: 0.7,
        sparse: 0.6,
        ast: 0.5,
        pagerankAuthority: 0.5,
        aliases: { authority_score_alias: 0.5 },
      },
      {
        packetKey: 'pkt:C',
        dense: 0.5,
        sparse: 0.4,
        ast: 0.3,
        pagerankAuthority: 0.2,
        aliases: { authority_score_alias: 0.2 },
      },
    ];

    const report = runPageRankAuthorityAblationV1({ candidates });

    expect(report.collinearAliasDetected).toBe(true);
    expect(report.ablationUtilityPassed).toBe(false);
    expect(report.detectedCollinearAliases.length).toBeGreaterThan(0);
    expect(report.diagnostics.some((d) => d.includes('COLLINEAR_ALIAS_REJECTED'))).toBe(true);
  });
});
