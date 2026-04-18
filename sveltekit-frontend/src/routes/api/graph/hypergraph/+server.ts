/**
 * /api/graph/hypergraph
 *
 * GET  /api/graph/hypergraph          — stats (edge counts by grade, built_at)
 * POST /api/graph/hypergraph          — build full 4D hypergraph (GPU k-means + SOM + HGNN)
 * GET  /api/graph/hypergraph?grade=A  — top hyperedges filtered by grade (A/B/C/D)
 * POST /api/graph/hypergraph/address  — ACE contextual addressing (4D bounding region query)
 * DELETE /api/graph/hypergraph        — invalidate cache
 */

import { json }           from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  buildHypergraph4D,
  queryTopHyperedges,
  getHypergraphStats,
  invalidateHypergraph,
  addressHyperedges,
  type HyperEdgeGrade,
} from '$lib/server/graph/hypergraph-4d.js';

// ── Rate-limit: max 1 build per 5 minutes per user ────────────────────────────
const lastBuild = new Map<string, number>();
const BUILD_COOLDOWN_MS = 5 * 60 * 1000;

// ── GET ────────────────────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!(locals as { user?: unknown }).user) {
    return json({ stats: null, edges: [], error: 'Unauthorized' }, { status: 401 });
  }

  const grade = url.searchParams.get('grade') as HyperEdgeGrade | null;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10))) : 10;

  if (grade) {
    // Return top edges of a specific grade
    const edges = await queryTopHyperedges(grade, limit);
    return json({ edges, total: edges.length });
  }

  // Default: return stats
  const stats = await getHypergraphStats();
  return json({ stats });
};

// ── POST ───────────────────────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ locals, url }) => {
  if (!(locals as { user?: unknown }).user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (locals as { user?: { id?: string } }).user?.id ?? 'anon';

  // Address endpoint (contextual 4D query)
  if (url.pathname.endsWith('/address')) {
    return handleAddress(locals);
  }

  // Rate-limit build
  const now = Date.now();
  const last = lastBuild.get(userId) ?? 0;
  if (now - last < BUILD_COOLDOWN_MS) {
    const waitSec = Math.ceil((BUILD_COOLDOWN_MS - (now - last)) / 1000);
    return json({ error: `Rate-limited. Try again in ${waitSec}s.` }, { status: 429 });
  }
  lastBuild.set(userId, now);

  const result = await buildHypergraph4D();
  return json({ result });
};

// ── POST /api/graph/hypergraph/address ─────────────────────────────────────────
async function handleAddress(locals: App.Locals): Promise<Response> {
  // This endpoint is called by ACE context assembly — no auth enforced
  // since it's an internal server-to-server call from ace/context-assembler
  try {
    const edges = await addressHyperedges({ wMin: 0.55, limit: 5 });
    return json({ edges, total: edges.length });
  } catch (e) {
    return json({ edges: [], total: 0, error: String(e) });
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────
export const DELETE: RequestHandler = async ({ locals }) => {
  if (!(locals as { user?: unknown }).user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  await invalidateHypergraph();
  return json({ invalidated: true });
};
