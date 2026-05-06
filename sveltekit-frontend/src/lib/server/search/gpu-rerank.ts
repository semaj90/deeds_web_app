/**
 * GPU/CPU reranker for final-stage candidate scoring.
 *
 * < 32 candidates : pure CPU dot product (avoids worker-thread overhead)
 * 32–63 candidates: MLA low-rank reranker (128-dim latent, 6× bandwidth reduction,
 *                   fused with SOM proximity when BMU coords are present)
 * ≥ 64 candidates : batchCosineSimilarity() via libtorch-bridge N-API
 *
 * MLA path caches per-chunk latent KV vectors in Redis (TTL 300s), so repeated
 * queries over the same candidate set are near-zero cost.
 */

import { batchCosineSimilarity }               from '$lib/server/gpu/libtorch-bridge.js';
import { mlaFusionRerank, type MlaFusionOpts } from './mla-kv-compress.js';

export interface RerankCandidate {
  stable_key:    string;
  embedding?:    number[];
  pre_score:     number;
  som_bmu_col?:  number;
  som_bmu_row?:  number;
  authority_score?: number;
}

export interface RerankResult extends RerankCandidate {
  gpu_score:    number;
  final_score:  number;
  mla_score?:   number;    // set when MLA path was used
}

function cpuCosSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export async function rerankCandidates(
  queryEmbedding: number[],
  candidates: RerankCandidate[],
  preScoreWeight = 0.4,
  mlaOpts?: MlaFusionOpts
): Promise<RerankResult[]> {
  const withEmbed    = candidates.filter((c) => c.embedding?.length);
  const withoutEmbed = candidates.filter((c) => !c.embedding?.length);

  if (!withEmbed.length) {
    return candidates.map((c) => ({ ...c, gpu_score: 0, final_score: c.pre_score }));
  }

  const queryArr = new Float32Array(queryEmbedding);
  let scores: number[];
  let mlaScores: number[] | null = null;

  if (withEmbed.length < 32) {
    // ── CPU path: cache-blocked dot product ─────────────────────────────────
    scores = withEmbed.map((c) => cpuCosSim(queryArr, new Float32Array(c.embedding!)));

  } else if (withEmbed.length < 64) {
    // ── MLA path: 128-dim latent, fused with SOM proximity ──────────────────
    try {
      const mlaResults = await mlaFusionRerank(queryEmbedding, withEmbed, mlaOpts ?? {});
      const scoreMap = new Map(mlaResults.map(r => [r.stable_key, r]));
      scores     = withEmbed.map(c => scoreMap.get(c.stable_key)?.latent_score ?? 0);
      mlaScores  = withEmbed.map(c => scoreMap.get(c.stable_key)?.mla_score   ?? 0);
    } catch {
      scores = withEmbed.map((c) => cpuCosSim(queryArr, new Float32Array(c.embedding!)));
    }

  } else {
    // ── LibTorch GPU path: full 768-dim batch cosine similarity ─────────────
    try {
      const corpus = withEmbed.map((c) => c.embedding!);
      const result = await batchCosineSimilarity(Array.from(queryArr), corpus);
      scores = result.scores;
    } catch {
      scores = withEmbed.map((c) => cpuCosSim(queryArr, new Float32Array(c.embedding!)));
    }
  }

  const reranked: RerankResult[] = withEmbed.map((c, i) => {
    const gpuScore  = scores[i] ?? 0;
    const mlaScore  = mlaScores?.[i];
    const finalScore = mlaScore != null
      ? mlaScore  // MLA already fuses pre_score + SOM + authority
      : preScoreWeight * c.pre_score + (1 - preScoreWeight) * gpuScore;
    return { ...c, gpu_score: gpuScore, final_score: finalScore, mla_score: mlaScore };
  });

  const passthrough: RerankResult[] = withoutEmbed.map((c) => ({
    ...c,
    gpu_score: 0,
    final_score: c.pre_score,
  }));

  return [...reranked, ...passthrough].sort((a, b) => b.final_score - a.final_score);
}
