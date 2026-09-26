import type Redis from 'ioredis';
import { z } from 'zod';
import {
  aceBitfrostCacheIdentityChecksumV1,
  buildAceBitfrostCacheKeyV1,
  type AceBitfrostCacheIdentityV1,
} from './ace-bitfrost-cache-identity-v1.js';
import {
  PromptPlanV1Schema,
  type PromptPlanV1,
} from '../prefill/prompt-plan-v1.js';
import {
  ContextPrefixIdentityV1Schema,
  verifyContextPrefixIdentityV1,
  type ContextPrefixIdentityV1,
} from '../prefill/context-prefix-identity-v1.js';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';
import {
  aceContextManifestAdmissionV1Schema,
  type AceContextManifestAdmissionV1,
} from '../context/ace-context-manifest-admission-v1.js';
import type { ManifestBoundPromptPlanV1 } from '../context/context-manifest-prompt-plan-v1.js';

/**
 * CACHE-PREFILL-03 / ACE3-07 bounded BitFrost descriptor contract.
 *
 * BitFrost stores only the revision-qualified identity/descriptor for a compiled
 * stable prefix. It never stores llama.cpp KV tensors, GPU pointers, hidden
 * state, or the raw stable-prefix text. llama-server remains the runtime owner
 * of native prompt/KV reuse.
 */

export const CONTEXT_PREFIX_BITFROST_ARTIFACT_KIND_V1 = 'context_prefix_descriptor_v1' as const;
export const CONTEXT_PREFIX_BITFROST_REPRESENTATION_ID_V1 = 'context_prefix_v1' as const;
export const CONTEXT_PREFIX_BITFROST_NORMALIZATION_POLICY_V1 = 'context-prefix-identity-v1' as const;
export const DEFAULT_CONTEXT_PREFIX_BITFROST_TTL_SECONDS = 3600;
export const MAX_CONTEXT_PREFIX_BITFROST_TTL_SECONDS = 86_400;

export const ContextPrefixBitfrostDescriptorV1Schema = z.object({
  schema: z.literal('atlas.context-prefix-bitfrost-descriptor.v1'),
  cacheIdentity: z.object({
    cacheKind: z.literal('ACE_CONTEXT'),
    artifactKind: z.literal(CONTEXT_PREFIX_BITFROST_ARTIFACT_KIND_V1),
    requestHash: z.string().min(1).optional(),
    modelRevision: z.string().min(1).optional(),
    adapterRevision: z.string().min(1).optional(),
    workspaceRevision: z.string().min(1).optional(),
    sourceRevision: z.string().min(1).optional(),
    packetRevision: z.string().min(1).optional(),
    representationId: z.literal(CONTEXT_PREFIX_BITFROST_REPRESENTATION_ID_V1),
    representationRevision: z.string().min(1),
    candidateSnapshotRevision: z.string().min(1),
    ordinalMapChecksum: z.string().min(1),
    graphRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    producerRevision: z.string().min(1),
    normalizationPolicyRevision: z.literal(CONTEXT_PREFIX_BITFROST_NORMALIZATION_POLICY_V1),
    artifactChecksum: z.string().min(1),
  }).strict(),
  cacheIdentityChecksum: z.string().min(1),
  contextPrefixIdentity: ContextPrefixIdentityV1Schema,
  contextManifestChecksum: sha256HexSchema,
  promptPlanChecksum: sha256HexSchema,
  orderedEvidenceChecksum: sha256HexSchema,
  tokenizerRevision: z.string().min(1),
  stablePrefixTokens: z.number().int().nonnegative(),
  cacheEligible: z.literal(true),
  rawPromptStored: z.literal(false),
  portableKvStored: z.literal(false),
  canonicalAuthority: z.literal(false),
  descriptorChecksum: sha256HexSchema,
}).strict();

export type ContextPrefixBitfrostDescriptorV1 = z.infer<typeof ContextPrefixBitfrostDescriptorV1Schema>;

export type ContextPrefixBitfrostAdmissionV1 =
  | {
      status: 'ADMITTED';
      reason: null;
      identity: AceBitfrostCacheIdentityV1;
      cacheKey: string;
      descriptor: ContextPrefixBitfrostDescriptorV1;
      canonicalAuthority: false;
      writesPerformed: false;
    }
  | {
      status: 'BLOCKED';
      reason: string;
      identity: null;
      cacheKey: null;
      descriptor: null;
      canonicalAuthority: false;
      writesPerformed: false;
    };

export type ContextPrefixBitfrostReadV1 =
  | { status: 'HIT'; cacheKey: string; descriptor: ContextPrefixBitfrostDescriptorV1; cacheWritePerformed: false; canonicalWritePerformed: false }
  | { status: 'MISS'; cacheKey: string; reason: string; cacheWritePerformed: false; canonicalWritePerformed: false }
  | { status: 'BLOCKED'; cacheKey: null; reason: string; cacheWritePerformed: false; canonicalWritePerformed: false };

export type ContextPrefixBitfrostWriteV1 =
  | { status: 'WRITTEN'; cacheKey: string; ttlSeconds: number; cacheWritePerformed: true; canonicalWritePerformed: false; portableKvStored: false }
  | { status: 'BLOCKED'; cacheKey: null; reason: string; cacheWritePerformed: false; canonicalWritePerformed: false; portableKvStored: false };

function blocked(reason: string): ContextPrefixBitfrostAdmissionV1 {
  return {
    status: 'BLOCKED',
    reason,
    identity: null,
    cacheKey: null,
    descriptor: null,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function buildDescriptor(input: {
  identity: AceBitfrostCacheIdentityV1;
  contextPrefixIdentity: ContextPrefixIdentityV1;
  promptPlan: PromptPlanV1;
  contextManifestChecksum: string;
  orderedEvidenceChecksum: string;
}): ContextPrefixBitfrostDescriptorV1 {
  const stablePrefixTokens = input.promptPlan.segments
    .filter((segment) => segment.kind !== 'USER_QUERY')
    .reduce((sum, segment) => sum + segment.tokenCount, 0);
  const body = {
    schema: 'atlas.context-prefix-bitfrost-descriptor.v1' as const,
    cacheIdentity: input.identity,
    cacheIdentityChecksum: aceBitfrostCacheIdentityChecksumV1(input.identity),
    contextPrefixIdentity: input.contextPrefixIdentity,
    contextManifestChecksum: input.contextManifestChecksum,
    promptPlanChecksum: input.promptPlan.checksumSha256,
    orderedEvidenceChecksum: input.orderedEvidenceChecksum,
    tokenizerRevision: input.promptPlan.tokenizerRevision,
    stablePrefixTokens,
    cacheEligible: true as const,
    rawPromptStored: false as const,
    portableKvStored: false as const,
    canonicalAuthority: false as const,
  };
  return ContextPrefixBitfrostDescriptorV1Schema.parse({
    ...body,
    descriptorChecksum: canonicalSha256V1(body),
  });
}

/**
 * Build the only cache identity accepted by the prefix-descriptor cache.
 *
 * Missing CURRENT evidence revisions fail closed. sourceRevision here is the
 * ContextManifestV2 source-revision-set checksum; no individual source
 * revision or workspace revision is inferred from a snapshot id.
 */
export function buildContextPrefixBitfrostAdmissionV1(input: {
  admission: AceContextManifestAdmissionV1;
  compiled: ManifestBoundPromptPlanV1;
}): ContextPrefixBitfrostAdmissionV1 {
  let admission: AceContextManifestAdmissionV1;
  let promptPlan: PromptPlanV1;
  let contextPrefixIdentity: ContextPrefixIdentityV1;
  try {
    admission = aceContextManifestAdmissionV1Schema.parse(input.admission);
    promptPlan = PromptPlanV1Schema.parse(input.compiled.promptPlan);
    contextPrefixIdentity = verifyContextPrefixIdentityV1(input.compiled.contextPrefixIdentity);
  } catch {
    return blocked('PREFIX_CACHE_INPUT_INVALID');
  }

  const manifest = admission.manifest;
  const revisions = manifest.identityInput.evidenceRevisions;
  if (promptPlan.contextManifestChecksum !== manifest.identityChecksum) return blocked('CONTEXT_MANIFEST_CHECKSUM_MISMATCH');
  if (promptPlan.promptTemplateRevision !== contextPrefixIdentity.templateRevision) return blocked('PROMPT_TEMPLATE_PREFIX_MISMATCH');
  if (!revisions.sourceRevision) return blocked('SOURCE_REVISION_SET_REQUIRED');
  if (!revisions.representationRevision) return blocked('REPRESENTATION_REVISION_REQUIRED');
  if (!revisions.featureRevision) return blocked('FEATURE_REVISION_REQUIRED');
  if (!manifest.v1.graphRevision) return blocked('GRAPH_REVISION_REQUIRED');
  if (!revisions.modelRevision) return blocked('MODEL_REVISION_REQUIRED');
  if (!revisions.promptTemplateRevision) return blocked('PROMPT_TEMPLATE_REVISION_REQUIRED');
  if (revisions.modelRevision !== contextPrefixIdentity.modelRevision) return blocked('MODEL_REVISION_MISMATCH');
  if (revisions.promptTemplateRevision !== contextPrefixIdentity.templateRevision) return blocked('PROMPT_TEMPLATE_REVISION_MISMATCH');

  const identity: AceBitfrostCacheIdentityV1 = {
    cacheKind: 'ACE_CONTEXT',
    artifactKind: CONTEXT_PREFIX_BITFROST_ARTIFACT_KIND_V1,
    requestHash: manifest.identityChecksum,
    modelRevision: contextPrefixIdentity.modelRevision,
    sourceRevision: revisions.sourceRevision,
    representationId: CONTEXT_PREFIX_BITFROST_REPRESENTATION_ID_V1,
    representationRevision: revisions.representationRevision,
    candidateSnapshotRevision: manifest.v1.snapshotId,
    ordinalMapChecksum: manifest.identityInput.ordinalMapChecksum,
    graphRevision: manifest.v1.graphRevision,
    featureRevision: revisions.featureRevision,
    producerRevision: manifest.v1.producerRevision,
    normalizationPolicyRevision: CONTEXT_PREFIX_BITFROST_NORMALIZATION_POLICY_V1,
    artifactChecksum: contextPrefixIdentity.checksum,
  };

  const cacheKey = buildAceBitfrostCacheKeyV1(identity);
  const descriptor = buildDescriptor({
    identity,
    contextPrefixIdentity,
    promptPlan,
    contextManifestChecksum: manifest.identityChecksum,
    orderedEvidenceChecksum: input.compiled.orderedEvidenceChecksum,
  });
  return {
    status: 'ADMITTED',
    reason: null,
    identity,
    cacheKey,
    descriptor,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function verifyStoredDescriptor(
  raw: string,
  expected: ContextPrefixBitfrostAdmissionV1 & { status: 'ADMITTED' },
): ContextPrefixBitfrostDescriptorV1 | null {
  try {
    const parsed = ContextPrefixBitfrostDescriptorV1Schema.parse(JSON.parse(raw));
    const { descriptorChecksum, ...body } = parsed;
    if (descriptorChecksum !== canonicalSha256V1(body)) return null;
    if (parsed.cacheIdentityChecksum !== aceBitfrostCacheIdentityChecksumV1(parsed.cacheIdentity)) return null;
    if (buildAceBitfrostCacheKeyV1(parsed.cacheIdentity) !== expected.cacheKey) return null;
    if (parsed.contextPrefixIdentity.checksum !== expected.descriptor.contextPrefixIdentity.checksum) return null;
    if (parsed.contextManifestChecksum !== expected.descriptor.contextManifestChecksum) return null;
    if (parsed.promptPlanChecksum !== expected.descriptor.promptPlanChecksum) return null;
    if (parsed.orderedEvidenceChecksum !== expected.descriptor.orderedEvidenceChecksum) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readContextPrefixDescriptorFromBitfrostV1(
  redis: Pick<Redis, 'get'>,
  input: {
    admission: AceContextManifestAdmissionV1;
    compiled: ManifestBoundPromptPlanV1;
  },
): Promise<ContextPrefixBitfrostReadV1> {
  const cacheAdmission = buildContextPrefixBitfrostAdmissionV1(input);
  if (cacheAdmission.status !== 'ADMITTED') {
    return {
      status: 'BLOCKED',
      cacheKey: null,
      reason: cacheAdmission.reason,
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
    };
  }
  let raw: string | null;
  try {
    raw = await redis.get(cacheAdmission.cacheKey);
  } catch {
    return {
      status: 'MISS',
      cacheKey: cacheAdmission.cacheKey,
      reason: 'CACHE_READ_FAILED',
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
    };
  }
  if (raw === null) {
    return {
      status: 'MISS',
      cacheKey: cacheAdmission.cacheKey,
      reason: 'CACHE_EMPTY',
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
    };
  }
  const descriptor = verifyStoredDescriptor(raw, cacheAdmission);
  if (!descriptor) {
    return {
      status: 'MISS',
      cacheKey: cacheAdmission.cacheKey,
      reason: 'DESCRIPTOR_IDENTITY_MISMATCH',
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
    };
  }
  return {
    status: 'HIT',
    cacheKey: cacheAdmission.cacheKey,
    descriptor,
    cacheWritePerformed: false,
    canonicalWritePerformed: false,
  };
}

export async function writeContextPrefixDescriptorToBitfrostV1(
  redis: Pick<Redis, 'set'>,
  input: {
    admission: AceContextManifestAdmissionV1;
    compiled: ManifestBoundPromptPlanV1;
    ttlSeconds?: number;
  },
): Promise<ContextPrefixBitfrostWriteV1> {
  const cacheAdmission = buildContextPrefixBitfrostAdmissionV1(input);
  if (cacheAdmission.status !== 'ADMITTED') {
    return {
      status: 'BLOCKED',
      cacheKey: null,
      reason: cacheAdmission.reason,
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
      portableKvStored: false,
    };
  }

  const ttlSeconds = input.ttlSeconds ?? DEFAULT_CONTEXT_PREFIX_BITFROST_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_CONTEXT_PREFIX_BITFROST_TTL_SECONDS) {
    return {
      status: 'BLOCKED',
      cacheKey: null,
      reason: 'TTL_OUT_OF_BOUNDS',
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
      portableKvStored: false,
    };
  }

  try {
    await redis.set(cacheAdmission.cacheKey, JSON.stringify(cacheAdmission.descriptor), 'EX', ttlSeconds);
  } catch {
    return {
      status: 'BLOCKED',
      cacheKey: null,
      reason: 'CACHE_WRITE_FAILED',
      cacheWritePerformed: false,
      canonicalWritePerformed: false,
      portableKvStored: false,
    };
  }
  return {
    status: 'WRITTEN',
    cacheKey: cacheAdmission.cacheKey,
    ttlSeconds,
    cacheWritePerformed: true,
    canonicalWritePerformed: false,
    portableKvStored: false,
  };
}
