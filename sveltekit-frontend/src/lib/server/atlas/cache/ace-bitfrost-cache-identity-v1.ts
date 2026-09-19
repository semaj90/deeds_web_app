import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ContextManifestV2 } from '../graph/context-manifest-v2.js';

const revision = z.string().min(1);

export const AceBitfrostCacheIdentityV1Schema = z
  .object({
    cacheKind: z.enum(['ACE_PACKET', 'ACE_CONTEXT', 'CENTROID', 'RESIDENCY']),
    artifactKind: z.string().min(1),
    /** Request binding for route-scoped artifacts; absent on non-request caches. */
    requestHash: revision.optional(),
    modelRevision: revision.optional(),
    adapterRevision: revision.optional(),
    workspaceRevision: revision.optional(),
    sourceRevision: revision.optional(),
    packetRevision: revision.optional(),
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

export const aceResidencyAdmissionV1Schema = z.object({
  schema: z.literal('atlas.ace-residency-admission.v1'),
  identity: AceBitfrostCacheIdentityV1Schema,
  cacheKey: z.string().min(1),
  status: z.enum(['ADMITTED', 'BLOCKED_IDENTITY', 'UNAVAILABLE']),
  reason: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ADMITTED' && value.reason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'ADMITTED ACE residency cannot carry a blocker reason.' });
  }
  if (value.status !== 'ADMITTED' && value.reason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Blocked or unavailable ACE residency requires an explicit reason.' });
  }
});

export type AceResidencyAdmissionV1 = z.infer<typeof aceResidencyAdmissionV1Schema>;

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
    identity.modelRevision ?? 'model:unspecified',
    identity.adapterRevision ?? 'adapter:unspecified',
    identity.workspaceRevision ?? 'workspace:unspecified',
    identity.sourceRevision ?? 'source:unspecified',
    identity.packetRevision ?? 'packet:unspecified',
    checksum,
  ]
    .map((part) => encodeURIComponent(part))
    .join(':');
}

/** Validate an ACE/BitFrost admission observation without warming or persisting cache state. */
export function buildAceResidencyAdmissionV1(input: {
  identity: AceBitfrostCacheIdentityV1;
  status: AceResidencyAdmissionV1['status'];
  reason: string | null;
}): AceResidencyAdmissionV1 {
  const identity = AceBitfrostCacheIdentityV1Schema.parse(input.identity);
  return aceResidencyAdmissionV1Schema.parse({
    schema: 'atlas.ace-residency-admission.v1',
    identity,
    cacheKey: buildAceBitfrostCacheKeyV1(identity),
    status: input.status,
    reason: input.reason,
    canonicalAuthority: false,
    writesPerformed: false,
  });
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
