import { z } from 'zod';
import { sha256HexSchema } from '$lib/server/atlas/prefill/canonical-hash-v1.js';
import {
  buildDecoderQualifiedPrefillIdentityV1,
  computeLatentInputChecksumV1,
} from '$lib/server/atlas/prefill/decoder-qualified-prefill-identity-v1.js';
import {
  prepareNeuralDecoderFeaturePrefill,
  type NeuralDecoderFeaturePrefillRequest,
} from './neural-decoder-prefill-adapter.js';

/**
 * PREFILL-CALLER-01A/01B
 *
 * The real-owner application seam for the neural decoder, one layer above
 * `prepareNeuralDecoderFeaturePrefill()` (the guarded low-level cache-aside
 * seam, already proven). This is what a live prefill owner would call.
 *
 * Only two modes exist on purpose -- `ENABLED_PRODUCTION` is deliberately
 * NOT a value yet. Promotion to a mode that can influence retrieval requires
 * PREFILL-QUALITY-01 (QRELS) first.
 *
 * Fail-open contract (load-bearing):
 * - `DISABLED`            -> byte-for-byte old prefill behavior. Decoder and
 *                            cache are never touched. `resolvedPrefillChecksum`
 *                            equals `basePrefillIdentityChecksum` verbatim.
 * - decoder unavailable   -> `DECODER_UNAVAILABLE`, preserve old prefill
 *                            behavior (same resolvedPrefillChecksum).
 * - decoder invalid resp. -> `DECODER_REJECTED`, preserve old prefill
 *                            behavior (same resolvedPrefillChecksum).
 * - `SHADOW_READONLY` HIT/MISS -> decoder provenance is recorded on the
 *                            receipt, but `resolvedPrefillChecksum` STILL
 *                            equals `basePrefillIdentityChecksum`. No
 *                            candidate reorder, no retrieval vote, no
 *                            canonical write, no Valkey write -- this mode
 *                            observes, it does not decide.
 */

export const NeuralDecoderPrefillModeSchema = z.enum(['DISABLED', 'SHADOW_READONLY']);
export type NeuralDecoderPrefillMode = z.infer<typeof NeuralDecoderPrefillModeSchema>;

export const NeuralDecoderPrefillCacheStatusSchema = z.enum([
  'DISABLED',
  'MISS',
  'HIT',
  'DECODER_UNAVAILABLE',
  'DECODER_REJECTED',
]);
export type NeuralDecoderPrefillCacheStatus = z.infer<typeof NeuralDecoderPrefillCacheStatusSchema>;

export const NeuralDecoderPrefillCallerReceiptV1Schema = z.object({
  schema: z.literal('atlas.neural-decoder-prefill-caller-receipt.v1'),
  requestId: z.string().min(1),
  mode: NeuralDecoderPrefillModeSchema,
  basePrefillIdentityChecksum: sha256HexSchema,
  decoderQualifiedPrefillIdentityChecksum: sha256HexSchema.nullable(),
  representationId: z.literal('latent_256').nullable(),
  representationRevision: z.string().nullable(),
  checkpointRevision: z.string().nullable(),
  checkpointSha256: z.string().nullable(),
  latentInputChecksum: sha256HexSchema.nullable(),
  cacheStatus: NeuralDecoderPrefillCacheStatusSchema,
  decoderInvocations: z.union([z.literal(0), z.literal(1)]),
  decoderOutputChecksum: sha256HexSchema.nullable(),
  resolvedPrefillChecksum: sha256HexSchema,
  canonicalWrites: z.literal(0),
  retrievalVotesAdded: z.literal(0),
  canonicalAuthority: z.literal(false),
}).strict();

export type NeuralDecoderPrefillCallerReceiptV1 = z.infer<typeof NeuralDecoderPrefillCallerReceiptV1Schema>;

export type NeuralDecoderPrefillCallerRequestV1 = {
  requestId: string;
  mode: NeuralDecoderPrefillMode;
  semantic768: readonly (readonly number[])[];
  /** The existing prefill owner's own logical identity checksum. Never mutated. */
  basePrefillIdentityChecksum: string;
  decoderContractRevision: string;
  decoderPolicyRevision: string;
  cache: NeuralDecoderFeaturePrefillRequest['cache'];
  decoder?: NeuralDecoderFeaturePrefillRequest['decoder'];
};

const DECODER_UNAVAILABLE_PATTERN = /NEURAL_DECODER_NOT_CONFIGURED|NEURAL_DECODER_HTTP_ERROR|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network|timeout|abort/i;

/** Connectivity/config failures are UNAVAILABLE; anything the decoder actually answered (bad shape, wrong checkpoint, bad dimensions) is REJECTED. */
function classifyDecoderFailure(err: unknown): NeuralDecoderPrefillCacheStatus {
  const message = err instanceof Error ? err.message : String(err);
  return DECODER_UNAVAILABLE_PATTERN.test(message) ? 'DECODER_UNAVAILABLE' : 'DECODER_REJECTED';
}

/**
 * Real-owner caller. Byte-for-byte identical `resolvedPrefillChecksum` across
 * `DISABLED`, `DECODER_UNAVAILABLE`, `DECODER_REJECTED`, and both `HIT`/`MISS`
 * outcomes of `SHADOW_READONLY` is the regression this function exists to
 * guarantee (see the spec file's `resolvedPrefillChecksum` invariant test).
 */
export async function runNeuralDecoderPrefillCallerV1(
  request: NeuralDecoderPrefillCallerRequestV1,
): Promise<NeuralDecoderPrefillCallerReceiptV1> {
  const resolvedPrefillChecksum = request.basePrefillIdentityChecksum;

  if (request.mode === 'DISABLED') {
    return NeuralDecoderPrefillCallerReceiptV1Schema.parse({
      schema: 'atlas.neural-decoder-prefill-caller-receipt.v1',
      requestId: request.requestId,
      mode: 'DISABLED',
      basePrefillIdentityChecksum: request.basePrefillIdentityChecksum,
      decoderQualifiedPrefillIdentityChecksum: null,
      representationId: null,
      representationRevision: null,
      checkpointRevision: null,
      checkpointSha256: null,
      latentInputChecksum: null,
      cacheStatus: 'DISABLED',
      decoderInvocations: 0,
      decoderOutputChecksum: null,
      resolvedPrefillChecksum,
      canonicalWrites: 0,
      retrievalVotesAdded: 0,
      canonicalAuthority: false,
    });
  }

  const latentInputChecksum = computeLatentInputChecksumV1(request.semantic768);
  let cacheStatus: NeuralDecoderPrefillCacheStatus = 'MISS';
  let decoderInvocations: 0 | 1 = 0;
  let decoderOutputChecksum: string | null = null;
  let representationRevision: string | null = null;
  let checkpointRevision: string | null = null;
  let checkpointSha256: string | null = null;
  let decoderQualifiedPrefillIdentityChecksum: string | null = null;

  try {
    const result = await prepareNeuralDecoderFeaturePrefill({
      enabled: true,
      semantic768: request.semantic768,
      prefillIdentityChecksum: request.basePrefillIdentityChecksum,
      cache: request.cache,
      decoder: request.decoder,
    });

    if (result.status === 'HIT' || result.status === 'MISS') {
      cacheStatus = result.status;
      decoderInvocations = result.status === 'MISS' ? 1 : 0;
      decoderOutputChecksum = result.envelope.latent256Checksum;
      representationRevision = result.envelope.representationRevision;
      checkpointRevision = result.envelope.checkpointRevision;
      checkpointSha256 = result.envelope.checkpointSha256;

      const identity = buildDecoderQualifiedPrefillIdentityV1({
        basePrefillIdentityChecksum: request.basePrefillIdentityChecksum,
        decoderContractRevision: request.decoderContractRevision,
        representationId: 'latent_256',
        representationRevision,
        checkpointRevision,
        checkpointSha256,
        latentInputChecksum,
        decoderPolicyRevision: request.decoderPolicyRevision,
      });
      decoderQualifiedPrefillIdentityChecksum = identity.checksumSha256;
    }
  } catch (err) {
    // Fail-open: any decoder failure (network, validation, checkpoint
    // mismatch) preserves old prefill behavior. resolvedPrefillChecksum is
    // computed above and does not depend on this branch.
    cacheStatus = classifyDecoderFailure(err);
    decoderInvocations = cacheStatus === 'DECODER_REJECTED' ? 1 : 0;
  }

  return NeuralDecoderPrefillCallerReceiptV1Schema.parse({
    schema: 'atlas.neural-decoder-prefill-caller-receipt.v1',
    requestId: request.requestId,
    mode: 'SHADOW_READONLY',
    basePrefillIdentityChecksum: request.basePrefillIdentityChecksum,
    decoderQualifiedPrefillIdentityChecksum,
    representationId: decoderQualifiedPrefillIdentityChecksum ? 'latent_256' : null,
    representationRevision,
    checkpointRevision,
    checkpointSha256,
    latentInputChecksum,
    cacheStatus,
    decoderInvocations,
    decoderOutputChecksum,
    resolvedPrefillChecksum,
    canonicalWrites: 0,
    retrievalVotesAdded: 0,
    canonicalAuthority: false,
  });
}
