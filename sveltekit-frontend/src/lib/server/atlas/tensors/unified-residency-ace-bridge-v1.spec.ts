import { describe, expect, it } from 'vitest';
import { buildAceContextManifestAdmissionV1 } from '../context/ace-context-manifest-admission-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { prepareUnifiedResidencyAceBridgeV1 } from './unified-residency-ace-bridge-v1.js';

describe('unified residency ACE bridge v1', () => {
  const snapshot = {
      schema: 'atlas.candidate-feature-snapshot.v1', candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: 'a'.repeat(64),
      workspaceRevision: 'workspace:r1', featureRevision: 'feature:r1', rowCount: 1,
      rows: [{ schema: 'atlas.candidate-feature-row.v1', candidateOrdinal: 0, canonicalId: 'c0', packetKey: 'p0', treeNodeId: null, symbolVersionId: null, workspaceRevision: 'workspace:r1', sourceRevision: 'source:r1', graphRevision: null, semanticRevision: 'semantic:r1', featureRevision: 'feature:r1', representationBindings: [], semanticRelevance: 1, lexicalRelevance: null, astAffinity: null, graphAuthority: null, personalizedPageRank: null, communityAffinity: null, manifold4OrientationSimilarity: null, crossEncoderRawScore: null, crossEncoderCalibratedScore: null, crossEncoderAvailable: false, domainAffinity: null, executionUtility: null, memoryUtility: null, laneMask: ['semantic'], degradedIdentity: false, evidenceRefs: ['evidence:0'] }],
      snapshotChecksum: 'b'.repeat(64), identityAuthority: false, canonicalOwnerChanged: false, producerRevision: 'producer:r1'
    } as unknown as CandidateFeatureSnapshotV1;
  const admission = (candidateSnapshot: CandidateFeatureSnapshotV1, selectedOrdinals?: number[]) => buildAceContextManifestAdmissionV1({
    snapshot: candidateSnapshot,
    requestId: 'request:r1',
    selectedOrdinals,
    tokenBudget: 512,
    retrievalPolicyRevision: 'retrieval:r1',
    acePlaybookRevision: 'playbook:r1',
    representationRevision: 'semantic:r1',
    graphRevision: null,
  });

  const input = (candidateSnapshot: CandidateFeatureSnapshotV1, admitted: ReturnType<typeof admission>) => ({
    snapshot: candidateSnapshot,
    admission: admitted,
    domain: 'contracts',
    lutRevision: 'lut:r1',
    lut: { contracts: { lutRevision: 'lut:r1', tokenBudget: 512, featureMask: ['semantic'], tileWidth: 256, contextWindow: 1024, residencyPriority: 1 } },
    representationRevision: 'semantic:r1',
    modelRevision: 'model:r1',
    tokenizerRevision: 'tokenizer:r1',
    ropeRevision: 'rope:r1',
  });

  it('preserves admitted snapshot lineage and emits descriptor-only feature tiles', () => {
    const admitted = admission(snapshot);
    const result = prepareUnifiedResidencyAceBridgeV1(input(snapshot, admitted));
    expect(result.descriptors).toHaveLength(1);
    expect(result.descriptors[0]?.candidateOrdinal).toBe(0);
    expect(result.descriptors[0]?.workspaceRevision).toBe('workspace:r1');
    expect(result.descriptors[0]?.state).toBe('EMPTY');
    expect(result.writesPerformed).toBe(false);
  });

  it('plans only the candidate ordinals selected by the admitted ContextManifest', () => {
    const secondRow = { ...snapshot.rows[0]!, candidateOrdinal: 1, canonicalId: 'c1', packetKey: 'p1', sourceRevision: 'source:r2', evidenceRefs: ['evidence:1'] };
    const twoRows = { ...snapshot, rowCount: 2, rows: [snapshot.rows[0]!, secondRow] } as CandidateFeatureSnapshotV1;
    const admitted = admission(twoRows, [1]);
    const result = prepareUnifiedResidencyAceBridgeV1(input(twoRows, admitted));

    expect(result.descriptors.map((descriptor) => descriptor.candidateOrdinal)).toEqual([1]);
    expect(result.descriptors[0]?.sourceRevision).toBe('source:r2');
  });

  it('rejects an admission whose selected-ordinal checksum was changed', () => {
    const admitted = admission(snapshot);
    const tampered = { ...admitted, selectedOrdinalSetChecksum: 'f'.repeat(64) };

    expect(() => prepareUnifiedResidencyAceBridgeV1(input(snapshot, tampered))).toThrow('ACE_SELECTED_ORDINAL_SET_CHECKSUM_MISMATCH');
  });

  it('rejects a manifest candidate that is not in the feature snapshot', () => {
    const admitted = admission(snapshot);
    const tampered = {
      ...admitted,
      manifest: {
        ...admitted.manifest,
        v1: { ...admitted.manifest.v1, selectedNodeKeys: ['not-in-snapshot'] },
      },
    };

    expect(() => prepareUnifiedResidencyAceBridgeV1(input(snapshot, tampered))).toThrow('ACE_SELECTED_CANDIDATE_NOT_IN_SNAPSHOT');
  });
});
