import { describe, expect, it } from 'vitest';
import {
  auditPacketFacingPageRankDistributionV1,
  evaluatePageRankDistributionSanityV1,
} from './pagerank-distribution-sanity-v1.js';

describe('pagerank-distribution-sanity-v1', () => {
  it('passes sanity check for a healthy, non-degenerate distribution', () => {
    // 10 distinct scores with realistic L1-normalized values
    const scores = [0.05, 0.08, 0.12, 0.15, 0.03, 0.07, 0.20, 0.10, 0.14, 0.06];
    const report = evaluatePageRankDistributionSanityV1({
      scores,
      lineage: {
        graphRevision: 'graph-rev-v1',
        algorithm: 'pagerank',
        runId: 'run-01',
        status: 'promoted',
      },
      requirePromoted: true,
    });

    expect(report.overallSanityPassed).toBe(true);
    expect(report.isFinite).toBe(true);
    expect(report.isVarianceSane).toBe(true);
    expect(report.isNonDegenerate).toBe(true);
    expect(report.distinctScores).toBe(10);
    expect(report.nodeCount).toBe(10);
    expect(report.variance).toBeGreaterThan(1e-12);
    expect(report.rejectionReasons).toHaveLength(0);
  });

  it('rejects degenerate distribution where all scores are identical (uniform fallback)', () => {
    // 5 nodes all having identical score 0.2 (common default/uncomputed state)
    const scores = [0.2, 0.2, 0.2, 0.2, 0.2];
    const report = evaluatePageRankDistributionSanityV1({
      scores,
      lineage: {
        graphRevision: 'graph-rev-v1',
        algorithm: 'pagerank',
        runId: 'run-uniform',
        status: 'promoted',
      },
    });

    expect(report.overallSanityPassed).toBe(false);
    expect(report.isNonDegenerate).toBe(false);
    expect(report.distinctScores).toBe(1);
    expect(report.variance).toBe(0);
    expect(report.isVarianceSane).toBe(false);
    expect(report.rejectionReasons).toContain(
      'PAGERANK_DEGENERATE_UNIFORM_DISTRIBUTION:distinct=1',
    );
  });

  it('audits packet-facing scores and catches degenerate 2-score distribution', () => {
    // Mimicking atlas_packets.pagerank_score which currently has only 2 distinct values (0 and 0.5)
    const mockPacketResults = [
      { packetKey: 'pkt:1', pageRankScore: 0.5 },
      { packetKey: 'pkt:2', pageRankScore: 0.5 },
      { packetKey: 'pkt:3', pageRankScore: 0.0 },
      { packetKey: 'pkt:4', pageRankScore: 0.5 },
    ];

    const report = auditPacketFacingPageRankDistributionV1(mockPacketResults, {
      graphRevision: 'atlas_packets-live',
      requirePromoted: true,
      status: 'unpromoted',
    });

    expect(report.overallSanityPassed).toBe(false);
    expect(report.isPromoted).toBe(false);
    expect(report.distinctScores).toBe(2);
    expect(report.rejectionReasons).toContain('PAGERANK_NOT_PROMOTED:status=unpromoted');
  });

  it('rejects scores containing non-finite values (NaN / Infinity)', () => {
    const scores = [0.1, NaN, 0.4, Infinity, 0.2];
    const report = evaluatePageRankDistributionSanityV1({
      scores,
      lineage: {
        graphRevision: 'graph-rev-v1',
        algorithm: 'pagerank',
      },
    });

    expect(report.overallSanityPassed).toBe(false);
    expect(report.isFinite).toBe(false);
    expect(report.nonFiniteCount).toBe(2);
    expect(report.rejectionReasons).toContain('PAGERANK_NON_FINITE_SCORES:2');
  });

  it('rejects missing graphRevision in lineage', () => {
    const scores = [0.1, 0.2, 0.3];
    const report = evaluatePageRankDistributionSanityV1({
      scores,
      lineage: {
        graphRevision: '',
        algorithm: 'pagerank',
      },
    });

    expect(report.overallSanityPassed).toBe(false);
    expect(report.hasLineage).toBe(false);
    expect(report.rejectionReasons).toContain('PAGERANK_LINEAGE_MISSING_GRAPH_REVISION');
  });

  it('rejects algorithm mismatch in lineage', () => {
    const scores = [0.1, 0.2, 0.3];
    const report = evaluatePageRankDistributionSanityV1({
      scores,
      lineage: {
        graphRevision: 'rev-1',
        algorithm: 'cheirank' as any,
      },
    });

    expect(report.overallSanityPassed).toBe(false);
    expect(report.rejectionReasons).toContain('PAGERANK_ALGORITHM_MISMATCH:cheirank');
  });
});
