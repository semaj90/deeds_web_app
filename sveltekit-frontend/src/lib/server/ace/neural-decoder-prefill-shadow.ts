import { ENV } from '$lib/server/env.server.js';
import { getJson, setJsonWithTtl } from '$lib/server/redis.js';
import { canonicalSha256V1 } from '$lib/server/atlas/prefill/canonical-hash-v1.js';
import type { NeuralDecoderFeatureCache, NeuralDecoderFeatureCacheRecord, NeuralDecoderClientOptions } from '$lib/server/ai/neural-decoder-client.js';
import { runNeuralDecoderPrefillCallerV1, type NeuralDecoderPrefillCallerReceiptV1 } from '$lib/server/ai/neural-decoder-prefill-caller-v1.js';
import type { ContextManifest } from './context-compiler.parent-atlas.js';

/**
 * PREFILL-CALLER-01: the single live seam that attaches a decoder shadow
 * receipt to a compiled ContextManifest.
 *
 * Originally query-only (the decoder ran on the query embedding alone,
 * because ACEContext did not carry per-candidate `semantic_768` vectors
 * through to manifest-build time -- fetchRAGChunks() computed them
 * transiently for reranking and discarded them). `fetchRAGChunks()` now
 * re-attaches those transient embeddings to `RAGChunk.embedding` (see
 * context-assembler.ts's `chunkContentEmbeddingMap`), so a caller with a
 * real per-candidate embedding set can pass it via `candidateEmbeddings`.
 *
 * `candidateEmbeddings` is OPTIONAL and additive -- omitting it preserves
 * the original query-only behavior exactly (still the only mode the one
 * caller with no embedded candidates, the Parent Atlas preflight branch,
 * can honestly use). Passing it does NOT by itself upgrade any
 * `feature_presence.latent256` value on the manifest -- the caller must
 * still explicitly derive and set that from the actual `candidateEmbeddings`
 * count it sent versus `manifest.selected_packet_keys.length`, and only
 * after confirming `cacheStatus` is `HIT`/`MISS` (the decoder actually
 * answered). This function does not do that upgrade itself, to keep a
 * single, auditable place where "coverage" claims are computed.
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

/** Batch cap enforced by encodeNeuralLatents(); reserve slot 0 for the query embedding. */
export const MAX_CANDIDATE_EMBEDDINGS = 31;

/**
 * Pure filter/truncate step, extracted so the batching rule (drop anything
 * not exactly 768-dim, cap at MAX_CANDIDATE_EMBEDDINGS) is unit-testable
 * without touching the decoder, Redis, or the ENV flag gate.
 */
export function selectValidCandidateEmbeddings(
  candidateEmbeddings: ReadonlyArray<readonly number[]> | null | undefined,
): number[][] {
  return (candidateEmbeddings ?? [])
    .filter((v): v is number[] => Array.isArray(v) && v.length === 768)
    .slice(0, MAX_CANDIDATE_EMBEDDINGS);
}

export async function runNeuralDecoderPrefillShadowForManifest(
  manifest: ContextManifest,
  queryEmbedding: readonly number[] | null | undefined,
  opts: NeuralDecoderPrefillShadowOptions,
  candidateEmbeddings?: ReadonlyArray<readonly number[]> | null,
): Promise<NeuralDecoderPrefillCallerReceiptV1 | null> {
  if (!ENV.NEURAL_DECODER_PREFILL_SHADOW_ENABLED) return null;
  if (!queryEmbedding || queryEmbedding.length !== 768) return null;

  const validCandidates = selectValidCandidateEmbeddings(candidateEmbeddings);

  try {
    const basePrefillIdentityChecksum = deriveBasePrefillIdentityChecksumFromManifest(manifest);
    if (!basePrefillIdentityChecksum) return null;

    return await runNeuralDecoderPrefillCallerV1({
      requestId: opts.requestId,
      mode: 'SHADOW_READONLY',
      semantic768: [queryEmbedding, ...validCandidates],
      basePrefillIdentityChecksum,
      decoderContractRevision:
        opts.decoderContractRevision ??
        (validCandidates.length > 0
          ? 'neural-decoder-prefill-shadow.query-and-candidates.v1'
          : 'neural-decoder-prefill-shadow.query-only.v1'),
      decoderPolicyRevision: opts.decoderPolicyRevision ?? 'neural-decoder-prefill-shadow.default-policy.v1',
      cache: redisNeuralDecoderFeatureCache,
      decoder: opts.decoder,
    });
  } catch (err) {
    console.warn('[neural-decoder-prefill-shadow] failed, ignoring (shadow-only, never blocking):', (err as Error)?.message ?? err);
    return null;
  }
}
