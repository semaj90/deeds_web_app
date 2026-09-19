import { describe, expect, it } from 'vitest';
import { candidateFeatureSnapshotChecksum } from '../features/candidate-feature-snapshot-v1.js';
import {
  admitRerankerEvaluationV1,
  buildXgboostHeldOutEvaluationReceiptV1,
  buildXgboostRankingCandidatesFromFeatureSnapshotV1,
  groupXgboostRankingCandidatesV1,
  rankingLineageChecksumV1,
} from './xgboost-ranking-lineage-v1.js';

const row = (queryId: string, candidateOrdinal: number, overrides: Record<string, unknown> = {}) => ({
  queryId,
  candidateOrdinal,
  canonicalId: `candidate:${candidateOrdinal}`,
  sourceRef: `src/${candidateOrdinal}.ts`,
  sourceRevision: 'git:abc',
  workspaceRevision: 'sha256:workspace',
  representationRevision: 'semantic_768:v1',
  graphRevision: 'graph:1',
  featureRevision: 'features:1',
  providerRevision: 'ast-grep:1',
  modelRevision: 'embeddinggemma:v1',
  candidateSnapshotRevision: 'snapshot:1',
  ordinalMapChecksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  labelRevision: 'labels:1',
  labelSource: 'human_judgment',
  labelEvidenceChecksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  label: candidateOrdinal % 3,
  features: [0.1, 0.2],
  evidenceRefs: [`evidence:${candidateOrdinal}`],
  ...overrides,
});

describe('admitRerankerEvaluationV1', () => {
  const checksums = {
    corpusChecksum: 'a'.repeat(64),
    modelArtifactChecksum: 'b'.repeat(64),
    heldOutReceiptChecksum: 'c'.repeat(64),
  };

  it('blocks evaluation when the corpus is not admitted', () => {
    const result = admitRerankerEvaluationV1({
      corpusStatus: 'BLOCKED',
      evaluationStatus: 'MISSING',
      ...checksums,
    });
    expect(result.status).toBe('BLOCKED_CORPUS');
    expect(result.trainingAuthorized).toBe(false);
    expect(result.promotionAuthorized).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('requires held-out proof even when the corpus is admitted', () => {
    const result = admitRerankerEvaluationV1({
      corpusStatus: 'ADMITTED',
      evaluationStatus: 'MISSING',
      ...checksums,
    });
    expect(result.status).toBe('BLOCKED_EVALUATION');
    expect(result.trainingAuthorized).toBe(false);
    expect(result.reason).toBe('EVALUATION_MISSING');
  });

  it('marks a fully evidenced evaluation ready without authorizing promotion', () => {
    const result = admitRerankerEvaluationV1({
      corpusStatus: 'ADMITTED',
      evaluationStatus: 'HELD_OUT_PROVEN',
      ...checksums,
    });
    expect(result.status).toBe('EVALUATION_READY');
    expect(result.trainingAuthorized).toBe(false);
    expect(result.promotionAuthorized).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
  });
});

describe('XgboostHeldOutEvaluationReceiptV1', () => {
  it('requires disjoint source-revision splits and explicit metrics', () => {
    const receipt = buildXgboostHeldOutEvaluationReceiptV1({
      modelRevision: 'sha256:model-v1',
      datasetRevision: 'sha256:dataset-v1',
      trainSourceRevisions: ['sha256:train-a', 'sha256:train-b'],
      heldOutSourceRevisions: ['sha256:test-a'],
      metrics: { ndcgAt10: 0.75, evaluatedRows: 12 },
    });

    expect(receipt.sourceRevisionSplitDisjoint).toBe(true);
    expect(receipt.metrics).toEqual({ ndcgAt10: 0.75, evaluatedRows: 12 });
    expect(receipt.promotionAuthorized).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('rejects training and held-out source-revision overlap', () => {
    expect(() => buildXgboostHeldOutEvaluationReceiptV1({
      modelRevision: 'sha256:model-v1',
      datasetRevision: 'sha256:dataset-v1',
      trainSourceRevisions: ['sha256:shared'],
      heldOutSourceRevisions: ['sha256:shared'],
      metrics: { ndcgAt10: 0.75, evaluatedRows: 1 },
    })).toThrow(/HELD_OUT_SOURCE_REVISION_OVERLAP/);
  });
});

describe('XGBoost ranking lineage preparation', () => {
  const snapshot = () => {
    const row = {
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 0,
      canonicalId: 'candidate:0',
      packetKey: 'packet:0',
      sourceRef: 'src/0.ts',
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: 'workspace:1',
      sourceRevision: 'source:1',
      graphRevision: 'graph:1',
      semanticRevision: null,
      featureRevision: 'features:1',
      representationBindings: [],
      semanticRelevance: 0.9,
      lexicalRelevance: 0.8,
      astAffinity: 0.7,
      graphAuthority: 0.6,
      personalizedPageRank: 0.5,
      communityAffinity: 0.4,
      manifold4OrientationSimilarity: 0.3,
      crossEncoderRawScore: 0.15,
      crossEncoderCalibratedScore: 0.55,
      crossEncoderAvailable: true,
      domainAffinity: 0.2,
      executionUtility: 0.1,
      memoryUtility: 0.05,
      laneMask: [],
      degradedIdentity: false,
      evidenceRefs: ['evidence:0'],
    };
    const payload = {
      candidateSnapshotRevision: 'candidate-snapshot:1',
      ordinalMapChecksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      workspaceRevision: 'workspace:1',
      featureRevision: 'features:1',
      rows: [row],
    };
    return {
      schema: 'atlas.candidate-feature-snapshot.v1',
      ...payload,
      rowCount: 1,
      snapshotChecksum: candidateFeatureSnapshotChecksum(payload),
      identityAuthority: false,
      canonicalOwnerChanged: false,
      producerRevision: 'producer:1',
    };
  };

  it('maps an admitted feature snapshot only with explicit label evidence', () => {
    const rows = buildXgboostRankingCandidatesFromFeatureSnapshotV1({
      snapshot: snapshot(),
      queryId: 'query:1',
      representationRevision: 'semantic_768:v1',
      modelRevision: 'embeddinggemma:v1',
      labelsByCanonicalId: {
        'candidate:0': {
          label: 2,
          labelRevision: 'labels:1',
          labelSource: 'human_judgment',
          labelEvidenceChecksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          evidenceRefs: ['judgment:0'],
        },
      },
    });
    expect(rows[0]?.canonicalId).toBe('candidate:0');
    expect(rows[0]?.features).toHaveLength(12);
    expect(rows[0]?.label).toBe(2);
  });

  it('rejects a snapshot row without a matching explicit label', () => {
    expect(() => buildXgboostRankingCandidatesFromFeatureSnapshotV1({
      snapshot: snapshot(),
      queryId: 'query:1',
      representationRevision: 'semantic_768:v1',
      modelRevision: 'embeddinggemma:v1',
      labelsByCanonicalId: {},
    })).toThrow();
  });

  it('rejects a snapshot row without an explicit source reference', () => {
    const unbound = snapshot() as any;
    unbound.rows[0].sourceRef = null;
    expect(() => buildXgboostRankingCandidatesFromFeatureSnapshotV1({
      snapshot: unbound,
      queryId: 'query:1',
      representationRevision: 'semantic_768:v1',
      modelRevision: 'embeddinggemma:v1',
      labelsByCanonicalId: {
        'candidate:0': {
          label: 2,
          labelRevision: 'labels:1',
          labelSource: 'human_judgment',
          labelEvidenceChecksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          evidenceRefs: ['judgment:0'],
        },
      },
    })).toThrow('XGBOOST_RANKING_SOURCE_REF_REQUIRED');
  });

  it('sorts queries and candidate ordinals independently of input order', () => {
    const groups = groupXgboostRankingCandidatesV1([row('q2', 1), row('q1', 2), row('q1', 1)]);
    expect(groups.map((group) => [group.qid, group.queryId, group.candidates.map((candidate) => candidate.candidateOrdinal)])).toEqual([
      [0, 'q1', [1, 2]], [1, 'q2', [1]],
    ]);
  });

  it('rejects mixed feature lineage inside one query group', () => {
    expect(() => groupXgboostRankingCandidatesV1([
      row('q1', 1), row('q1', 2, { featureRevision: 'features:2' }),
    ])).toThrow('XGBOOST_RANKING_LINEAGE_MISMATCH');
  });

  it('produces a stable checksum for the grouped evidence rows', () => {
    const first = groupXgboostRankingCandidatesV1([row('q1', 2), row('q1', 1)]);
    const second = groupXgboostRankingCandidatesV1([row('q1', 1), row('q1', 2)]);
    expect(rankingLineageChecksumV1(first)).toBe(rankingLineageChecksumV1(second));
  });
});
