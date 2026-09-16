import type { RetrievalCacheIdentityV1 } from './cache-keys.js';
import {
  AceBitfrostCacheIdentityV1Schema,
  type AceBitfrostCacheIdentityV1,
} from '../atlas/cache/ace-bitfrost-cache-identity-v1.js';

export type AceRouteManifestBridgeInputV1 = {
  retrievalIdentity: RetrievalCacheIdentityV1;
  /** Full route request hash, owned by the packet route's hashQuery helper. */
  requestHash: string;
  representationId: string;
  producerRevision: string;
  normalizationPolicyRevision: string;
  artifactChecksum: string;
};

/**
 * Bridge an admitted SearchRuntime retrieval identity to the packet-cache
 * identity. Fields not owned by retrieval are mandatory inputs; this adapter
 * never derives them from timestamps, packet contents, or model output.
 */
export function bridgeRetrievalIdentityToAcePacketV1(
  input: AceRouteManifestBridgeInputV1,
): AceBitfrostCacheIdentityV1 {
  const retrieval = input.retrievalIdentity;
  if (!retrieval.graphRevision) {
    throw new Error('ACE_PACKET_GRAPH_REVISION_REQUIRED');
  }

  return AceBitfrostCacheIdentityV1Schema.parse({
    cacheKind: 'ACE_PACKET',
    artifactKind: 'ace-packet',
    requestHash: input.requestHash,
    representationId: input.representationId,
    representationRevision: retrieval.representationRevision,
    candidateSnapshotRevision: retrieval.candidateSnapshotRevision,
    ordinalMapChecksum: retrieval.ordinalMapChecksum,
    graphRevision: retrieval.graphRevision,
    featureRevision: retrieval.featureRevision,
    producerRevision: input.producerRevision,
    normalizationPolicyRevision: input.normalizationPolicyRevision,
    artifactChecksum: input.artifactChecksum,
  });
}
