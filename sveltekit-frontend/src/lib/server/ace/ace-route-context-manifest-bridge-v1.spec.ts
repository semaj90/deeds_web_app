// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAceContextManifestAdmissionV1 } from '../atlas/context/ace-context-manifest-admission-v1.js';
import { bridgeAceContextManifestToPacketIdentityV1 } from './ace-route-context-manifest-bridge-v1.js';

const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const,
  candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:r1', featureRevision: 'feature:r1', rowCount: 1,
  rows: [{
    schema: 'atlas.candidate-feature-row.v1' as const, candidateOrdinal: 0,
    canonicalId: 'canonical:1', packetKey: 'packet:1', treeNodeId: null, symbolVersionId: null,
    workspaceRevision: 'workspace:r1', sourceRevision: 'source:r1', graphRevision: 'graph:r1',
    semanticRevision: 'semantic:r1', featureRevision: 'feature:r1', representationBindings: [],
    laneMask: ['semantic'] as const, evidenceRefs: ['evidence:1'],
  }],
  snapshotChecksum: 'b'.repeat(64), identityAuthority: false as const,
  canonicalOwnerChanged: false as const, producerRevision: 'producer:r1',
};

const admission = buildAceContextManifestAdmissionV1({
  snapshot, requestId: 'request:1', tokenBudget: 512,
  retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'playbook:r1',
  representationRevision: 'semantic:r1', graphRevision: 'graph:r1',
});

describe('ContextManifestV2 to ACE packet identity bridge', () => {
  it('derives packet identity only from an admitted manifest', () => {
    const result = bridgeAceContextManifestToPacketIdentityV1({
      admission, queryHash: 'query:r1', requestHash: 'ace:packet:query:r1',
      model: 'embeddinggemma', dim: 768, workspaceRevision: 'workspace:r1',
      contextPolicyRevision: 'context:r1', representationId: 'semantic_768',
      producerRevision: 'ace-producer:r1', normalizationPolicyRevision: 'norm:r1',
      artifactChecksum: 'sha256:packet',
    });
    expect(result.cacheKind).toBe('ACE_PACKET');
    expect(result.requestHash).toBe('ace:packet:query:r1');
    expect(result.candidateSnapshotRevision).toBe('candidate:r1');
  });

  it('fails closed when the admitted manifest lacks a graph revision', () => {
    const blocked = buildAceContextManifestAdmissionV1({
      snapshot, requestId: 'request:1', tokenBudget: 512,
      retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'playbook:r1',
      representationRevision: 'semantic:r1', graphRevision: null,
    });
    expect(() => bridgeAceContextManifestToPacketIdentityV1({
      admission: blocked, queryHash: 'query:r1', requestHash: 'ace:packet:query:r1',
      model: 'embeddinggemma', dim: 768, workspaceRevision: 'workspace:r1',
      contextPolicyRevision: 'context:r1', representationId: 'semantic_768',
      producerRevision: 'ace-producer:r1', normalizationPolicyRevision: 'norm:r1',
      artifactChecksum: 'sha256:packet',
    })).toThrow('ACE_PACKET_GRAPH_REVISION_REQUIRED');
  });
});
