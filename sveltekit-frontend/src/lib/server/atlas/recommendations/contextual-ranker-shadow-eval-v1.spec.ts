import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { admitCurrentCandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import { buildSearchRuntimeSelectedCandidateSetV1 } from '../retrieval/search-runtime-selected-candidate-set-v1.js';
import {
  buildBlockedContextualRankerShadowEvalReceiptV1,
  evaluateContextualRankerShadowV1,
  verifyContextualRankerShadowEvalReceiptV1,
} from './contextual-ranker-shadow-eval-v1.js';

const WORKSPACE = `sha256:${'e'.repeat(64)}`;
const SOURCE = `sha256:${'a'.repeat(64)}`;

function fixture(options: { tieScores?: boolean; emptySignals?: boolean } = {}) {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidates: [0, 1, 2, 3, 4].map((index) => ({
      canonicalId: `packet:${index}`, packetKey: `packet:${index}`, sourceRef: `src/${index}.ts`,
      treeNodeId: null, symbolVersionId: null, graphRevision: 'graph:r1', semanticRevision: 'semantic:r1',
      workspaceRevision: WORKSPACE, sourceRevision: SOURCE,
    })),
    candidateSnapshotRevision: 'snapshot:r1', workspaceRevision: WORKSPACE, producerRevision: 'ordinal:r1',
  });
  const selection = buildSearchRuntimeSelectedCandidateSetV1({
    ordinalMap, requestId: 'request:r1', queryDigest: '1'.repeat(64), retrievalPolicyRevision: 'search:r1',
    selectedCandidates: ordinalMap.candidates.map((candidate) => ({
      candidateOrdinal: candidate.candidateOrdinal, canonicalId: candidate.canonicalId, packetKey: candidate.packetKey!,
      sourceRef: candidate.sourceRef!, sourceRevision: candidate.sourceRevision, workspaceRevision: candidate.workspaceRevision,
      score: options.tieScores ? 1 : 1 - candidate.candidateOrdinal / 10, evidenceRefs: [`hit:${candidate.candidateOrdinal}`],
    })),
  });
  const rows: CandidateFeatureRowV1[] = ordinalMap.candidates.map((candidate) => ({
    schema: 'atlas.candidate-feature-row.v1', candidateOrdinal: candidate.candidateOrdinal, canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId, workspaceRevision: candidate.workspaceRevision, sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision, semanticRevision: candidate.semanticRevision, featureRevision: 'features:r1',
    laneMask: ['semantic'], evidenceRefs: [`feature:${candidate.candidateOrdinal}`], semanticRelevance: options.emptySignals ? null : candidate.candidateOrdinal / 10,
    lexicalRelevance: options.emptySignals ? null : 0.5, astAffinity: null, graphAuthority: null, personalizedPageRank: null, communityAffinity: null,
    manifold4OrientationSimilarity: null, crossEncoderRawScore: null, crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false, domainAffinity: null, executionUtility: null, memoryUtility: null,
  }));
  const featureAdmission = admitCurrentCandidateFeatureSnapshotV1({
    ordinalMap, rows, featureRevision: 'features:r1', producerRevision: 'feature-owner:r1',
    sourceRevisionSetChecksum: '2'.repeat(64), candidateSetChecksum: '3'.repeat(64),
    sourceChunkCohortStatus: 'REVISION_QUALIFIED', semanticCohortStatus: 'ADMITTED', graphFeatureStatus: 'ADMITTED',
  });
  return { ordinalMap, selection, featureAdmission, featureSnapshot: featureAdmission.snapshot! };
}

describe('contextual ranker shadow evaluation', () => {
  it('is deterministic except for operational measurements and breaks ties by ordinal', () => {
    const state = fixture({ tieScores: true });
    const result = evaluateContextualRankerShadowV1({ runId: 'fixture-run', ...state });
    expect(result.baselineRanking).toEqual([0, 1, 2, 3, 4]);
    expect(result.shadowRanking).toEqual([4, 3, 2, 1]);
    expect(result.metrics.judgedMetrics).toBeNull();
    expect(result.retrievalOrderChanged).toBe(false);
    expect(() => verifyContextualRankerShadowEvalReceiptV1(result)).not.toThrow();
  });

  it('rejects mismatched feature admission revisions and checksums', () => {
    const state = fixture();
    expect(() => evaluateContextualRankerShadowV1({
      runId: 'bad-admission', ...state,
      featureAdmission: { ...state.featureAdmission, workspaceRevision: `sha256:${'f'.repeat(64)}` },
    })).toThrow('SHADOW_EVAL_ADMISSION_BINDING_MISMATCH');
  });

  it('rejects selection-to-map candidate identity mismatches', () => {
    const state = fixture();
    const selection = { ...state.selection, selectedCandidates: state.selection.selectedCandidates.map((candidate, index) => index === 0 ? { ...candidate, canonicalId: 'wrong' } : candidate) };
    expect(() => evaluateContextualRankerShadowV1({ runId: 'bad-id', ...state, selection })).toThrow();
  });

  it('reports abstention when the feature admission is blocked', () => {
    const state = fixture();
    const blocked = buildBlockedContextualRankerShadowEvalReceiptV1({ runId: 'blocked-run', reason: 'FEATURE_ADMISSION_MISSING', ...state });
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.metrics.abstained).toBe(true);
    expect(blocked.shadowRanking).toEqual([]);
  });

  it('keeps empty-signal candidates in baseline and reports scorer abstention', () => {
    const result = evaluateContextualRankerShadowV1({ runId: 'empty-signals', ...fixture({ emptySignals: true }) });
    expect(result.status).toBe('SHADOW_DIAGNOSTIC');
    expect(result.shadowRanking).toEqual([]);
    expect(result.metrics.abstained).toBe(true);
    expect(result.metrics.eligibleCount).toBe(0);
  });

  it('detects receipt tampering', () => {
    const result = evaluateContextualRankerShadowV1({ runId: 'tamper-run', ...fixture() });
    expect(() => verifyContextualRankerShadowEvalReceiptV1({ ...result, shadowRanking: [0] }))
      .toThrow('CONTEXTUAL_RANKER_SHADOW_RECEIPT_CHECKSUM_MISMATCH');
  });
});
