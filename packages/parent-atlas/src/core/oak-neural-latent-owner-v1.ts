import { z } from 'zod';

/**
 * Governed owner contract for the OaK DAG neural-latent signal
 * (openspec/changes/parent-atlas-search-classifier-sidecar task 4).
 *
 * The neural decoder itself (python/atlas_neural_decoder_service.py) stays a pure encode/decode
 * service -- canonicalAuthority: false, writesPerformed: false at its own source. This owner
 * contract governs only the BOUNDED receipt an OaK DAG handler is allowed to produce from a
 * decoder call: latentChecksum + latentWidth + l2Norm (+ optional nearestClusterId once a
 * KMeans model exists for the latent_256 space -- not built yet, correctly omitted here per
 * design.md D6). The raw latent float array is NEVER part of this contract, per CLAUDE.md's hard
 * rule against persisting hidden/raw tensor state.
 *
 * Proven live before this contract was written: scripts/atlas/prove-oak-dag-neural-latent-receipt-v1.mjs
 * (real encode call against the running atlas-neural-decoder service, deterministic checksum
 * across two calls with the same fixture input -- see that script's own PASS output for the
 * evidence trail).
 */

export const OAK_NEURAL_LATENT_STRICT_V1 =
  'sveltekit-frontend/src/lib/server/ai/neural-decoder-prefill-caller-v1.ts#runNeuralDecoderPrefillCallerV1' as const;

export const oakNeuralLatentInputV1Schema = z.object({
  semantic768: z.array(z.number().finite()).length(768),
  requestId: z.string().min(1),
  basePrefillIdentityChecksum: z.string().min(1),
  decoderContractRevision: z.string().min(1),
  decoderPolicyRevision: z.string().min(1),
}).strict();

export type OakNeuralLatentInputV1 = z.infer<typeof oakNeuralLatentInputV1Schema>;

export const oakNeuralLatentReceiptV1Schema = z.object({
  schema: z.literal('atlas.oak-neural-latent-receipt.v1'),
  implementationRef: z.literal(OAK_NEURAL_LATENT_STRICT_V1),
  representation: z.literal('latent_256'),
  latentChecksum: z.string().min(1).nullable(),
  latentWidth: z.literal(256).nullable(),
  l2Norm: z.number().finite().nullable(),
  nearestClusterId: z.number().int().nonnegative().optional(),
  cacheStatus: z.enum(['DISABLED', 'MISS', 'HIT', 'DECODER_UNAVAILABLE', 'DECODER_REJECTED']),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();

export type OakNeuralLatentReceiptV1 = z.infer<typeof oakNeuralLatentReceiptV1Schema>;
