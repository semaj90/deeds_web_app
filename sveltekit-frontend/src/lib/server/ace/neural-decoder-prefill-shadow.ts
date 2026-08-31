import { ENV } from '$lib/server/env.server.js';
import { getJson, setJsonWithTtl } from '$lib/server/redis.js';
import { canonicalSha256V1 } from '$lib/server/atlas/prefill/canonical-hash-v1.js';
import type { NeuralDecoderFeatureCache, NeuralDecoderFeatureCacheRecord, NeuralDecoderClientOptions } from '$lib/server/ai/neural-decoder-client.js';
import { runNeuralDecoderPrefillCallerV1, type NeuralDecoderPrefillCallerReceiptV1 } from '$lib/server/ai/neural-decoder-prefill-caller-v1.js';
import type { ContextManifest } from './context-compiler.parent-atlas.js';

/**
 * PREFILL-CALLER-01 (query-only first wire): the single live seam that
 * attaches a decoder shadow receipt to a compiled ContextManifest.
 *
 * Scope, deliberately narrow for this first live wiring: the decoder runs
 * on the QUERY embedding only, not per-candidate embeddings -- ACEContext
 * does not carry per-candidate `semantic_768` vectors through to
 * manifest-build time yet (fetchRAGChunks() computes them transiently for
 * reranking and discards them). Per-candidate wiring is a separate, larger
 * change (thread embeddings through fetchRAGChunks' return shape) tracked
 * as its own follow-up in
 * openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md -- do not
 * infer per-candidate latent coverage from this receipt. It proves the real
 * end-to-end plumbing (identity -> decoder -> cache -> receipt) on live
 * traffic; it does not prove candidate-level latent_256 hydration.
 *
 * Fails open unconditionally: any error here is swallowed and returns null.
 * This function must never be able to break ACE context assembly.
 */

const REDIS_FEATURE_CACHE_TTL_SECONDS = 86_400; // 24h, matches this repo's other GPU/Karpathy caches

const redisNeuralDecoderFeatureCache: NeuralDecoderFeatureCache = {
  async get(key: string): Promise<NeuralDecoderFeatureCacheRecord | null> {
    return getJson<NeuralDecoderFeatureCacheRecord>(key);
  },
  async put(key: string, record: NeuralDecoderFeatureCacheRecord): Promise<void> {
    await setJsonWithTtl(key, record, REDIS_FEATURE_CACHE_TTL_SECONDS);
  },
};

/**
 * The existing (`compileContext()`-built) manifest identity already covers
 * exactly what a base prefill identity needs: the selected packet/ordinal
 * set and the per-candidate revision set. This composes them into a single
 * checksum rather than inventing a new identity computation.
 */
export function deriveBasePrefillIdentityChecksumFromManifest(manifest: ContextManifest): string | null {
  if (!manifest.identity) return null;
  return canonicalSha256V1({
    schema: 'atlas.manifest-base-prefill-identity.v1',
    candidateOrdinalSetChecksum: manifest.identity.candidate_ordinal_set_checksum,
    evidenceRevisionChecksum: manifest.identity.evidence_revision_checksum,
  });
}

export type NeuralDecoderPrefillShadowOptions = {
  requestId: string;
  decoderContractRevision?: string;
  decoderPolicyRevision?: string;
  decoder?: NeuralDecoderClientOptions;
};

export async function runNeuralDecoderPrefillShadowForManifest(
  manifest: ContextManifest,
  queryEmbedding: readonly number[] | null | undefined,
  opts: NeuralDecoderPrefillShadowOptions,
): Promise<NeuralDecoderPrefillCallerReceiptV1 | null> {
  if (!ENV.NEURAL_DECODER_PREFILL_SHADOW_ENABLED) return null;
  if (!queryEmbedding || queryEmbedding.length !== 768) return null;

  try {
    const basePrefillIdentityChecksum = deriveBasePrefillIdentityChecksumFromManifest(manifest);
    if (!basePrefillIdentityChecksum) return null;

    return await runNeuralDecoderPrefillCallerV1({
      requestId: opts.requestId,
      mode: 'SHADOW_READONLY',
      semantic768: [queryEmbedding],
      basePrefillIdentityChecksum,
      decoderContractRevision: opts.decoderContractRevision ?? 'neural-decoder-prefill-shadow.query-only.v1',
      decoderPolicyRevision: opts.decoderPolicyRevision ?? 'neural-decoder-prefill-shadow.default-policy.v1',
      cache: redisNeuralDecoderFeatureCache,
      decoder: opts.decoder,
    });
  } catch (err) {
    console.warn('[neural-decoder-prefill-shadow] failed, ignoring (shadow-only, never blocking):', (err as Error)?.message ?? err);
    return null;
  }
}
