// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateOrdinalSelectionV1 } from './candidate-ordinal-selection-v1.js';
import { materializeCandidateFeatureSelectionSnapshotV1 } from './candidate-feature-selection-snapshot-v1.js';
import { buildServerFeatureBundleV2, verifyServerFeatureBundleV2 } from './server-feature-bundle-v2.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import { buildRevisionAuthorityEnvelopeV1 } from '../identity/revision-authority-envelope-v1.js';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);
const semanticRevision = 'semantic_768:corpus:fixture:v1';

function authority() {
  const entries = [
    {
      sourceRef: 'src/a.ts',
      sourceRevision: `sha256:${digestA}` as const,
      contentDigest: digestA,
      byteLength: 10,
      gitBlobOid: '1'.repeat(40),
    },
    {
      sourceRef: 'src/b.ts',
      sourceRevision: `sha256:${digestB}` as const,
      contentDigest: digestB,
      byteLength: 12,
      gitBlobOid: '2'.repeat(40),
    },
  ];
  const { record } = buildWorkspaceRevisionRecordV1({
    repositoryId: 'repo:fixture',
    gitObjectFormat: 'sha1',
    baseCommitOid: '3'.repeat(40),
    baseTreeOid: '4'.repeat(40),
    gitHeadRef: 'refs/heads/test',
    dirty: false,
    entries,
    generatedAt: '2026-09-12T00:00:00.000Z',
    producerRevision: 'fixture:workspace:v1',
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record,
    entries,
    trackedAtBaseCommit: new Map(entries.map((entry) => [entry.sourceRef, true])),
    dirtyRelativeToBaseCommit: new Map(entries.map((entry) => [entry.sourceRef, false])),
    producerRevision: 'fixture:bindings:v1',
  });
  return { record, envelope: buildRevisionAuthorityEnvelopeV1({ record, bindings }) };
}

function ordinalMap(workspaceRevision: string) {
  return materializeCandidateOrdinalMap({
    workspaceRevision,
    candidateSnapshotRevision: 'fixture:current-chunks:v1',
    producerRevision: 'fixture:ordinal:v1',
    candidates: [
      {
        canonicalId: 'chunk:a',
        packetKey: 'packet:a',
        sourceRef: 'src/a.ts',
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision,
        sourceRevision: `sha256:${digestA}`,
        graphRevision: null,
        semanticRevision,
        degradedIdentity: false,
        evidenceRefs: ['fixture:a'],
        representationBindings: [],
      },
      {
        canonicalId: 'chunk:b',
        packetKey: 'packet:b',
        sourceRef: 'src/b.ts',
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision,
        sourceRevision: `sha256:${digestB}`,
        graphRevision: null,
        semanticRevision,
        degradedIdentity: false,
        evidenceRefs: ['fixture:b'],
        representationBindings: [],
      },
    ],
  });
}

function semanticRow(map: ReturnType<typeof ordinalMap>, ordinal: number) {
  const candidate = map.candidates[ordinal];
  return {
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: ordinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'semantic-only:fixture:v1',
    representationBindings: [],
    semanticRelevance: 0.93,
    lexicalRelevance: null,
    astAffinity: null,
    graphAuthority: null,
    personalizedPageRank: null,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: null,
    memoryUtility: null,
    laneMask: ['semantic'] as const,
    degradedIdentity: candidate.degradedIdentity,
    evidenceRefs: ['fixture:semantic-score'],
  };
}

describe('ServerFeatureBundleV2', () => {
  it('seals a one-row query selection against a larger immutable ordinal map', () => {
    const { record, envelope } = authority();
    const map = ordinalMap(record.workspaceRevision);
    const selection = materializeCandidateOrdinalSelectionV1({
      requestId: 'request:fixture:1',
      ordinalMap: map,
      selectedOrdinals: [1],
    });
    const snapshot = materializeCandidateFeatureSelectionSnapshotV1({
      ordinalMap: map,
      selection,
      rows: [semanticRow(map, 1)],
      featureRevision: 'semantic-only:fixture:v1',
      producerRevision: 'fixture:feature-selection:v1',
    });
    const bundle = buildServerFeatureBundleV2({
      requestId: 'request:fixture:1',
      ordinalMap: map,
      selection,
      snapshot,
      revisionAuthority: envelope,
    });

    expect(bundle.ordinalMap.rowCount).toBe(2);
    expect(bundle.selectedCandidateCount).toBe(1);
    expect(bundle.selection.selectedOrdinals).toEqual([1]);
    expect(bundle.snapshot.rows[0]?.candidateOrdinal).toBe(1);
    expect(() => verifyServerFeatureBundleV2(bundle)).not.toThrow();
    expect(bundle.writesPerformed).toBe(false);
    expect(bundle.canonicalAuthority).toBe(false);
  });

  it('rejects semantic evidence when the selected ordinal lacks a semantic revision', () => {
    const { record } = authority();
    const map = ordinalMap(record.workspaceRevision);
    const candidate = map.candidates[1];
    const brokenMap = {
      ...map,
      candidates: map.candidates.map((item, index) => index === 1 ? { ...item, semanticRevision: null } : item),
    };
    const selection = materializeCandidateOrdinalSelectionV1({
      requestId: 'request:fixture:2',
      ordinalMap: map,
      selectedOrdinals: [1],
    });
    const row = { ...semanticRow(map, 1), semanticRevision: null };

    expect(() => materializeCandidateFeatureSelectionSnapshotV1({
      ordinalMap: brokenMap as typeof map,
      selection,
      rows: [row],
      featureRevision: 'semantic-only:fixture:v1',
      producerRevision: 'fixture:feature-selection:v1',
    })).toThrow();
    expect(candidate.semanticRevision).toBe(semanticRevision);
  });
});
