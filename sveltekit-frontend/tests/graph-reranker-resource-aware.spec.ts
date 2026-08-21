// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  quaternionSimilarity,
  scoreCandidateResourceAware,
} from '../src/lib/server/ai/graph-reranker.js';

describe('resource-aware graph reranking', () => {
  it('does not penalize a candidate when optional enrichment is absent', () => {
    const scores = scoreCandidateResourceAware({ qdrantScore: 0.8 });
    expect(scores.final).toBeCloseTo(0.8, 10);
  });

  it('renormalizes the configured priors over signals that are present', () => {
    const scores = scoreCandidateResourceAware({ qdrantScore: 0.8, pagerankScore: 1.0 });
    expect(scores.final).toBeCloseTo((0.8 * 0.40 + 1.0 * 0.18) / (0.40 + 0.18), 10);
  });

  it('treats opposite S3 feature directions as opposite rather than equivalent rotations', () => {
    expect(quaternionSimilarity([1, 0, 0, 0], [-1, 0, 0, 0])).toBeCloseTo(0, 10);
    expect(quaternionSimilarity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0.5, 10);
    expect(quaternionSimilarity([1, 0, 0, 0], [1, 0, 0, 0])).toBeCloseTo(1, 10);
  });
});
