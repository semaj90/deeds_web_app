import { describe, expect, it } from 'vitest';
import { finalizeAtlasPairJudgmentV1 } from './pair-judgment-finalizer-v1.js';
import type { AtlasPairJudgmentV1 } from './atlas-learning-recommendation-v1.js';

const seed: AtlasPairJudgmentV1 = {
  schema: 'atlas.pair-judgment.v1',
  queryId: 'query:1',
  queryRevision: 'query-rev:1',
  candidateCanonicalId: 'canonical:1',
  candidatePacketKey: 'ace:packet:1',
  candidateSourceRef: 'src/a.ts',
  candidateSourceRevision: 'source:1',
  workspaceRevision: 'workspace:1',
  representationRevision: 'representation:1',
  featureRevision: 'feature:1',
  revisions: {
    schemaRevision: 'schema:1',
    taxonomyRevision: 'taxonomy:1',
    classifierRevision: 'classifier:1',
    featureMappingRevision: 'atlas.candidate-feature-registry.c25.v1',
  },
  evidenceRefs: [
    { evidenceRef: 'retrieval:1', evidenceKind: 'EXECUTION', producerId: 'SearchRuntime', producerRevision: 'test' },
  ],
  retrieval: {
    initialRank: 1,
    semanticScore: 0.9,
    lexicalScore: 0.4,
    astScore: null,
    graphScore: null,
    domainScore: null,
    featureMatrixSha256: 'a'.repeat(64),
  },
  teacher: null,
  exactPromotion: { attempted: false, passed: null, receiptRef: null },
  executionOutcome: { attempted: false, success: null, testPassed: null, repairSucceeded: null, receiptRefs: [] },
  humanRelevanceGrade: null,
  labelRevision: 'atlas.pair-label.shadow-unlabeled.v1',
  trainingEligible: false,
  trainingBlockReasons: ['TEACHER_SCORE_MISSING', 'EXACT_PROMOTION_OUTCOME_MISSING', 'EXECUTION_OUTCOME_MISSING'],
  canonicalWritesAllowed: false,
};

describe('finalizeAtlasPairJudgmentV1', () => {
  it('promotes only when teacher, exact promotion, and execution evidence are complete', () => {
    const result = finalizeAtlasPairJudgmentV1({
      seed,
      teacher: {
        modelId: 'mixedbread-ai/mxbai-rerank-base-v2',
        modelRevision: 'model:1',
        score: 0.88,
        rank: 2,
        receiptRef: 'teacher:receipt:1',
      },
      exactPromotion: { passed: true, receiptRef: 'exact:receipt:1' },
      execution: {
        success: true,
        testPassed: true,
        repairSucceeded: null,
        receiptRefs: ['execution:receipt:1'],
      },
    });
    expect(result.trainingEligible).toBe(true);
    expect(result.trainingBlockReasons).toEqual([]);
    expect(result.teacher?.score).toBe(0.88);
    expect(result.exactPromotion).toMatchObject({ attempted: true, passed: true, receiptRef: 'exact:receipt:1' });
    expect(result.executionOutcome).toMatchObject({ attempted: true, success: true, testPassed: true });
  });

  it('remains blocked if teacher evidence is absent', () => {
    const result = finalizeAtlasPairJudgmentV1({
      seed,
      teacher: null,
      exactPromotion: { passed: true, receiptRef: 'exact:receipt:1' },
      execution: { success: true, testPassed: true, repairSucceeded: null, receiptRefs: ['execution:receipt:1'] },
    });
    expect(result.trainingEligible).toBe(false);
    expect(result.trainingBlockReasons).toContain('TEACHER_SCORE_MISSING');
  });

  it('remains blocked when execution lacks a durable receipt', () => {
    const result = finalizeAtlasPairJudgmentV1({
      seed,
      teacher: { modelId: 'teacher', modelRevision: '1', score: 0.5, rank: 1, receiptRef: 'teacher:1' },
      exactPromotion: { passed: false, receiptRef: 'exact:1' },
      execution: { success: false, testPassed: false, repairSucceeded: false, receiptRefs: [] },
    });
    expect(result.trainingEligible).toBe(false);
    expect(result.trainingBlockReasons).toContain('EXECUTION_RECEIPT_MISSING');
  });

  it('records failed exact promotion as valid labeled evidence when receipt-backed', () => {
    const result = finalizeAtlasPairJudgmentV1({
      seed,
      teacher: { modelId: 'teacher', modelRevision: '1', score: 0.1, rank: 8, receiptRef: 'teacher:1' },
      exactPromotion: { passed: false, receiptRef: 'exact:failed:1' },
      execution: { success: false, testPassed: false, repairSucceeded: false, receiptRefs: ['execution:failed:1'] },
    });
    expect(result.trainingEligible).toBe(true);
    expect(result.exactPromotion.passed).toBe(false);
    expect(result.executionOutcome.success).toBe(false);
  });
});
