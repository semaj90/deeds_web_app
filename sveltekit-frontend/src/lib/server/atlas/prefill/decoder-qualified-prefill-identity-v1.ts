import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from './canonical-hash-v1.js';

/**
 * PREFILL-IDENTITY-DECODER-01
 *
 * Closes a cache-identity trap identified before any live Valkey wiring
 * exists for the real prefill owner: the existing `atlas:prefill:v1` Valkey
 * store contract uses SET NX EX (write-only-if-absent). If neural-decoder
 * provenance were attached only as sibling metadata on a prefill record --
 * without changing the *logical* prefill cache key -- a stale record from a
 * pre-decoder (or older-checkpoint) run would satisfy the same key, the NX
 * write would no-op with ALREADY_EXISTS, and the caller would silently read
 * a stale decoder-less (or wrong-checkpoint) record until TTL expiry.
 *
 * The fix: any decoder input that can change the *resolved* prefill output
 * MUST fold into the logical prefill identity BEFORE it is used as a cache
 * key. This module defines that qualified identity. It does not touch the
 * base `PrefillContentIdentityV1` contract (prefill-contracts-v1.ts) --
 * it composes on top of it, the same way `basePrefillIdentityChecksum`
 * composes here.
 *
 * Deliberately excluded from identity (documented, not an oversight):
 * - Service URL / container ID / host:port -- executor coordinates, not
 *   logical output provenance. Two decoder replicas with identical
 *   checkpoint + policy must resolve to the SAME cache key.
 * - decoderOutputChecksum -- unknown until AFTER a cache MISS actually runs
 *   the decoder. It cannot be part of the *lookup* key. It belongs on the
 *   stored record / replay receipt instead (see PREFILL-REPLAY-01).
 */

const revision = z.string().min(1);

export const DecoderQualifiedPrefillIdentityV1Schema = z.object({
  schema: z.literal('atlas.decoder-qualified-prefill-identity.v1'),
  basePrefillIdentityChecksum: sha256HexSchema,
  decoderContractRevision: revision,
  representationId: z.literal('latent_256'),
  representationRevision: revision,
  checkpointRevision: revision,
  checkpointSha256: revision,
  latentInputChecksum: sha256HexSchema,
  decoderPolicyRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type DecoderQualifiedPrefillIdentityV1 = z.infer<typeof DecoderQualifiedPrefillIdentityV1Schema>;

export type DecoderQualifiedPrefillIdentityInputV1 = Omit<
  DecoderQualifiedPrefillIdentityV1,
  'schema' | 'checksumSha256'
>;

/**
 * Computes the identity checksum of the exact `semantic_768` batch fed into
 * the decoder for this prefill. This is an INPUT checksum -- it is knowable
 * before invoking the decoder, unlike `decoderOutputChecksum`, which is why
 * it (and not the output) is safe to use in a cache lookup key.
 */
export function computeLatentInputChecksumV1(semantic768: readonly (readonly number[])[]): string {
  return canonicalSha256V1({
    schema: 'atlas.decoder-latent-input.v1',
    semantic768: semantic768.map((row) => [...row]),
  });
}

export function buildDecoderQualifiedPrefillIdentityV1(
  input: DecoderQualifiedPrefillIdentityInputV1,
): DecoderQualifiedPrefillIdentityV1 {
  const payload = {
    schema: 'atlas.decoder-qualified-prefill-identity.v1' as const,
    ...input,
  };
  return DecoderQualifiedPrefillIdentityV1Schema.parse({
    ...payload,
    checksumSha256: canonicalSha256V1(payload),
  });
}

/**
 * The value the real prefill owner MUST use as its Valkey cache key once
 * decoder-enabled mode writes into the shared `atlas:prefill:v1` namespace
 * (PREFILL-VALKEY-01). Using `basePrefillIdentityChecksum` alone here would
 * reintroduce the stale-record trap this module exists to close.
 */
export function decoderQualifiedPrefillCacheKeyV1(identity: DecoderQualifiedPrefillIdentityV1): string {
  return `atlas:prefill:v1:decoder-qualified:${identity.checksumSha256}`;
}
