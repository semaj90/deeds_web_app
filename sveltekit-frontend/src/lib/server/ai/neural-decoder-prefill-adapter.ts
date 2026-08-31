import {
  encodeNeuralLatentsWithFeatureCache,
  type NeuralDecoderClientOptions,
  type NeuralDecoderEncodeResponse,
  type NeuralDecoderFeatureCache,
  type NeuralDecoderFeaturePrefillV1,
} from './neural-decoder-client.js';

const checksumPattern = /^[a-f0-9]{64}$/i;

export type NeuralDecoderFeaturePrefillRequest = {
  enabled?: boolean;
  semantic768: readonly (readonly number[])[];
  prefillIdentityChecksum: string;
  cache: NeuralDecoderFeatureCache;
  decoder?: NeuralDecoderClientOptions;
};

export type NeuralDecoderFeaturePrefillResult =
  | { status: 'DISABLED'; response: null; envelope: null; key: null }
  | {
      status: 'HIT' | 'MISS';
      response: NeuralDecoderEncodeResponse;
      envelope: NeuralDecoderFeaturePrefillV1;
      key: string;
    };

/**
 * Guarded application seam for derived neural feature prefill.
 *
 * This is intentionally not a synthesis/KV-prefill caller. It only derives
 * latent features when an existing logical prefill identity is supplied and
 * the caller explicitly opts in. The default path is a no-op.
 */
export async function prepareNeuralDecoderFeaturePrefill(
  request: NeuralDecoderFeaturePrefillRequest,
): Promise<NeuralDecoderFeaturePrefillResult> {
  if (request.enabled !== true) {
    return { status: 'DISABLED', response: null, envelope: null, key: null };
  }

  if (!checksumPattern.test(request.prefillIdentityChecksum)) {
    throw new Error('NEURAL_DECODER_PREFILL_IDENTITY_INVALID');
  }

  return encodeNeuralLatentsWithFeatureCache(
    request.semantic768,
    request.prefillIdentityChecksum,
    request.cache,
    request.decoder,
  );
}
