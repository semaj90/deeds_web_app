import { describe, expect, it } from 'vitest';
import { buildAceContextManifestAdmissionV1 } from './ace-context-manifest-admission-v1.js';

const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const,
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:r1',
  featureRevision: 'feature:r1',
  rowCount: 1,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: 0,
    canonicalId: 'canonical:1',
    packetKey: 'packet:1',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'workspace:r1',
    sourceRevision: 'source:r1',
    graphRevision: 'graph:r1',
    semanticRevision: 'semantic:r1',
    featureRevision: 'feature:r1',
    representationBindings: [],
    laneMask: ['semantic'] as const,
    evidenceRefs: ['evidence:1'],
  }],
  snapshotChecksum: 'b'.repeat(64),
  identityAuthority: false as const,
  canonicalOwnerChanged: false as const,
  producerRevision: 'producer:r1',
};

describe('AceContextManifestAdmissionV1', () => {
  it('builds deterministic V2 identity from an existing snapshot', () => {
    const a = buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    const b = buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    expect(a.manifest.identityChecksum).toBe(b.manifest.identityChecksum);
    expect(a.manifest.v1.evidenceRefs).toEqual(['evidence:1']);
    expect(a.canonicalAuthority).toBe(false);
  });

  it('rejects an ordinal that is not in the snapshot', () => {
    expect(() => buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      selectedOrdinals: [1],
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    })).toThrow('ACE_MANIFEST_ORDINAL_NOT_IN_SNAPSHOT:1');
  });
});
