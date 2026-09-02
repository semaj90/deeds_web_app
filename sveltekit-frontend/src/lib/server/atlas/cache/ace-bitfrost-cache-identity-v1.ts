import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ContextManifestV2 } from '../graph/context-manifest-v2.js';

const revision = z.string().min(1);

export const AceBitfrostCacheIdentityV1Schema = z
  .object({
    cacheKind: z.enum(['ACE_PACKET', 'ACE_CONTEXT', 'CENTROID', 'RESIDENCY']),
    artifactKind: z.string().min(1),
    representationId: z.string().min(1),
    representationRevision: revision,
    candidateSnapshotRevision: revision,
    ordinalMapChecksum: revision,
    graphRevision: revision,
    featureRevision: revision,
    producerRevision: revision,
    normalizationPolicyRevision: revision,
    artifactChecksum: revision,
  })
  .strict();

export type AceBitfrostCacheIdentityV1 = z.infer<typeof AceBitfrostCacheIdentityV1Schema>;

function canonicalJson(value: AceBitfrostCacheIdentityV1): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

export function aceBitfrostCacheIdentityChecksumV1(
  input: AceBitfrostCacheIdentityV1,
): string {
  const identity = AceBitfrostCacheIdentityV1Schema.parse(input);
  return 'sha256:' + createHash('sha256').update(canonicalJson(identity), 'utf8').digest('hex');
}

export function buildAceBitfrostCacheKeyV1(input: AceBitfrostCacheIdentityV1): string {
  const identity = AceBitfrostCacheIdentityV1Schema.parse(input);
  const checksum = aceBitfrostCacheIdentityChecksumV1(identity);
  return [
    'atlas',
    'bitfrost',
    'v1',
    identity.cacheKind.toLowerCase(),
    identity.artifactKind,
    identity.representationId,
    identity.representationRevision,
    identity.candidateSnapshotRevision,
    checksum,
  ]
    .map((part) => encodeURIComponent(part))
    .join(':');
}

export function buildAceContextManifestCacheKeyV1(manifest: ContextManifestV2): string {
  const parsed = manifest;
  const requestId = parsed.v1.requestId;
  const snapshotId = parsed.v1.snapshotId;
  return [
    'atlas',
    'bitfrost',
    'v1',
    'ace_context',
    'context_manifest',
    encodeURIComponent(requestId),
    encodeURIComponent(snapshotId),
    parsed.identityChecksum,
  ].join(':');
}
