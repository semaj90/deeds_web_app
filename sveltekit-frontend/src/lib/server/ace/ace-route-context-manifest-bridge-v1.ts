import {
  retrievalCacheIdentityFromAceManifestV1,
  type AceContextManifestAdmissionV1,
} from '../atlas/context/ace-context-manifest-admission-v1.js';
import {
  bridgeRetrievalIdentityToAcePacketV1,
  type AceRouteManifestBridgeInputV1,
} from './ace-route-manifest-bridge-v1.js';
import type { AceBitfrostCacheIdentityV1 } from '../atlas/cache/ace-bitfrost-cache-identity-v1.js';

export type AceRouteContextManifestBridgeInputV1 = Omit<
  AceRouteManifestBridgeInputV1,
  'retrievalIdentity' | 'requestHash'
> & {
  admission: AceContextManifestAdmissionV1;
  queryHash: string;
  requestHash: string;
  model: string;
  dim: number;
  workspaceRevision: string;
  contextPolicyRevision: string;
};

/** Build the packet identity from the existing admitted ContextManifest owner. */
export function bridgeAceContextManifestToPacketIdentityV1(
  input: AceRouteContextManifestBridgeInputV1,
): AceBitfrostCacheIdentityV1 {
  const retrievalIdentity = retrievalCacheIdentityFromAceManifestV1(input.admission, {
    queryHash: input.queryHash,
    model: input.model,
    dim: input.dim,
    workspaceRevision: input.workspaceRevision,
    contextPolicyRevision: input.contextPolicyRevision,
  });
  if (!retrievalIdentity) {
    throw new Error('ACE_CONTEXT_MANIFEST_RETRIEVAL_IDENTITY_INCOMPLETE');
  }

  return bridgeRetrievalIdentityToAcePacketV1({
    retrievalIdentity,
    requestHash: input.requestHash,
    representationId: input.representationId,
    producerRevision: input.producerRevision,
    normalizationPolicyRevision: input.normalizationPolicyRevision,
    artifactChecksum: input.artifactChecksum,
  });
}
