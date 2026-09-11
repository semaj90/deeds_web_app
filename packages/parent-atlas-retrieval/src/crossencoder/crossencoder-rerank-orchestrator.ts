/**
 * CrossEncoder Rerank Orchestrator
 *
 * The package owns CrossEncoder refinement only. The base retrieval/reranking
 * stage is injected by the application so this package does not duplicate the
 * live TurboVec/SearchRuntime owner.
 */

import type { BaseReranker, QdrantHit, RerankOptions, RerankResult } from './retrieval-contract.js';
import { applyReranking, blendCrossEncoderScore } from './crossencoder-client.js';

export interface CrossEncoderRerankOptions extends RerankOptions {
  /** Application-owned base reranker (for Parent Atlas today, adapt the live TurboVec owner). */
  baseReranker?: BaseReranker;
  /** Enable CrossEncoder refinement after the base reranker. */
  enableCrossEncoder?: boolean;
  /** CrossEncoder weight in final blend (default 0.15). */
  crossencoderWeight?: number;
}

export interface CrossEncoderRerankResult extends RerankResult {
  crossencoderApplied?: boolean;
  crossencoderLatencyMs?: number;
  baseRerankerApplied?: boolean;
}

async function runBaseReranker(options: CrossEncoderRerankOptions): Promise<RerankResult> {
  if (!options.baseReranker) {
    return {
      ok: true,
      hits: [...options.hits],
      latencyMs: 0,
      trace: {
        query: options.query,
        beforeIds: options.hits.map((hit) => String(hit.id)),
        afterIds: options.hits.map((hit) => String(hit.id)),
        scoreDeltas: {},
      },
    };
  }
  return options.baseReranker({ query: options.query, hits: options.hits });
}

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
        crossencoderApplied: false,
        baseRerankerApplied: Boolean(options.baseReranker),
      };
    }

    const baseResult = await runBaseReranker(options);
    if (!baseResult.ok) {
      return {
        ...baseResult,
        crossencoderApplied: false,
        baseRerankerApplied: Boolean(options.baseReranker),
      };
    }

    let finalHits = baseResult.hits;
    let ceLatencyMs = 0;
    let ceApplied = false;

    if (enableCrossEncoder && finalHits.length > 0) {
      const ceStart = performance.now();
      const hitsWithScores = finalHits as (QdrantHit & { crossencoder_score?: number })[];
      const reranked = await applyReranking(query, hitsWithScores);

      if (reranked && reranked.length > 0) {
        ceApplied = true;
        ceLatencyMs = Math.round(performance.now() - ceStart);
        finalHits = reranked
          .map((hit) => ({
            ...hit,
            score: blendCrossEncoderScore({ ...hit, score: hit.score }, crossencoderWeight),
          }))
          .sort((a, b) => b.score - a.score);
      }
    }

    return {
      ok: true,
      hits: finalHits,
      latencyMs: Math.round(performance.now() - t0),
      crossencoderApplied: ceApplied,
      crossencoderLatencyMs: ceApplied ? ceLatencyMs : undefined,
      baseRerankerApplied: Boolean(options.baseReranker),
      trace: {
        query,
        beforeIds: hits.map((hit) => String(hit.id)),
        afterIds: finalHits.map((hit) => String(hit.id)),
        scoreDeltas: {},
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      hits: [],
      latencyMs: Math.round(performance.now() - t0),
      crossencoderApplied: false,
      baseRerankerApplied: Boolean(options.baseReranker),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Explicit fallback mode: run only the injected base reranker. If none is
 * supplied, preserve the incoming order unchanged.
 */
export async function turboVecRerankWithCEFallback(
  options: CrossEncoderRerankOptions
): Promise<CrossEncoderRerankResult> {
  return crossencoderRerankOrchestrate({
    ...options,
    enableCrossEncoder: false,
  });
}
