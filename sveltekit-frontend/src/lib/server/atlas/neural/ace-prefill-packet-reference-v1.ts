import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

/**
 * NE-27 (openspec/changes/parent-atlas-neural-prefill-encoder).
 *
 * Defines what ACE is allowed to hold for a pre-fill hit: a reference to
 * canonical evidence, latent/model receipt checksums, ontology tuples, and a
 * graph feature revision — never a raw ANN hit or an inlined vector. A
 * `centroidRef` points at the existing `taxonomy:clusters:gpu:*` /
 * `taxonomy:clusters:som:*` Redis keys owned by
 * `src/lib/server/retrieval/centroid-cache.ts`; this contract does not
 * introduce a second centroid store.
 */

const revision = z.string().min(1);

export const AcePrefillCentroidRefSchema = z.union([
  z.object({ kind: z.literal('GPU_CLUSTER'), clusterId: z.number().int().nonnegative() }).strict(),
  z.object({
    kind: z.literal('SOM_CELL'),
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
  }).strict(),
]);
export type AcePrefillCentroidRef = z.infer<typeof AcePrefillCentroidRefSchema>;

export const AcePrefillCacheStatusSchema = z.enum([
  'NOT_PROJECTED',
  'PROJECTED_UNVERIFIED',
  'READBACK_VERIFIED',
]);
export type AcePrefillCacheStatus = z.infer<typeof AcePrefillCacheStatusSchema>;

export const AcePrefillPacketReferenceV1Schema = z.object({
  schema: z.literal('atlas.ace-prefill-packet-reference.v1'),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  /** Canonical evidence pointers (packet/source refs), never raw content. */
  canonicalEvidenceRefs: z.array(z.string().min(1)).min(1),
  latentProjectionReceiptChecksum: sha256HexSchema.nullable(),
  modelManifestChecksum: sha256HexSchema.nullable(),
  ontologyTupleRefs: z.array(z.string().min(1)).default([]),
  graphFeatureRevision: revision.nullable(),
  centroidRef: AcePrefillCentroidRefSchema.nullable(),
  cacheStatus: AcePrefillCacheStatusSchema,
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type AcePrefillPacketReferenceV1 = z.infer<typeof AcePrefillPacketReferenceV1Schema>;

export function buildAcePrefillPacketReferenceV1(
  input: Omit<AcePrefillPacketReferenceV1, 'schema' | 'checksumSha256'>,
): AcePrefillPacketReferenceV1 {
  const payload = {
    schema: 'atlas.ace-prefill-packet-reference.v1' as const,
    ...input,
    canonicalEvidenceRefs: [...new Set(input.canonicalEvidenceRefs)].sort(),
    ontologyTupleRefs: [...new Set(input.ontologyTupleRefs)].sort(),
  };
  return AcePrefillPacketReferenceV1Schema.parse({ ...payload, checksumSha256: canonicalSha256V1(payload) });
}

/**
 * Redis key this reference's centroid lives at, if any — reads through the
 * existing `centroidKey` scheme so no second key layout is introduced.
 * (Import is inlined by name here rather than re-exported to avoid pulling
 * `$lib/server/redis.js` into contract-only consumers.)
 */
export function centroidRefToRedisKey(ref: AcePrefillCentroidRef): string {
  return ref.kind === 'GPU_CLUSTER'
    ? `taxonomy:clusters:gpu:${ref.clusterId}`
    : `taxonomy:clusters:som:${ref.row}:${ref.col}`;
}
