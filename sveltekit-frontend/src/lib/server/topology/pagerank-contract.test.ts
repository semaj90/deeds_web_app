import { describe, expect, it } from 'vitest';

import { PAGERANK_CONTRACT_VERSION } from './pagerank-contract.js';
import { applyAuthorityBoost } from '../retrieval/authority-boost.js';
import { classifyAuthorityBand, deriveAuthorityScores } from './authority-derivation.js';
import { validateRawPageRank } from './pagerank-validation.js';

describe('PageRank contracts', () => {
  it('keeps the contract version stable', () => {
    expect(PAGERANK_CONTRACT_VERSION).toBe('atlas.pagerank.authority.v1');
  });

  it('validates raw scores as a probability distribution', () => {
    const evaluation = validateRawPageRank(
      [
        { packetKey: 'a', rawScore: 0.5 },
        { packetKey: 'b', rawScore: 0.3 },
        { packetKey: 'c', rawScore: 0.2 },
      ],
      {
        expectedNodeCount: 3,
        converged: true,
        actualIterations: 12,
      },
    );

    expect(evaluation.status).toBe('pass');
    expect(evaluation.sumRaw).toBeCloseTo(1, 6);
    expect(evaluation.zeroCount).toBe(0);
  });

  it('derives percentile-based authority scores', () => {
    const derived = deriveAuthorityScores(
      [
        { packetKey: 'low', rawScore: 0.1 },
        { packetKey: 'mid', rawScore: 0.3 },
        { packetKey: 'high', rawScore: 0.9 },
      ],
      {
        runId: 'run-1',
        contractVersion: PAGERANK_CONTRACT_VERSION,
        graphSnapshotHash: 'hash-1',
      },
    );

    expect(derived[0].authorityBand).toBe('none');
    expect(derived[2].authorityBand).toBe('critical');
    expect(derived[2].percentile).toBeGreaterThan(derived[1].percentile);
    expect(derived[2].authorityScore).toBeLessThanOrEqual(1);
  });

  it('bounds authority boosts so semantic relevance still dominates', () => {
    const boosted = applyAuthorityBoost({
      semanticScore: 0.2,
      authorityScore: 1,
    });

    expect(boosted.semanticScore).toBeCloseTo(0.2, 6);
    expect(boosted.authorityBoost).toBeLessThanOrEqual(0.15);
    expect(boosted.finalScore).toBeGreaterThan(0.2);
    expect(boosted.finalScore).toBeLessThan(1);
  });

  it('classifies authority bands by percentile', () => {
    expect(classifyAuthorityBand(0)).toBe('none');
    expect(classifyAuthorityBand(0.2)).toBe('low');
    expect(classifyAuthorityBand(0.7)).toBe('medium');
    expect(classifyAuthorityBand(0.9)).toBe('high');
    expect(classifyAuthorityBand(0.99)).toBe('critical');
  });
});
