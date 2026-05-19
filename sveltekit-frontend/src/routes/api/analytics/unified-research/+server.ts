/**
 * POST /api/analytics/unified-research
 *   Execute unified research query across all analytics sources.
 *   Body: { query?, pipeline?, domains?, depth?, days?, includeWeb?, includeCodebase?, includeMatrix?, rebuild? }
 *   Returns: UnifiedResearchResult
 *
 * GET /api/analytics/unified-research
 *   Quick aggregations only (no Ollama, instant).
 *   Params: days? (default 7), pipeline? (default 'all')
 *   Returns: { aggregations, meta }
 *
 * DELETE /api/analytics/unified-research
 *   Invalidate cached results for current user.
 *   Returns: { cleared: number }
 *
 * Auth: requires locals.user.id
 */
import { json }            from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z }               from 'zod';
import {
  executeUnifiedResearch,
  invalidateUnifiedResearchCache,
  getUnifiedAggregations,
} from '$lib/server/analytics/unified-research-query.js';

// ── Schema ─────────────────────────────────────────────────────────────────────

const postSchema = z.object({
  query:            z.string().max(500).optional(),
  pipeline:         z.enum(['ace', 'rag', 'kag', 'dag', 'codebase', 'all']).default('all'),
  domains:          z.array(z.string().max(50)).max(5).default([]),
  depth:            z.number().int().min(1).max(5).default(3),
  days:             z.number().int().min(1).max(30).default(7),
  includeWeb:       z.boolean().default(false),
  includeCodebase:  z.boolean().default(true),
  includeMatrix:    z.boolean().default(true),
  rebuild:          z.boolean().default(false),
});

// ── GET — aggregations only ────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) {
    return json({
      aggregations: { pipelineStats: [], scoreBuckets: [], bucketLabels: [] },
      meta: { days: 7 },
    });
  }

  const days = Math.min(parseInt(url.searchParams.get('days') ?? '7') || 7, 30);

  try {
    const aggregations = await getUnifiedAggregations(days);
    return json({ aggregations, meta: { days, userId: Number(locals.user.id) } });
  } catch {
    return json({
      aggregations: { pipelineStats: [], scoreBuckets: [], bucketLabels: [] },
      meta: { days },
    });
  }
};

// ── POST — full unified research query ────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw    = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  try {
    const result = await executeUnifiedResearch(locals.user.id, parsed.data);
    return json(result);
  } catch (err) {
    console.error('[unified-research] Error:', err);
    return json({
      researchIndex:    null,
      matrixAnalysis:   null,
      codebaseInsights: null,
      webInsights:      null,
      deepResearch:     null,
      fetchedPage:      null,
      aggregations:     { pipelineStats: [], scoreBuckets: [] },
      unifiedTopics:    [],
      selfPromptChain:  [],
      langGraphState:   { messages: [], next: 'FINISH', step: 0, totalSteps: 5, supervisor: { decision: 'error', confidence: 0, nextAgent: 'FINISH' }, accumulated: { topics: [], selfPrompts: [], pipelineHints: [] } },
      meta: { userId: Number(locals.user.id), query: raw.query ?? '', pipeline: 'all', sources: [], computeMs: 0, cachedUntil: new Date().toISOString() },
    });
  }
};

// ── DELETE — invalidate cache ──────────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const cleared = await invalidateUnifiedResearchCache(locals.user.id);
  return json({ cleared });
};
