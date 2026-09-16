import { describe, expect, it } from 'vitest';
import {
  admitCurrentAceContextManifestV1,
  buildAceContextManifestAdmissionV1,
  retrievalCacheIdentityFromAceManifestV1,
} from './ace-context-manifest-admission-v1.js';

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

  it('derives cache identity only from complete manifest and explicit runtime fields', () => {
    const admission = buildAceContextManifestAdmissionV1({
      snapshot,
      requestId: 'request:1',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    const identity = retrievalCacheIdentityFromAceManifestV1(admission, {
      queryHash: 'query:r1',
      model: 'embeddinggemma',
      dim: 768,
      workspaceRevision: 'workspace:r1',
      contextPolicyRevision: 'context:r1',
    });
    expect(identity?.candidateSnapshotRevision).toBe(snapshot.candidateSnapshotRevision);
    expect(identity?.featureRevision).toBe(snapshot.featureRevision);
    expect(retrievalCacheIdentityFromAceManifestV1(admission, {
      queryHash: 'query:r1', model: 'embeddinggemma', dim: 768,
      workspaceRevision: '', contextPolicyRevision: 'context:r1',
    })).toBeNull();
  });
});

describe('admitCurrentAceContextManifestV1', () => {
  it('returns no manifest when the current feature snapshot is blocked', () => {
    const featureAdmission = currentCandidateAdmissionFixture();
    const result = admitCurrentAceContextManifestV1({
      featureAdmission,
      requestId: 'request:blocked',
      tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1',
      acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1',
      graphRevision: 'graph:r1',
    });
    expect(result.status).toBe('BLOCKED_FEATURE_SNAPSHOT');
    expect(result.manifest).toBeNull();
    expect(result.writesPerformed).toBe(false);
  });
});

function currentCandidateAdmissionFixture() {
  return {
    schema: 'atlas.current-candidate-feature-admission.v1' as const,
    status: 'BLOCKED_SEMANTIC' as const,
    candidateSnapshotRevision: 'candidate:r1',
    workspaceRevision: 'workspace:r1',
    featureRevision: 'feature:r1',
    ordinalMapChecksum: 'a'.repeat(64),
    rowCount: 0,
    snapshot: null,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    reason: 'BLOCKED_SEMANTIC',
  };
}
