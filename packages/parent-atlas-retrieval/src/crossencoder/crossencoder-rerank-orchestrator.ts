/**
 * CrossEncoder Rerank Orchestrator
 * Orchestrates multi-stage reranking: Semantic → TurboVec → CrossEncoder
 *
 * Phase C: Post-XGBoost stage, optional acceleration lane
 * Integrates gracefully: if sidecar unavailable, falls back to TurboVec-only reranking
 *
 * Signal blend: semantic 0.35 + topology 0.25 + latent 0.15 + glyph 0.10 + crossencoder 0.15
 */

import type { QdrantHit } from '../turbovec/turbovec-rerank.js';
import type { RerankOptions, RerankResult } from '../turbovec/turbovec-rerank.js';
import { turbovecRerank } from '../turbovec/turbovec-rerank.js';
import { applyReranking, blendCrossEncoderScore } from './crossencoder-client.js';

export interface CrossEncoderRerankOptions extends RerankOptions {
  /** Enable CrossEncoder reranking (default true if sidecar available) */
  enableCrossEncoder?: boolean;
  /** CrossEncoder weight in final blend (default 0.15) */
  crossencoderWeight?: number;
}

export interface CrossEncoderRerankResult extends RerankResult {
  /** Indicates whether CrossEncoder was applied */
  crossencoderApplied?: boolean;
  /** CrossEncoder latency if applied */
  crossencoderLatencyMs?: number;
}

/**
 * Orchestrate multi-stage reranking with CrossEncoder fallback
 *
 * Flow:
 * 1. Apply TurboVec reranking (semantic + topology + latent + glyph signals)
 * 2. Optionally apply CrossEncoder as 5th signal (if sidecar available)
 * 3. Return final ranking with trace
 *
 * Graceful fallback: if sidecar unavailable, returns TurboVec-only results
 */
export async function crossencoderRerankOrchestrate(
  options: CrossEncoderRerankOptions
): Promise<CrossEncoderRerankResult> {
  const t0 = performance.now();
  const { query, hits, enableCrossEncoder = true, crossencoderWeight = 0.15 } = options;

  try {
    if (!hits || hits.length === 0) {
      return {
        ok: true,
        hits: [],
        latencyMs: Math.round(performance.now() - t0),
        crossencoderApplied: false
      };
    }

    // Stage 1: Apply TurboVec reranking (4-signal blend)
    const turboVecResult = await turbovecRerank(options);
    if (!turboVecResult.ok) {
      return {
        ...turboVecResult,
        crossencoderApplied: false
      };
    }

    // Stage 2: Optional CrossEncoder reranking (5th signal)
    let finalHits = turboVecResult.hits;
    let ceLatencyMs = 0;
    let ceApplied = false;

    if (enableCrossEncoder && turboVecResult.hits.length > 0) {
      const ceStart = performance.now();
      const ceHitsWithScores = turboVecResult.hits as (QdrantHit & { crossencoder_score?: number })[];

      // Apply CrossEncoder
      const reranked = await applyReranking(query, ceHitsWithScores);

      if (reranked && reranked.length > 0) {
        ceApplied = true;
        ceLatencyMs = Math.round(performance.now() - ceStart);

        // Blend CrossEncoder score with existing (already blended) score
        // Recalibrate: CE is a refinement on top of TurboVec blend
        finalHits = reranked
          .map((hit) => {
            // Adjust semantic score to incorporate CE signal
            // TurboVec already blended 4 signals into hit.score
            // We now add CE as a refinement (0.15 weight)
            const refined = blendCrossEncoderScore(
              { ...hit, score: hit.score },
              crossencoderWeight
            );

            return {
              ...hit,
              score: refined
            };
          })
          .sort((a, b) => b.score - a.score);
      }
    }

    return {
      ok: true,
      hits: finalHits,
      latencyMs: Math.round(performance.now() - t0),
      crossencoderApplied: ceApplied,
      crossencoderLatencyMs: ceApplied ? ceLatencyMs : undefined,
      trace: {
        query,
        beforeIds: turboVecResult.hits.map((h) => String(h.id)),
        afterIds: finalHits.map((h) => String(h.id)),
        scoreDeltas: {} // TODO: populate if needed
      }
    };
  } catch (err: any) {
    return {
      ok: false,
      hits: [],
      latencyMs: Math.round(performance.now() - t0),
      crossencoderApplied: false,
      error: err?.message || String(err)
    };
  }
}

/**
 * Disable CrossEncoder gracefully (fallback mode)
 * Returns TurboVec reranking only
 */
export async function turboVecRerankWithCEFallback(
  options: CrossEncoderRerankOptions
): Promise<CrossEncoderRerankResult> {
  // Simply call orchestrator with CE disabled
  return crossencoderRerankOrchestrate({
    ...options,
    enableCrossEncoder: false
  });
}
