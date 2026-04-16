import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

/**
 * Phase 109: KAG (Knowledge-Augmented Generation) API
 *
 * GET  /api/phase109/kag          — service stats + Neo4j availability
 * POST /api/phase109/kag          — traverse error graph, identify root cause, augment strategies
 */

const traverseSchema = z.object({
	errorId: z.string().min(1),
	action: z.enum(['root-cause', 'similar', 'traverse', 'stats']).default('root-cause'),
});

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { getKAGTraverser } = await import('$lib/services/error-analysis/KAGTraverser.js');
    const kag = getKAGTraverser();
    await kag.waitForInit();
    const stats = kag.getStats();
    return json({ stats, ready: kag.isAvailable() });
  } catch (err) {
    console.error('[phase109/kag] GET error:', err);
    return json({
      stats: null,
      ready: false,
      message: 'KAG service unavailable',
    });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = traverseSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { errorId, action } = parsed.data;

  try {
    const { getKAGTraverser } = await import('$lib/services/error-analysis/KAGTraverser.js');
    const kag = getKAGTraverser();
    await kag.waitForInit();

    if (!kag.isAvailable()) {
      // Graceful degraded response - Neo4j not running
      return json({
        degraded: true,
        message: 'Neo4j not available — KAG operating in degraded mode',
        errorId,
        action,
        result: null,
      });
    }

    switch (action) {
      case 'root-cause': {
        const result = await kag.deepRootCauseAnalysis(errorId);
        return json({ action, errorId, result });
      }
      case 'similar': {
        const similar = await kag.findSimilarErrors(errorId, 10);
        return json({ action, errorId, result: similar });
      }
      case 'traverse': {
        const paths = await kag.traverseErrorGraph(errorId);
        return json({ action, errorId, result: paths });
      }
      case 'stats': {
        const stats = kag.getStats();
        return json({ action, errorId: null, result: stats });
      }
      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[phase109/kag] Error:', err);
    return json({ error: 'KAG traversal failed' }, { status: 500 });
  }
};
