import { describe, expect, it } from 'vitest';
import {
  ACEPacketResidencyV1Schema,
  AtlasPairJudgmentV1Schema,
  GpuWorkLeaseV1Schema,
  RecommendationEvidenceV1Schema,
  RelatedFileScoreV1Schema,
} from './atlas-learning-recommendation-v1.js';

const revisions = {
  schemaRevision: 'okf-schema-r1',
  taxonomyRevision: 'okf-taxonomy-r1',
  classifierRevision: 'classifier-r1',
  featureMappingRevision: 'feature-map-r1',
};

const evidenceRef = {
  evidenceRef: 'receipt:retrieval:1',
  evidenceKind: 'EXECUTION' as const,
  producerId: 'search-runtime',
  producerRevision: 'search-runtime-r1',
};

function pairJudgment() {
  return {
    schema: 'atlas.pair-judgment.v1' as const,
    queryId: 'q1',
    queryRevision: 'q1-r1',
    candidateCanonicalId: 'canonical-a',
    candidatePacketKey: 'ace:packet:a',
    candidateSourceRef: 'src/a.ts',
    candidateSourceRevision: 'src-r1',
    workspaceRevision: 'workspace-742',
    representationRevision: 'semantic-512-r1',
    featureRevision: 'feature-r1',
    revisions,
    evidenceRefs: [evidenceRef],
    retrieval: {
      initialRank: 3,
      semanticScore: 0.9,
      lexicalScore: 0.4,
      astScore: 0.7,
      graphScore: 0.3,
      domainScore: 0.8,
      featureMatrixSha256: 'a'.repeat(64),
    },
    teacher: {
      modelId: 'mixedbread-ai/mxbai-rerank-base-v2',
      modelRevision: 'teacher-r1',
      score: 0.92,
      rank: 1,
    },
    exactPromotion: {
      attempted: true,
      passed: true,
      receiptRef: 'receipt:promotion:1',
    },
    executionOutcome: {
      attempted: true,
      success: true,
      testPassed: true,
      repairSucceeded: null,
      receiptRefs: ['receipt:execution:1'],
    },
    humanRelevanceGrade: 4,
    labelRevision: 'label-r1',
    trainingEligible: true,
    trainingBlockReasons: [],
    canonicalWritesAllowed: false as const,
  };
}

describe('Atlas learning and recommendation contracts', () => {
  it('accepts a revision-qualified pair judgment', () => {
    const parsed = AtlasPairJudgmentV1Schema.parse(pairJudgment());
    expect(parsed.teacher?.modelId).toContain('mixedbread');
    expect(parsed.trainingEligible).toBe(true);
  });

  it('requires a receipt when exact promotion passes', () => {
    const row = pairJudgment();
    row.exactPromotion.receiptRef = null as never;
    expect(() => AtlasPairJudgmentV1Schema.parse(row)).toThrow();
  });

  it('does not allow blocked rows to claim training eligibility', () => {
    const row = pairJudgment();
    row.trainingBlockReasons = ['SOURCE_REVISION_UNPROVEN'];
    expect(() => AtlasPairJudgmentV1Schema.parse(row)).toThrow();
  });

  it('requires typed evidence for related files', () => {
    const related = RelatedFileScoreV1Schema.parse({
      schema: 'atlas.related-file-score.v1',
      subjectCanonicalId: 'canonical-a',
      targetSourceRef: 'src/b.ts',
      score: 0.75,
      typedReasons: ['CALL_RELATED', 'OBSERVED_SUCCESS'],
      evidenceRefs: [evidenceRef],
      workspaceRevision: 'workspace-742',
      sourceRevision: 'src-r1',
      graphRevision: 'graph-r1',
      featureRevision: 'feature-r1',
      compilerRevision: 'related-file-r1',
      canonicalWritesAllowed: false,
    });
    expect(related.typedReasons).toContain('CALL_RELATED');
  });

  it('keeps recommendation evidence non-authoritative', () => {
    const recommendation = RecommendationEvidenceV1Schema.parse({
      schema: 'atlas.recommendation-evidence.v1',
      recommendationId: 'rec-1',
      subjectCanonicalId: 'canonical-a',
      workspaceRevision: 'workspace-742',
      sourceRevision: 'src-r1',
      representationRevision: 'semantic-512-r1',
      featureRevision: 'feature-r1',
      revisions,
      relatedFiles: [],
      supportingReceiptRefs: ['receipt:retrieval:1'],
      supportingEvidenceRefs: [evidenceRef],
      priorSuccessfulExecutionRefs: [],
      inferenceConfidence: 0.8,
      evidenceAuthority: false,
      mutationAuthorized: false,
      canonicalWritesAllowed: false,
    });
    expect(recommendation.mutationAuthorized).toBe(false);
  });

  it('requires revision-qualified BitFrost bucket keys', () => {
    const good = {
      schema: 'atlas.ace-packet-residency.v1' as const,
      packetKey: 'ace:packet:a',
      candidateOrdinal: 42,
      workspaceRevision: '742',
      sourceRevision: 'src-r1',
      representationRevision: 'semantic-512-r1',
      frequency: 3,
      breadth: 2,
      recency: 0.9,
      reuseProbability: 0.8,
      semanticCost: 1.2,
      hydrationCost: 2.1,
      rerankCost: 1.4,
      byteCost: 512,
      utility: 0.7,
      targetTier: 'HOT' as const,
      bucketKeys: ['bf:742:domain:retrieval', 'bf:742:community:84'],
      ttlSeconds: 600,
      reasonCodes: ['HIGH_REUSE'],
      evidenceRefs: [evidenceRef],
      streamEventAuthorized: false as const,
      valkeyWritesAllowed: false as const,
      canonicalWritesAllowed: false as const,
    };
    expect(ACEPacketResidencyV1Schema.parse(good).candidateOrdinal).toBe(42);
    expect(() => ACEPacketResidencyV1Schema.parse({ ...good, bucketKeys: ['bf:old:domain:retrieval'] })).toThrow();
  });

  it('keeps GPU leasing separate from computation ownership', () => {
    const lease = GpuWorkLeaseV1Schema.parse({
      schema: 'atlas.gpu-work-lease.v1',
      requestId: 'request-1',
      workType: 'CROSS_ENCODER',
      workspaceRevision: 'workspace-742',
      representationRevision: 'semantic-512-r1',
      estimatedVramBytes: 500_000_000,
      priority: 50,
      deadlineEpochMs: null,
      owner: 'reranker-sidecar',
      granted: false,
      evidenceRefs: [],
      computationOwnerChanged: false,
      canonicalWritesAllowed: false,
    });
    expect(lease.computationOwnerChanged).toBe(false);
  });
});
