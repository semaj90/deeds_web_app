import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';
import {
  buildContextPrefixIdentityV1,
  ContextPrefixIdentityV1Schema,
  ContextPrefixReuseObservationV1Schema,
  type ContextPrefixIdentityV1,
} from './context-prefix-identity-v1.js';

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
  /** Optional read-only observation of the stable prefix used by the request. */
  contextPrefixIdentity: ContextPrefixIdentityV1Schema.nullable().optional(),
  /** Optional measured reuse data; never implies that KV state is persisted by Atlas. */
  contextPrefixReuseObservation: ContextPrefixReuseObservationV1Schema.nullable().optional(),
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

export const PrefillDecodePhaseReceiptV1Schema = z.object({
  schema: z.literal('atlas.prefill-decode-phase-receipt.v1'),
  requestId: z.string().min(1),
  phase: z.enum(['PREFILL', 'DECODE']),
  contentIdentityChecksum: sha256HexSchema,
  modelRevision: revision,
  outputChecksum: sha256HexSchema,
  stateOwnership: z.literal('MODEL_EPHEMERAL'),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillDecodePhaseReceiptV1 = z.infer<typeof PrefillDecodePhaseReceiptV1Schema>;

export const PrefillDerivedFeatureReceiptV1Schema = z.object({
  schema: z.literal('atlas.prefill-derived-feature-receipt.v1'),
  requestId: z.string().min(1),
  dagNodeId: z.string().min(1),
  inputChecksum: sha256HexSchema,
  outputChecksum: sha256HexSchema,
  featureKind: z.enum(['PCA', 'SVD', 'LATENT_128', 'LATENT_64', 'KMEANS', 'SOM20X20', 'HAMMING', 'HILBERT', 'TOPOLOGY4']),
  featureRevision: revision,
  sourceRevision: revision,
  representationRevision: revision,
  dimensions: z.array(z.number().int().positive()),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillDerivedFeatureReceiptV1 = z.infer<typeof PrefillDerivedFeatureReceiptV1Schema>;

export const PrefillDagExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.prefill-dag-execution-receipt.v1'),
  requestId: z.string().min(1),
  pipelineChecksum: sha256HexSchema,
  nodes: z.array(z.object({
    dagNodeId: z.string().min(1),
    inputChecksum: sha256HexSchema,
    outputChecksum: sha256HexSchema,
    nodeRevision: revision,
  }).strict()).min(1),
  status: z.enum(['PLANNED', 'EXECUTED_UNPROMOTED', 'BLOCKED_LINEAGE']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type PrefillDagExecutionReceiptV1 = z.infer<typeof PrefillDagExecutionReceiptV1Schema>;

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

export function buildPrefillDerivedFeatureReceiptV1(
  input: Omit<PrefillDerivedFeatureReceiptV1, 'schema' | 'checksumSha256'>,
): PrefillDerivedFeatureReceiptV1 {
  const payload = { schema: 'atlas.prefill-derived-feature-receipt.v1' as const, ...input };
  return PrefillDerivedFeatureReceiptV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}

export function buildPrefillDagExecutionReceiptV1(
  input: Omit<PrefillDagExecutionReceiptV1, 'schema' | 'checksumSha256'>,
): PrefillDagExecutionReceiptV1 {
  const nodes = [...input.nodes];
  const nodeIds = new Set(nodes.map((node) => node.dagNodeId));
  if (nodeIds.size !== nodes.length) throw new Error('PREFILL_DAG_RECEIPT_DUPLICATE_NODE');
  const payload = { schema: 'atlas.prefill-dag-execution-receipt.v1' as const, ...input, nodes };
  return PrefillDagExecutionReceiptV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}

/**
 * Compose the stable-prefix identity from the existing logical prefill
 * identity. Tool and system-policy revisions remain explicit inputs because
 * they are not owned by the content identity contract.
 */
export function buildContextPrefixIdentityFromPrefillContentV1(input: {
  contentIdentity: PrefillContentIdentityV1;
  stablePrefix: string;
  toolSchemaRevision: string;
  systemPolicyRevision: string;
}): ContextPrefixIdentityV1 {
  return buildContextPrefixIdentityV1({
    modelRevision: input.contentIdentity.modelRevision,
    templateRevision: input.contentIdentity.promptTemplateRevision,
    toolSchemaRevision: input.toolSchemaRevision,
    systemPolicyRevision: input.systemPolicyRevision,
    stableEvidenceRevision: input.contentIdentity.evidenceRevisionSetHash,
    stablePrefix: input.stablePrefix,
  });
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
  if (input.contextPrefixIdentity) {
    if (input.contextPrefixIdentity.modelRevision !== input.contentIdentity.modelRevision) {
      throw new Error('prefill context prefix model revision does not match content identity');
    }
    if (input.contextPrefixIdentity.templateRevision !== input.contentIdentity.promptTemplateRevision) {
      throw new Error('prefill context prefix template revision does not match content identity');
    }
  }
  if (input.contextPrefixReuseObservation) {
    if (!input.contextPrefixIdentity) {
      throw new Error('prefill context prefix reuse observation requires context prefix identity');
    }
    if (input.contextPrefixReuseObservation.contextPrefixIdentityChecksum !== input.contextPrefixIdentity.checksum) {
      throw new Error('prefill context prefix reuse observation identity mismatch');
    }
  }
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

export function buildPrefillDecodePhaseReceiptV1(
  input: Omit<PrefillDecodePhaseReceiptV1, 'schema' | 'checksumSha256'>,
): PrefillDecodePhaseReceiptV1 {
  const payload = { schema: 'atlas.prefill-decode-phase-receipt.v1' as const, ...input };
  return PrefillDecodePhaseReceiptV1Schema.parse({ ...payload, checksumSha256: hashPayload(payload) });
}
