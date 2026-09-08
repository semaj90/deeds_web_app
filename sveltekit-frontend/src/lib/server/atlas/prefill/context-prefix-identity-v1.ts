import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from './canonical-hash-v1.js';

export const CONTEXT_PREFIX_IDENTITY_V1_SCHEMA = 'parent-atlas.context-prefix-identity.v1' as const;

/**
 * Identity for the reusable stable prompt prefix only.
 * The raw prefix is hashed and is never returned or persisted here. Query
 * text, tool results, candidate spans, and KV/tensor state are volatile and
 * intentionally excluded from this contract.
 */
export const ContextPrefixIdentityV1Schema = z.object({
  schema: z.literal(CONTEXT_PREFIX_IDENTITY_V1_SCHEMA),
  modelRevision: z.string().min(1),
  templateRevision: z.string().min(1),
  toolSchemaRevision: z.string().min(1),
  systemPolicyRevision: z.string().min(1),
  stableEvidenceRevision: z.string().min(1),
  stablePrefixChecksum: sha256HexSchema,
  checksum: sha256HexSchema,
}).strict();

export type ContextPrefixIdentityV1 = z.infer<typeof ContextPrefixIdentityV1Schema>;

export interface ContextPrefixIdentityInputV1 {
  modelRevision: string;
  templateRevision: string;
  toolSchemaRevision: string;
  systemPolicyRevision: string;
  stableEvidenceRevision: string;
  /** Hashed for identity; the raw prefix is not returned or persisted. */
  stablePrefix: string;
}

export function buildContextPrefixIdentityV1(input: ContextPrefixIdentityInputV1): ContextPrefixIdentityV1 {
  const body = {
    schema: CONTEXT_PREFIX_IDENTITY_V1_SCHEMA,
    modelRevision: input.modelRevision,
    templateRevision: input.templateRevision,
    toolSchemaRevision: input.toolSchemaRevision,
    systemPolicyRevision: input.systemPolicyRevision,
    stableEvidenceRevision: input.stableEvidenceRevision,
    stablePrefixChecksum: canonicalSha256V1({
      schema: 'atlas.stable-prefix-content.v1',
      stablePrefix: input.stablePrefix,
    }),
  };
  return ContextPrefixIdentityV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function verifyContextPrefixIdentityV1(value: unknown): ContextPrefixIdentityV1 {
  const parsed = ContextPrefixIdentityV1Schema.parse(value);
  const { checksum, ...body } = parsed;
  if (checksum !== canonicalSha256V1(body)) {
    throw new Error('context prefix identity checksum mismatch');
  }
  return parsed;
}

export const CONTEXT_PREFIX_REUSE_OBSERVATION_V1_SCHEMA = 'parent-atlas.context-prefix-reuse-observation.v1' as const;

export const ContextPrefixReuseObservationV1Schema = z.object({
  schema: z.literal(CONTEXT_PREFIX_REUSE_OBSERVATION_V1_SCHEMA),
  contextPrefixIdentityChecksum: sha256HexSchema,
  stablePrefixBytes: z.number().int().nonnegative(),
  prefixDriftBytes: z.number().int().nonnegative(),
  cachedPrefillTokens: z.number().int().nonnegative(),
  newPrefillTokens: z.number().int().nonnegative(),
  prefixReuseRatio: z.number().finite().min(0).max(1),
  cacheStatus: z.enum(['HIT', 'MISS', 'PARTIAL', 'NO_DATA']),
  observedAt: z.string().datetime(),
  checksum: sha256HexSchema,
}).strict();

export type ContextPrefixReuseObservationV1 = z.infer<typeof ContextPrefixReuseObservationV1Schema>;

function commonPrefixBytes(previous: string | undefined, current: string): number {
  if (previous === undefined) return 0;
  const previousBytes = Buffer.from(previous, 'utf8');
  const currentBytes = Buffer.from(current, 'utf8');
  const limit = Math.min(previousBytes.length, currentBytes.length);
  let index = 0;
  while (index < limit && previousBytes[index] === currentBytes[index]) index += 1;
  return index;
}

export function buildContextPrefixReuseObservationV1(input: {
  identity: ContextPrefixIdentityV1;
  stablePrefix: string;
  previousStablePrefix?: string;
  cachedPrefillTokens: number;
  newPrefillTokens: number;
  observedAt?: string;
}): ContextPrefixReuseObservationV1 {
  const identity = verifyContextPrefixIdentityV1(input.identity);
  const stablePrefixChecksum = canonicalSha256V1({
    schema: 'atlas.stable-prefix-content.v1',
    stablePrefix: input.stablePrefix,
  });
  if (stablePrefixChecksum !== identity.stablePrefixChecksum) {
    throw new Error('context prefix observation does not match identity prefix');
  }
  const cachedPrefillTokens = input.cachedPrefillTokens;
  const newPrefillTokens = input.newPrefillTokens;
  if (!Number.isInteger(cachedPrefillTokens) || cachedPrefillTokens < 0) {
    throw new Error('cachedPrefillTokens must be a non-negative integer');
  }
  if (!Number.isInteger(newPrefillTokens) || newPrefillTokens < 0) {
    throw new Error('newPrefillTokens must be a non-negative integer');
  }

  const stablePrefixBytes = Buffer.byteLength(input.stablePrefix, 'utf8');
  const prefixDriftBytes = stablePrefixBytes - commonPrefixBytes(input.previousStablePrefix, input.stablePrefix);
  const totalTokens = cachedPrefillTokens + newPrefillTokens;
  const body = {
    schema: CONTEXT_PREFIX_REUSE_OBSERVATION_V1_SCHEMA,
    contextPrefixIdentityChecksum: identity.checksum,
    stablePrefixBytes,
    prefixDriftBytes,
    cachedPrefillTokens,
    newPrefillTokens,
    prefixReuseRatio: totalTokens === 0 ? 0 : cachedPrefillTokens / totalTokens,
    cacheStatus: totalTokens === 0
      ? 'NO_DATA' as const
      : cachedPrefillTokens === 0
        ? 'MISS' as const
        : newPrefillTokens === 0
          ? 'HIT' as const
          : 'PARTIAL' as const,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
  return ContextPrefixReuseObservationV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}
