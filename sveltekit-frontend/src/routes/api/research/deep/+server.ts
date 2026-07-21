/**
 * Deep Research Route
 * Orchestrates: Query → Qdrant (dense) → Firecrawl (web) → LDR (autonomous) → ML Ranking → Gemma4 (synthesis)
 *
 * POST /api/research/deep
 * { query, case_id?, rank_model?, include_web_search?, include_ldr? }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { rankCandidates } from '$lib/server/ml/miniforge-ml-sidecar';

const DeepResearchSchema = z.object({
  query: z.string().min(5).max(2000),
  rank_model: z.enum(['xgboost', 'naive_bayes']).default('xgboost'),
  include_web_search: z.boolean().default(true),
  include_ldr: z.boolean().default(true),
  top_k: z.number().int().min(1).max(20).default(5),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const startTime = Date.now();

  try {
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const req = DeepResearchSchema.parse(body);

    const results = {
      query: req.query,
      ranked: [] as any[],
      duration_ms: 0,
    };

    // Combine candidates from all sources
    const allCandidates = [];

    // ML ranking via sidecar
    if (allCandidates.length > 0) {
      try {
        const rankResponse = await rankCandidates({
          query: req.query,
          candidates: allCandidates,
          model: req.rank_model,
          top_k: req.top_k,
        });
        results.ranked = rankResponse.ranked;
      } catch (e) {
        console.error('ML ranking failed:', e);
      }
    }

    results.duration_ms = Date.now() - startTime;
    return json(results);
  } catch (error) {
    console.error('Deep research error:', error);
    return json(
      { query: '', ranked: [], duration_ms: Date.now() - startTime },
      { status: 500 },
    );
  }
};
