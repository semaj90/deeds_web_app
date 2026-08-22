import { describe, expect, it } from 'vitest';

import {
  assertExecutorIdIsNotCanonicalIdentity,
  materializeCandidateOrdinalMap,
  resolveCanonicalCandidateByOrdinal,
} from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot, selectCandidateFeatureRows } from './candidate-feature-snapshot-v1.js';

function identities() {
  return [
    {
      canonicalId: 'canonical:z',
      packetKey: 'packet:z',
      treeNodeId: 'tree:z',
      symbolVersionId: 'symbol:z',
      workspaceRevision: 'workspace:1',
      sourceRevision: 'source:z:1',
      graphRevision: 'graph:1',
      semanticRevision: 'semantic:768:1',
      degradedIdentity: false,
      evidenceRefs: ['evidence:z'],
    },
    {
      canonicalId: 'canonical:a',
      packetKey: 'packet:a',
      treeNodeId: 'tree:a',
      symbolVersionId: 'symbol:a',
      workspaceRevision: 'workspace:1',
      sourceRevision: 'source:a:1',
      graphRevision: 'graph:1',
      semanticRevision: 'semantic:768:1',
      degradedIdentity: false,
      evidenceRefs: ['evidence:a'],
    },
  ];
}

function row(candidate: ReturnType<typeof materializeCandidateOrdinalMap>['candidates'][number], featureRevision = 'feature:1') {
  return {
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision,
    semanticRelevance: 0.9,
    lexicalRelevance: 0.7,
    astAffinity: 0.8,
    graphAuthority: 0.6,
    personalizedPageRank: null,
    communityAffinity: 0.5,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: 0.75,
    executionUtility: null,
    memoryUtility: null,
    laneMask: ['semantic', 'lexical', 'ast', 'graph', 'domain'] as const,
    degradedIdentity: candidate.degradedIdentity,
    evidenceRefs: [`row:${candidate.candidateOrdinal}`],
  };
}

describe('CanonicalCandidateV1 / CandidateOrdinalMapV1', () => {
  it('assigns deterministic ordinals independent of input order', () => {
    const a = materializeCandidateOrdinalMap({
      candidates: identities(),
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    });
    const b = materializeCandidateOrdinalMap({
      candidates: [...identities()].reverse(),
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    });

    expect(a.ordinalMapChecksum).toBe(b.ordinalMapChecksum);
    expect(a.candidates.map((candidate) => [candidate.candidateOrdinal, candidate.canonicalId])).toEqual([
      [0, 'canonical:a'],
      [1, 'canonical:z'],
    ]);
    expect(resolveCanonicalCandidateByOrdinal(a, 1).packetKey).toBe('packet:z');
    expect(a.identityAuthority).toBe(false);
  });

  it('rejects duplicate canonical identities and mixed workspace revisions', () => {
    expect(() => materializeCandidateOrdinalMap({
      candidates: [identities()[0], identities()[0]],
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    })).toThrow('CANDIDATE_CANONICAL_ID_DUPLICATE');

    expect(() => materializeCandidateOrdinalMap({
      candidates: [{ ...identities()[0], workspaceRevision: 'workspace:2' }],
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    })).toThrow('CANDIDATE_WORKSPACE_REVISION_MISMATCH');
  });

  it('rejects executor-local IDs substituting for canonical identity', () => {
    expect(() => assertExecutorIdIsNotCanonicalIdentity({ canonicalId: '7', candidateOrdinal: 7 }))
      .toThrow('EXECUTOR_IDENTITY_SUBSTITUTION_REJECTED:candidateOrdinal');
    expect(() => assertExecutorIdIsNotCanonicalIdentity({ canonicalId: 'qdrant:1', qdrantPointId: 'qdrant:1' }))
      .toThrow('EXECUTOR_IDENTITY_SUBSTITUTION_REJECTED:qdrantPointId');
    expect(() => assertExecutorIdIsNotCanonicalIdentity({ canonicalId: 'gpu:9', gpuNodeId: 'gpu:9' }))
      .toThrow('EXECUTOR_IDENTITY_SUBSTITUTION_REJECTED:gpuNodeId');
  });
});

describe('CandidateFeatureSnapshotV1', () => {
  it('materializes exactly one revision-safe feature row per ordinal', () => {
    const map = materializeCandidateOrdinalMap({
      candidates: identities(),
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    });
    const snapshot = materializeCandidateFeatureSnapshot({
      ordinalMap: map,
      rows: [row(map.candidates[1]), row(map.candidates[0])],
      featureRevision: 'feature:1',
      producerRevision: 'test:v1',
    });

    expect(snapshot.rows.map((value) => value.candidateOrdinal)).toEqual([0, 1]);
    expect(snapshot.ordinalMapChecksum).toBe(map.ordinalMapChecksum);
    expect(snapshot.candidateSnapshotRevision).toBe('candidate:s1');
    expect(snapshot.identityAuthority).toBe(false);
    expect(snapshot.canonicalOwnerChanged).toBe(false);
    expect(selectCandidateFeatureRows(snapshot, [1, 0]).map((value) => value.canonicalId))
      .toEqual(['canonical:z', 'canonical:a']);
  });

  it('fails closed on revision or identity drift', () => {
    const map = materializeCandidateOrdinalMap({
      candidates: identities(),
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    });

    expect(() => materializeCandidateFeatureSnapshot({
      ordinalMap: map,
      rows: [row(map.candidates[0], 'feature:wrong'), row(map.candidates[1])],
      featureRevision: 'feature:1',
      producerRevision: 'test:v1',
    })).toThrow('FEATURE_REVISION_MISMATCH');

    expect(() => materializeCandidateFeatureSnapshot({
      ordinalMap: map,
      rows: [{ ...row(map.candidates[0]), packetKey: 'packet:wrong' }, row(map.candidates[1])],
      featureRevision: 'feature:1',
      producerRevision: 'test:v1',
    })).toThrow('FEATURE_ROW_IDENTITY_REVISION_MISMATCH:0:packetKey');
  });

  it('rejects missing and duplicate ordinals instead of padding logical candidates', () => {
    const map = materializeCandidateOrdinalMap({
      candidates: identities(),
      candidateSnapshotRevision: 'candidate:s1',
      workspaceRevision: 'workspace:1',
      producerRevision: 'test:v1',
    });

    expect(() => materializeCandidateFeatureSnapshot({
      ordinalMap: map,
      rows: [row(map.candidates[0])],
      featureRevision: 'feature:1',
      producerRevision: 'test:v1',
    })).toThrow('FEATURE_SNAPSHOT_ROW_COUNT_MISMATCH');

    expect(() => materializeCandidateFeatureSnapshot({
      ordinalMap: map,
      rows: [row(map.candidates[0]), row(map.candidates[0])],
      featureRevision: 'feature:1',
      producerRevision: 'test:v1',
    })).toThrow('FEATURE_ROW_DUPLICATE_ORDINAL');
  });
});
