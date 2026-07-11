/**
 * RRF Fusion Testing Endpoint
 *
 * POST /api/retrieval/rrf — Test the RRF fusion strategy independently
 *
 * Accepts multiple ranked candidate lists from different retrieval lanes and
 * returns a unified, re-ranked list using Reciprocal Rank Fusion (RRF) + weighted blending.
 *
 * This endpoint is primarily for evaluation and debugging. Production code should use
 * the unified orchestrator (/api/retrieval/unified or go-retrieval-facade).
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { fuseRetrievalLanes, type FusedCandidate } from '$lib/server/retrieval/rrf-fusion.js';
import { computeTopologyBlendSignal, buildCommunityAuthorityMap } from '$lib/server/retrieval/signal-normalizer.js';

/**
 * Request schema: Multiple ranked candidate lists from different retrieval lanes
 */
const RRFRequestSchema = z.object({
  lanes: z.record(
    z.string(),
    z.array(
      z.object({
        candidate_id: z.string(),
        rank: z.number().int().positive(),
        score: z.number().min(0).max(1),
        source_ref: z.string(),
        content_hash: z.string(),
        confidence: z.number().min(0).max(1).optional().default(0.5)
      })
    )
  ),
  config: z.object({
    strategy: z.enum(['rrf', 'weighted', 'hybrid']).optional().default('hybrid'),
    maxCandidates: z.number().int().positive().optional().default(50),
    includeProvenance: z.boolean().optional().default(true),
    normalize: z.boolean().optional().default(true)
  }).optional()
});

type RRFRequest = z.infer<typeof RRFRequestSchema>;

interface RRFResponse {
  candidates: Array<FusedCandidate & {
    contributions_detail?: Array<{
      lane_name: string;
      contribution: number;
      percentage: string;
    }>;
  }>;
  summary: {
    total_input_candidates: number;
    total_output_candidates: number;
    strategy_used: string;
    fusion_quality: {
      coverage: number;
      diversity: number;
      reranking_effect: number;
    };
  };
  timing: {
    fusion_ms: number;
    normalization_ms: number;
    total_ms: number;
  };
}

/**
 * POST handler: Accept lane results, perform RRF fusion, return unified ranking
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const startTime = Date.now();
    const body = await request.json();

    // Validate request
    const parsed = RRFRequestSchema.parse(body);
    const normStart = Date.now();

    // Convert to internal lane score format
    const laneResults = new Map<string, Array<{
      candidate_id: string;
      rank: number;
      score: number;
      source_ref: string;
      content_hash: string;
      confidence: number;
    }>>();

    for (const [laneName, candidates] of Object.entries(parsed.lanes)) {
      laneResults.set(laneName, candidates);
    }

    const normalizationMs = Date.now() - normStart;
    const fusionStart = Date.now();

    // Perform RRF fusion
    const fused = fuseRetrievalLanes(laneResults, parsed.config);
    const fusionMs = Date.now() - fusionStart;

    // Compute quality metrics
    const totalInputCandidates = Array.from(laneResults.values()).reduce(
      (sum, lane) => sum + lane.length,
      0
    );
    const coverage = fused.length / Math.max(totalInputCandidates, 1);

    // Diversity: measure how many different lanes contributed
    const lanesRepresented = new Set<string>();
    for (const candidate of fused) {
      for (const contrib of candidate.contributions) {
        lanesRepresented.add(contrib.lane_name);
      }
    }
    const diversity = lanesRepresented.size / laneResults.size;

    // Reranking effect: measure score redistribution
    const bestSingleLaneScores = Array.from(laneResults.values()).map(
      (lane) => lane[0]?.score ?? 0
    );
    const bestSingleLane = Math.max(...bestSingleLaneScores);
    const reRankingEffect = fused.length > 0
      ? (fused[0].weighted_score - bestSingleLane) / Math.max(bestSingleLane, 0.001)
      : 0;

    // Enrich response with contribution details
    const enrichedCandidates = fused.map((candidate) => ({
      ...candidate,
      contributions_detail: candidate.contributions.map((contrib) => ({
        lane_name: contrib.lane_name,
        contribution: contrib.rrf_score,
        percentage: ((contrib.rrf_score / candidate.rrf_score) * 100).toFixed(2)
      }))
    }));

    const response: RRFResponse = {
      candidates: enrichedCandidates,
      summary: {
        total_input_candidates: totalInputCandidates,
        total_output_candidates: fused.length,
        strategy_used: parsed.config?.strategy ?? 'hybrid',
        fusion_quality: {
          coverage: Math.round(coverage * 10000) / 10000,
          diversity: Math.round(diversity * 10000) / 10000,
          reranking_effect: Math.round(reRankingEffect * 10000) / 10000
        }
      },
      timing: {
        fusion_ms: fusionMs,
        normalization_ms: normalizationMs,
        total_ms: Date.now() - startTime
      }
    };

    return json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}`
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    return json(
      {
        error: message,
        candidates: [],
        summary: {
          total_input_candidates: 0,
          total_output_candidates: 0,
          strategy_used: 'unknown',
          fusion_quality: { coverage: 0, diversity: 0, reranking_effect: 0 }
        },
        timing: { fusion_ms: 0, normalization_ms: 0, total_ms: 0 }
      },
      { status: 400 }
    );
  }
};

/**
 * GET handler: Return schema documentation and example
 */
export const GET: RequestHandler = async () => {
  return json({
    description: 'RRF Fusion Testing Endpoint',
    method: 'POST',
    example_request: {
      lanes: {
        qdrant_dense: [
          {
            candidate_id: 'ace:packet:auth:001',
            rank: 1,
            score: 0.95,
            source_ref: 'src/lib/server/auth.ts',
            content_hash: 'sha256:...',
            confidence: 0.99
          }
        ],
        postgres_trigram: [
          {
            candidate_id: 'ace:packet:auth:002',
            rank: 1,
            score: 0.87,
            source_ref: 'src/lib/server/auth.ts',
            content_hash: 'sha256:...',
            confidence: 0.85
          }
        ]
      },
      config: {
        strategy: 'hybrid',
        maxCandidates: 50,
        includeProvenance: true,
        normalize: true
      }
    },
    example_response: {
      candidates: [
        {
          candidate_id: 'ace:packet:auth:001',
          source_ref: 'src/lib/server/auth.ts',
          content_hash: 'sha256:...',
          rrf_score: 1.12,
          weighted_score: 0.92,
          final_rank: 1,
          contributions: [
            {
              lane_name: 'qdrant_dense',
              rrf_score: 0.75,
              normalized_score: 0.95,
              weight: 0.35
            }
          ],
          improvement_vs_best: 2.3,
          winning_lane: 'qdrant_dense',
          landing_score: 0.95,
          contributions_detail: [
            {
              lane_name: 'qdrant_dense',
              contribution: 0.75,
              percentage: '67.00'
            }
          ]
        }
      ],
      summary: {
        total_input_candidates: 50,
        total_output_candidates: 20,
        strategy_used: 'hybrid',
        fusion_quality: {
          coverage: 0.4,
          diversity: 1.0,
          reranking_effect: 0.06
        }
      },
      timing: {
        fusion_ms: 45,
        normalization_ms: 5,
        total_ms: 52
      }
    }
  });
};
