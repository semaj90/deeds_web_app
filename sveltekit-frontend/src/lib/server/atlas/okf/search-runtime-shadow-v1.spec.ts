import { describe, expect, it } from 'vitest';
import { CANDIDATE_FEATURE_REGISTRY_REVISION } from './candidate-feature-registry-v1.js';
import {
  compileSearchRuntimeShadowV1,
  sha256QueryText,
  SEARCH_RUNTIME_SHADOW_LABEL_REVISION,
  type SearchRuntimeShadowCaptureV1,
} from './search-runtime-shadow-v1.js';

const revisions = {
  schemaRevision: 'schema:1',
  taxonomyRevision: 'taxonomy:1',
  classifierRevision: 'classifier:1',
  featureMappingRevision: CANDIDATE_FEATURE_REGISTRY_REVISION,
};

function baseCapture(): SearchRuntimeShadowCaptureV1 {
  return {
    schema: 'atlas.search-runtime-shadow.v1',
    queryId: 'query:1',
    queryRevision: 'query-rev:1',
    queryTextSha256: sha256QueryText('find parser'),
    workspaceRevision: 'workspace:1',
    sourceRevision: 'source:1',
    representationRevision: 'representation:1',
    featureRevision: 'feature:1',
    revisions,
    producerId: 'SearchRuntime',
    producerRevision: 'search-runtime:test',
    rankingMutationAllowed: false,
    canonicalWritesAllowed: false,
    candidates: [
      {
        candidateCanonicalId: 'canonical:1',
        packetKey: 'ace:packet:1',
        sourceRef: 'src/parser.ts',
        sourceRevision: 'source:1',
        representationRevision: 'representation:1',
        identityStatus: 'canonical',
        initialRank: 1,
        scoreSource: 'qdrant_768',
        rawScore: 0.91,
        fusionScore: 0.73,
        blendedScore: 0.81,
        pageRankScore: 0.4,
        laneEvidence: [
          { lane: 'dense', bestRank: 1, bestScore: 0.91, supportingHitCount: 1, evidenceRef: 'retrieval:dense:1' },
          { lane: 'lexical', bestRank: 4, bestScore: 0.5, supportingHitCount: 1, evidenceRef: 'retrieval:lexical:1' },
          { lane: 'exact', bestRank: 2, bestScore: 1, supportingHitCount: 1, evidenceRef: 'retrieval:exact:1' },
        ],
        evidenceRefs: [
          { evidenceRef: 'retrieval:receipt:1', evidenceKind: 'EXECUTION', producerId: 'SearchRuntime', producerRevision: 'test' },
        ],
      },
    ],
  };
}

describe('compileSearchRuntimeShadowV1', () => {
  it('compiles canonical candidates into Cx25 rows and blocked pair judgment seeds', () => {
    const result = compileSearchRuntimeShadowV1(baseCapture());
    expect(result.acceptedRows).toHaveLength(1);
    expect(result.rejectedCandidates).toEqual([]);
    expect(result.matrix.rowCount).toBe(1);
    expect(result.matrix.columnCount).toBe(25);
    expect(result.matrix.rowCanonicalIds).toEqual(['canonical:1']);
    expect(result.matrix.rowPacketKeys).toEqual(['ace:packet:1']);

    const row = result.acceptedRows[0];
    const byName = new Map(row.features.map((feature) => [feature.featureName, feature]));
    expect(byName.get('semantic_similarity_768')).toMatchObject({ present: true, value: expect.any(Number) });
    expect(byName.get('lexical_score')).toMatchObject({ present: true, value: 0.5 });
    expect(byName.get('exact_symbol_match')).toMatchObject({ present: true, value: 1 });
    expect(byName.get('source_revision_match')).toMatchObject({ present: true, value: 1 });
    expect(byName.get('representation_revision_match')).toMatchObject({ present: true, value: 1 });
    expect(byName.get('authority_norm')).toMatchObject({ present: false, value: 0 });

    const seed = result.pairJudgmentSeeds[0];
    expect(seed.trainingEligible).toBe(false);
    expect(seed.labelRevision).toBe(SEARCH_RUNTIME_SHADOW_LABEL_REVISION);
    expect(seed.teacher).toBeNull();
    expect(seed.trainingBlockReasons).toEqual([
      'TEACHER_SCORE_MISSING',
      'EXACT_PROMOTION_OUTCOME_MISSING',
      'EXECUTION_OUTCOME_MISSING',
    ]);
    expect(seed.retrieval.featureMatrixSha256).toBe(result.matrix.matrixSha256);
    expect(result.rankingMutationAllowed).toBe(false);
    expect(result.trainingPromotionAllowed).toBe(false);
  });

  it('rejects degraded identity rather than deriving canonical identity from packetKey', () => {
    const capture = baseCapture();
    capture.candidates[0].identityStatus = 'degraded';
    const result = compileSearchRuntimeShadowV1(capture);
    expect(result.acceptedRows).toHaveLength(0);
    expect(result.matrix.rowCount).toBe(0);
    expect(result.rejectedCandidates).toEqual([
      {
        packetKey: 'ace:packet:1',
        candidateCanonicalId: 'canonical:1',
        reasonCode: 'DEGRADED_IDENTITY',
      },
    ]);
  });

  it('rejects representation revision drift', () => {
    const capture = baseCapture();
    capture.candidates[0].representationRevision = 'representation:other';
    const result = compileSearchRuntimeShadowV1(capture);
    expect(result.acceptedRows).toHaveLength(0);
    expect(result.rejectedCandidates[0]?.reasonCode).toBe('REPRESENTATION_REVISION_MISMATCH');
  });

  it('does not reinterpret PageRank as authority_norm', () => {
    const result = compileSearchRuntimeShadowV1(baseCapture());
    const authority = result.acceptedRows[0].features.find((feature) => feature.featureName === 'authority_norm');
    expect(authority).toMatchObject({ present: false, value: 0 });
  });

  it('is deterministic for the same capture', () => {
    const a = compileSearchRuntimeShadowV1(baseCapture());
    const b = compileSearchRuntimeShadowV1(baseCapture());
    expect(a.captureSha256).toBe(b.captureSha256);
    expect(a.matrix.matrixSha256).toBe(b.matrix.matrixSha256);
    expect(a.matrix.rowPacketKeys).toEqual(b.matrix.rowPacketKeys);
  });
});
