/**
 * POST /api/graph/fetch-rerank
 *
 * Resource-aware graph/semantic reranking. Qdrant remains the candidate source;
 * optional PageRank, n-ary hypergraph, AST, SOM/S3 evidence is admitted by a
 * finite recommendation budget. Exact promotion is a downstream proof gate: this
 * endpoint may plan it, but never claims to execute it.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { rerankHits, type QdrantHit, type QuerySom } from '$lib/server/ai/graph-reranker.js';
import {
  defaultLaneEstimates,
  selectRecommendationLanes,
  type RecommendationBudget,
  type RecommendationLane,
} from '$lib/server/ai/resource-aware-recommendation-policy.js';
import { mlaFusionRerank } from '$lib/server/search/mla-kv-compress.js';
import {
  toStandardizedBiasedQuaternion,
  hmmAxisMultiplierTuple,
  biasedUnitQuaternionTuple,
} from '$lib/server/search/quaternion-manifold.js';
import { hmmStateToGlyphSection } from '$lib/server/types/glyph.js';

const qdrantHitSchema = z.object({
  chunkId: z.string().min(1).max(200),
  score: z.number().min(0).max(1),
  payload: z.object({
    som_bmu_row: z.number().int().nullable().optional(),
    som_bmu_col: z.number().int().nullable().optional(),
    manifold4: z.array(z.number()).length(4).nullable().optional(),
    manifold4_q: z.array(z.number()).length(4).nullable().optional(),
    fast_ast_score: z.number().min(0).max(1).nullable().optional(),
    tags: z.array(z.string()).optional(),
    path: z.string().optional(),
    pagerank: z.number().min(0).nullable().optional(),
    hyperedgeWeight: z.number().min(0).max(1).nullable().optional(),
    mla_score: z.number().min(0).max(1).nullable().optional(),
  }).optional(),
});

const querySomSchema = z.object({
  row: z.number().int().nullable().optional(),
  col: z.number().int().nullable().optional(),
  manifold4_q: z.array(z.number()).length(4).nullable().optional(),
});

const hmmSchema = z.object({
  intent: z.string().optional(),
  state: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  signals: z.array(z.string()).optional(),
});

const budgetSchema = z.object({
  maxCandidates: z.number().int().min(1).max(1000),
  maxGraphHops: z.number().int().min(0).max(8),
  maxToolCalls: z.number().int().min(0).max(64),
  maxContextTokens: z.number().int().min(0).max(1_000_000),
  maxGpuBytes: z.number().int().min(0),
  maxLatencyMs: z.number().int().min(1).max(120_000),
});

const requestSchema = z.object({
  query: z.string().min(1).max(4000),
  qdrantHits: z.array(qdrantHitSchema).min(1).max(200),
  hmm: hmmSchema.optional(),
  querySom: querySomSchema.optional(),
  queryEmbedding: z.array(z.number()).length(768).optional(),
  queryKind: z.enum(['lookup', 'code_navigation', 'graph_reasoning', 'file_mutation', 'repair', 'unknown']).optional(),
  requiresExactEvidence: z.boolean().optional(),
  structuredTarget: z.boolean().optional(),
  requestedGraphHops: z.number().int().min(0).max(8).optional(),
  toolArgs: z.record(z.string(), z.unknown()).optional(),
  budget: budgetSchema.partial().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const DEFAULT_BUDGET: RecommendationBudget = {
  maxCandidates: 100,
  maxGraphHops: 2,
  maxToolCalls: 2,
  maxContextTokens: 4096,
  maxGpuBytes: 512 * 1024 * 1024,
  maxLatencyMs: 250,
};

const RERANK_CONSUMABLE_LANES = new Set<RecommendationLane>([
  'semantic',
  'ast',
  'pagerank',
  'hypergraph',
  'som',
  'hypersphere',
]);

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user?.id) {
    return json({ error: { code: 'unauthorized', message: 'Login required' } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { code: 'invalid_json', message: 'Request body must be JSON' } }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: { code: 'invalid_params', issues: parsed.error.issues } }, { status: 400 });
  }

  const {
    query, qdrantHits, hmm, querySom, queryEmbedding, limit,
    queryKind, requiresExactEvidence, structuredTarget, requestedGraphHops, toolArgs,
  } = parsed.data;
  const budget: RecommendationBudget = { ...DEFAULT_BUDGET, ...(parsed.data.budget ?? {}) };
  const admittedCandidateCount = Math.min(qdrantHits.length, budget.maxCandidates);

  const recommendationPlan = selectRecommendationLanes(
    budget,
    defaultLaneEstimates({
      queryKind: queryKind ?? 'unknown',
      requiresExactEvidence,
      structuredTarget,
      candidateCount: admittedCandidateCount,
      availableGpuBytes: budget.maxGpuBytes,
      requestedGraphHops,
      toolArgs,
    }),
  );

  if (!recommendationPlan.admissible) {
    return json({
      error: {
        code: 'recommendation_budget_insufficient',
        message: 'Required recommendation evidence exceeds the supplied resource envelope',
        blocked: recommendationPlan.blockingReasons,
      },
      recommendationPlan,
    }, { status: 422 });
  }

  const plannedLanes = new Set(recommendationPlan.selected);
  const consumedEvidenceLanes = new Set(
    recommendationPlan.selected.filter((lane) => RERANK_CONSUMABLE_LANES.has(lane)),
  );
  const downstreamRequiredLanes = recommendationPlan.selected.filter(
    (lane) => !RERANK_CONSUMABLE_LANES.has(lane),
  );

  const t0 = Date.now();
  let enrichedHits: QdrantHit[] = qdrantHits.slice(0, admittedCandidateCount) as QdrantHit[];

  // Hyperedge cache enrichment is paid only when the hypergraph lane was admitted.
  if (consumedEvidenceLanes.has('hypergraph')) {
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const needsEnrich = enrichedHits.filter((h) => h.payload?.hyperedgeWeight == null);
      if (needsEnrich.length) {
        const keys = needsEnrich.map((h) => `hg:edge:chunk:${h.chunkId}`);
        const raws = await redis.mget(...keys).catch(() => keys.map(() => null));
        const weightMap = new Map(
          needsEnrich.map((h, i) => [h.chunkId, raws[i] ? (JSON.parse(raws[i]!)?.weight ?? null) : null]),
        );
        enrichedHits = enrichedHits.map((h) =>
          h.payload?.hyperedgeWeight != null
            ? h
            : ({ ...h, payload: { ...h.payload, hyperedgeWeight: weightMap.get(h.chunkId) ?? null } } as QdrantHit),
        );
      }
    } catch { /* fail open: unobserved hypergraph signal stays absent */ }
  }

  if (consumedEvidenceLanes.has('hypersphere') || consumedEvidenceLanes.has('som')) {
    enrichedHits = enrichedHits.map((hit) => {
      const p = hit.payload;
      if (!p || p.manifold4_q?.length === 4 || !p.manifold4?.length) return hit;
      const q = toStandardizedBiasedQuaternion(p.manifold4 as [number, number, number, number]);
      return { ...hit, payload: { ...p, manifold4_q: q } };
    });
  }

  let effectiveQuerySom = querySom as QuerySom | undefined;
  let hmmBiasApplied = false;
  let hmmBiasSection: string | null = null;
  let hmmBiasMultiplier: [number, number, number, number] | null = null;

  if (
    consumedEvidenceLanes.has('hypersphere') &&
    hmm?.state && (hmm.confidence ?? 0) > 0 && querySom?.manifold4_q?.length === 4
  ) {
    const section = hmmStateToGlyphSection(hmm.state);
    const confidence = hmm.confidence!;
    const multiplier = hmmAxisMultiplierTuple(section, confidence);
    const q = querySom.manifold4_q as [number, number, number, number];
    const rawM4 = [q[1], q[2], q[3], q[0]] as [number, number, number, number];
    const biasedQ = biasedUnitQuaternionTuple(rawM4, multiplier);
    effectiveQuerySom = { ...querySom, manifold4_q: biasedQ };
    hmmBiasApplied = true;
    hmmBiasSection = section;
    hmmBiasMultiplier = multiplier;
  }

  // MLA is an executor inside the single semantic lane, not a second fusion vote.
  let mlaScoreByChunk: Map<string, number> | null = null;
  if (consumedEvidenceLanes.has('semantic') && queryEmbedding) {
    try {
      const mlaCandidates = enrichedHits.map((h) => ({
        stable_key: h.chunkId,
        pre_score: h.score,
        som_bmu_col: h.payload?.som_bmu_col,
        som_bmu_row: h.payload?.som_bmu_row,
      }));
      const mlaResults = await mlaFusionRerank(queryEmbedding, mlaCandidates, {
        somBmuCol: querySom?.col ?? undefined,
        somBmuRow: querySom?.row ?? undefined,
        oneBitPrefilter: mlaCandidates.length > 80 ? 64 : 0,
      });
      mlaScoreByChunk = new Map(mlaResults.map((r) => [r.stable_key, r.mla_score]));
    } catch { /* fail open to original Qdrant semantic score */ }
  }

  const results = rerankHits(enrichedHits, effectiveQuerySom, limit, {
    activeLanes: consumedEvidenceLanes,
    semanticScoreByChunk: mlaScoreByChunk ?? undefined,
  });

  const durationMs = Date.now() - t0;
  return json({
    results,
    recommendationPlan,
    downstreamRequiredLanes,
    retrievalTrace: {
      graphSort: {
        used: true,
        inputCount: qdrantHits.length,
        admittedInputCount: enrichedHits.length,
        truncatedByCandidateBudget: qdrantHits.length - enrichedHits.length,
        outputCount: results.length,
        durationMs,
        plannedLanes: [...plannedLanes],
        consumedEvidenceLanes: [...consumedEvidenceLanes],
        downstreamRequiredLanes,
        exactPromotionExecuted: false,
        querySomRow: querySom?.row ?? null,
        querySomCol: querySom?.col ?? null,
        mlaUsed: mlaScoreByChunk !== null,
        semanticVoteCount: 1,
        toolArgs: toolArgs ?? {},
        budget,
        hmmBias: {
          applied: hmmBiasApplied,
          section: hmmBiasSection,
          confidence: hmm?.confidence ?? null,
          multiplier: hmmBiasMultiplier,
        },
        query,
      },
    },
  });
};
