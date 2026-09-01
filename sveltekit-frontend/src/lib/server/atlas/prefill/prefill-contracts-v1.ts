import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);

export const PrefillContentIdentityV1Schema = z.object({
  schema: z.literal('atlas.prefill-content-identity.v1'),
  contextManifestChecksum: sha256HexSchema,
  promptPlanChecksum: sha256HexSchema,
  canonicalPacketSetHash: sha256HexSchema,
  modelRevision: revision,
  adapterRevision: revision.nullable(),
  tokenizerRevision: revision,
  promptTemplateRevision: revision,
  instructionRevision: revision,
  evidenceRevisionSetHash: sha256HexSchema,
  acePolicyRevision: revision,
  bitfrostRevision: revision,
  residencyPlanChecksum: sha256HexSchema,
  gpuExecutionIdentity: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillContentIdentityV1 = z.infer<typeof PrefillContentIdentityV1Schema>;

export const PrefillArtifactIdentityV1Schema = z.object({
  schema: z.literal('atlas.prefill-artifact-identity.v1'),
  contentIdentityChecksum: sha256HexSchema,
  backendRevision: revision,
  kvLayoutRevision: revision,
  kvDtype: z.enum(['F32', 'BF16', 'F16', 'Q8_0', 'Q4_0', 'Q4_1', 'OTHER']),
  quantizationRevision: revision.nullable(),
  ropeConfigRevision: revision,
  tensorArtifactChecksums: z.array(sha256HexSchema),
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillArtifactIdentityV1 = z.infer<typeof PrefillArtifactIdentityV1Schema>;

export const PrefillReceiptV1Schema = z.object({
  schema: z.literal('atlas.prefill-receipt.v1'),
  requestId: z.string().min(1),
  workflowId: z.string().min(1).nullable(),
  dagNodeId: z.string().min(1).nullable(),
  contentIdentity: PrefillContentIdentityV1Schema,
  physicalArtifact: PrefillArtifactIdentityV1Schema.nullable(),
  selectedPacketKeys: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  ordinalRegistryChecksum: sha256HexSchema,
  promptTokenCount: z.number().int().nonnegative(),
  cacheStatus: z.enum(['HIT_LOGICAL', 'MISS_COMPILED', 'MISS_STALE', 'NOT_CACHEABLE']),
  deterministicContextConstruction: z.boolean(),
  numericalParityMode: z.enum(['EXACT_SAME_ENV', 'TOLERANCE_CROSS_ENV', 'UNPROVEN']),
  producerRevision: revision,
  emittedAt: z.string().datetime(),
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillReceiptV1 = z.infer<typeof PrefillReceiptV1Schema>;

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
}

export function buildPrefillContentIdentityV1(input: Omit<PrefillContentIdentityV1, 'schema' | 'checksumSha256'>): PrefillContentIdentityV1 {
  const payload = {
    schema: 'atlas.prefill-content-identity.v1' as const,
    ...input,
  };
  return PrefillContentIdentityV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}

export function buildPrefillArtifactIdentityV1(input: Omit<PrefillArtifactIdentityV1, 'schema' | 'checksumSha256'>): PrefillArtifactIdentityV1 {
  const tensorArtifactChecksums = [...new Set(input.tensorArtifactChecksums)].sort();
  const payload = {
    schema: 'atlas.prefill-artifact-identity.v1' as const,
    ...input,
    tensorArtifactChecksums,
  };
  return PrefillArtifactIdentityV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}

export function buildPrefillReceiptV1(input: Omit<PrefillReceiptV1, 'schema' | 'checksumSha256'>): PrefillReceiptV1 {
  if (
    input.physicalArtifact &&
    input.physicalArtifact.contentIdentityChecksum !== input.contentIdentity.checksumSha256
  ) {
    throw new Error('prefill physical artifact does not match logical content identity');
  }

  const payload = {
    schema: 'atlas.prefill-receipt.v1' as const,
    ...input,
    selectedPacketKeys: [...input.selectedPacketKeys],
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
  };
  return PrefillReceiptV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}
