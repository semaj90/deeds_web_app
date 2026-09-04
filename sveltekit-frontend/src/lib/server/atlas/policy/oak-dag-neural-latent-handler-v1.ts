import {
  OAK_NEURAL_LATENT_STRICT_V1,
  oakNeuralLatentInputV1Schema,
  oakNeuralLatentReceiptV1Schema,
} from '@deeds/parent-atlas';
import type { KernelDagExecutionBindingV1 } from '@deeds/parent-atlas';
import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { runNeuralDecoderPrefillCallerV1 } from '$lib/server/ai/neural-decoder-prefill-caller-v1.js';
import type { NeuralDecoderFeatureCache, NeuralDecoderFeatureCacheRecord } from '$lib/server/ai/neural-decoder-client.js';

// No-op cache (always MISS) -- this is a first version prioritizing correctness/simplicity
// over cache-hit performance. neural-decoder-prefill-shadow.ts's redisNeuralDecoderFeatureCache
// is the real Redis-backed precedent for a future upgrade; not reused directly here since it is
// module-private to that file and this handler's replay/caching semantics haven't been designed
// yet (a separate, deliberate decision, not made implicitly by copying an unrelated cache key
// namespace).
const noopNeuralDecoderFeatureCache: NeuralDecoderFeatureCache = {
  async get(): Promise<NeuralDecoderFeatureCacheRecord | null> {
    return null;
  },
  async put(): Promise<void> {
    // intentionally no-op
  },
};

/**
 * Bounded, checksum-referenced neural-latent signal for the OaK DAG (design.md D6,
 * openspec/changes/parent-atlas-search-classifier-sidecar task 4). The neural decoder itself
 * stays a pure encode/decode service; this handler only ever calls it through the existing
 * runNeuralDecoderPrefillCallerV1 seam (never a second HTTP client), in SHADOW_READONLY mode —
 * observes, never decides, never writes, never adds a retrieval vote.
 *
 * Proven live before this file existed: scripts/atlas/prove-oak-dag-neural-latent-receipt-v1.mjs
 * (that script's stable-checksum + l2Norm logic operates on a raw latent array fetched directly
 * from the decoder's HTTP API — a prototype-only shortcut. This production handler deliberately
 * does NOT do that: it goes through runNeuralDecoderPrefillCallerV1, which returns only a
 * pre-computed checksum, never the raw array, so l2Norm cannot be derived here — see the null
 * below, not a fabricated value.)
 */

export function createOakDagNeuralLatentHandlerV1(): OakDagActionHandlerV1 {
  return {
    implementationRef: OAK_NEURAL_LATENT_STRICT_V1,
    operatorId: 'op:neural_latent_signal',
    operatorKind: 'FETCH_LATENT',
    actionKinds: ['FETCH_LATENT'],
    outputContract: 'output:oak_neural_latent_receipt',
    run: async ({ binding }: { binding: KernelDagExecutionBindingV1 }) => {
      const args = oakNeuralLatentInputV1Schema.parse(binding.boundArguments);

      const receipt = await runNeuralDecoderPrefillCallerV1({
        requestId: args.requestId,
        mode: 'SHADOW_READONLY',
        semantic768: [args.semantic768],
        basePrefillIdentityChecksum: args.basePrefillIdentityChecksum,
        decoderContractRevision: args.decoderContractRevision,
        decoderPolicyRevision: args.decoderPolicyRevision,
        cache: noopNeuralDecoderFeatureCache,
      });

      // decoderOutputChecksum (the caller's already-computed latent256Checksum) is reused
      // directly rather than re-deriving a checksum from a raw array this handler never
      // receives -- the caller seam is the single source of truth for that value.
      const hasLatent = receipt.cacheStatus === 'HIT' || receipt.cacheStatus === 'MISS';

      return oakNeuralLatentReceiptV1Schema.parse({
        schema: 'atlas.oak-neural-latent-receipt.v1',
        implementationRef: OAK_NEURAL_LATENT_STRICT_V1,
        representation: 'latent_256',
        latentChecksum: hasLatent ? receipt.decoderOutputChecksum : null,
        latentWidth: hasLatent ? 256 : null,
        // l2Norm is not exposed by the caller receipt (it only carries checksums, not the
        // vector itself, by design -- see design.md D6). Deriving it here would require the
        // raw latent array, which this handler must never hold. Left null until the caller
        // seam is extended to carry a scalar l2Norm alongside its existing checksum fields --
        // a deliberate, tracked gap, not a fabricated value.
        l2Norm: null,
        cacheStatus: receipt.cacheStatus,
        writesPerformed: false,
        canonicalAuthority: false,
      });
    },
  };
}
