// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bridgeRetrievalIdentityToAcePacketV1 } from './ace-route-manifest-bridge-v1.js';
import type { RetrievalCacheIdentityV1 } from './cache-keys.js';

const retrievalIdentity: RetrievalCacheIdentityV1 = {
  queryHash: 'ace:query:1',
  model: 'embeddinggemma',
  dim: 768,
  workspaceRevision: 'workspace:1',
  candidateSnapshotRevision: 'snapshot:1',
  ordinalMapChecksum: 'sha256:ordinal',
  representationRevision: 'semantic:1',
  featureRevision: 'feature:1',
  retrievalPolicyRevision: 'retrieval:1',
  contextPolicyRevision: 'context:1',
  graphRevision: 'graph:1',
};

describe('SearchRuntime to ACE packet identity bridge', () => {
  it('preserves retrieval identity and requires packet-owned revisions', () => {
    const result = bridgeRetrievalIdentityToAcePacketV1({
      retrievalIdentity,
      requestHash: 'ace:packet:query-1',
      representationId: 'semantic_768',
      producerRevision: 'ace-producer:1',
      normalizationPolicyRevision: 'normalization:1',
      artifactChecksum: 'sha256:packet',
    });

    expect(result).toMatchObject({
      cacheKind: 'ACE_PACKET',
      requestHash: 'ace:packet:query-1',
      candidateSnapshotRevision: retrievalIdentity.candidateSnapshotRevision,
      graphRevision: retrievalIdentity.graphRevision,
      producerRevision: 'ace-producer:1',
    });
  });

  it('rejects a retrieval identity without a graph revision', () => {
    expect(() => bridgeRetrievalIdentityToAcePacketV1({
      retrievalIdentity: { ...retrievalIdentity, graphRevision: null },
      requestHash: 'ace:packet:query-1',
      representationId: 'semantic_768',
      producerRevision: 'ace-producer:1',
      normalizationPolicyRevision: 'normalization:1',
      artifactChecksum: 'sha256:packet',
    })).toThrow('ACE_PACKET_GRAPH_REVISION_REQUIRED');
  });
});
