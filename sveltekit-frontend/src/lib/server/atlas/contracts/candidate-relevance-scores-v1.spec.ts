// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  SemanticSimilarityScoreV1Schema,
  TextRelevanceScoreV1Schema,
  EngineeringUtilityScoreV1Schema,
  shouldEscalateToTextRelevance,
  TEXT_RELEVANCE_ESCALATION_MARGIN,
} from './candidate-relevance-scores-v1.js';

describe('SemanticSimilarityScoreV1', () => {
  it('accepts a valid cosine similarity score', () => {
    const parsed = SemanticSimilarityScoreV1Schema.parse({
      canonicalId: 'cand:1',
      cosineSimilarity: 0.82,
      embeddingModelRevision: 'embeddinggemma-r1',
    });
    expect(parsed.cosineSimilarity).toBe(0.82);
  });

  it('rejects a cosine similarity outside [-1, 1]', () => {
    expect(() =>
      SemanticSimilarityScoreV1Schema.parse({
        canonicalId: 'cand:1',
        cosineSimilarity: 1.5,
        embeddingModelRevision: 'embeddinggemma-r1',
      })
    ).toThrow();
  });
});

describe('TextRelevanceScoreV1 — mxbai-style log-odds scoring', () => {
  it('accepts an unbounded logit delta with a bounded probability', () => {
    const parsed = TextRelevanceScoreV1Schema.parse({
      canonicalId: 'cand:1',
      logitDelta: 7.8,
      probability: 0.9996,
      crossEncoderModelRevision: 'mxbai-rerank-base-v2',
    });
    expect(parsed.logitDelta).toBe(7.8);
  });

  it('rejects a probability outside [0, 1] even if logitDelta is valid', () => {
    expect(() =>
      TextRelevanceScoreV1Schema.parse({
        canonicalId: 'cand:1',
        logitDelta: 7.8,
        probability: 1.2,
        crossEncoderModelRevision: 'mxbai-rerank-base-v2',
      })
    ).toThrow();
  });
});

describe('EngineeringUtilityScoreV1 — never conflated with text relevance', () => {
  it('accepts a valid score with a recorded model family', () => {
    const parsed = EngineeringUtilityScoreV1Schema.parse({
      canonicalId: 'cand:1',
      utilityScore: 0.94,
      modelFamily: 'RANDOM_FOREST',
      modelRevision: 'atlas-rf-r1',
      contributingFeatures: ['pagerank', 'ast_exact_hit', 'test_coverage'],
    });
    expect(parsed.modelFamily).toBe('RANDOM_FOREST');
  });

  it('rejects an unknown model family', () => {
    expect(() =>
      EngineeringUtilityScoreV1Schema.parse({
        canonicalId: 'cand:1',
        utilityScore: 0.94,
        modelFamily: 'DECISION_TREE',
        modelRevision: 'atlas-rf-r1',
        contributingFeatures: [],
      })
    ).toThrow();
  });
});

describe('shouldEscalateToTextRelevance — cost-tiered admission gate', () => {
  it('does not escalate when top scores are well-separated', () => {
    expect(shouldEscalateToTextRelevance([0.96, 0.91, 0.43, 0.31])).toBe(false);
  });

  it('escalates when top scores are closely clustered', () => {
    expect(shouldEscalateToTextRelevance([0.72, 0.71, 0.70, 0.69])).toBe(true);
  });

  it('does not escalate with fewer than 2 candidates', () => {
    expect(shouldEscalateToTextRelevance([0.9])).toBe(false);
    expect(shouldEscalateToTextRelevance([])).toBe(false);
  });

  it('does not escalate at a gap comfortably above the margin', () => {
    expect(shouldEscalateToTextRelevance([0.9, 0.9 - TEXT_RELEVANCE_ESCALATION_MARGIN - 0.01])).toBe(false);
  });

  it('escalates at a gap comfortably below the margin', () => {
    expect(shouldEscalateToTextRelevance([0.9, 0.9 - TEXT_RELEVANCE_ESCALATION_MARGIN + 0.01])).toBe(true);
  });
});
