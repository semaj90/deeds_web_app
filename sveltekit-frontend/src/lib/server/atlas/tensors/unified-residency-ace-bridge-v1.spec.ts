import { describe, expect, it } from 'vitest';
import { prepareUnifiedResidencyAceBridgeV1 } from './unified-residency-ace-bridge-v1.js';

describe('unified residency ACE bridge v1', () => {
  it('preserves admitted snapshot lineage and emits descriptor-only feature tiles', () => {
    const snapshot = {
      schema: 'atlas.candidate-feature-snapshot.v1', candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: 'a'.repeat(64),
      workspaceRevision: 'workspace:r1', featureRevision: 'feature:r1', rowCount: 1,
      rows: [{ schema: 'atlas.candidate-feature-row.v1', candidateOrdinal: 0, canonicalId: 'c0', packetKey: 'p0', treeNodeId: null, symbolVersionId: null, workspaceRevision: 'workspace:r1', sourceRevision: 'source:r1', graphRevision: null, semanticRevision: 'semantic:r1', featureRevision: 'feature:r1', representationBindings: [], semanticRelevance: 1, lexicalRelevance: null, astAffinity: null, graphAuthority: null, personalizedPageRank: null, communityAffinity: null, manifold4OrientationSimilarity: null, crossEncoderRawScore: null, crossEncoderCalibratedScore: null, crossEncoderAvailable: false, domainAffinity: null, executionUtility: null, memoryUtility: null, laneMask: ['semantic'], degradedIdentity: false, evidenceRefs: ['evidence:0'] }],
      snapshotChecksum: 'b'.repeat(64), identityAuthority: false, canonicalOwnerChanged: false, producerRevision: 'producer:r1'
    } as const;
    const admission = { canonicalAuthority: false, selectedOrdinalSetChecksum: 'c'.repeat(64), sourceRevisionSetChecksum: 'd'.repeat(64), manifest: { v1: { snapshotId: 'candidate:r1' } } } as never;
    const result = prepareUnifiedResidencyAceBridgeV1({ snapshot, admission, domain: 'contracts', lutRevision: 'lut:r1', lut: { contracts: { lutRevision: 'lut:r1', tokenBudget: 512, featureMask: ['semantic'], tileWidth: 256, contextWindow: 1024, residencyPriority: 1 } }, representationRevision: 'semantic:r1', modelRevision: 'model:r1', tokenizerRevision: 'tokenizer:r1', ropeRevision: 'rope:r1' });
    expect(result.descriptors).toHaveLength(1);
    expect(result.descriptors[0]?.candidateOrdinal).toBe(0);
    expect(result.descriptors[0]?.workspaceRevision).toBe('workspace:r1');
    expect(result.descriptors[0]?.state).toBe('EMPTY');
    expect(result.writesPerformed).toBe(false);
  });
});
