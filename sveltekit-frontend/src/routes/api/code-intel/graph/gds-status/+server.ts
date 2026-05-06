/**
 * GET  /api/code-intel/graph/gds-status
 *   Returns APOC + GDS availability, projection existence, plugin versions.
 *
 * POST /api/code-intel/graph/gds-status
 *   Body: { action: 'project' | 'pagerank' | 'louvain' | 'knn' | 'authority' | 'ontology' | 'full' }
 *   Runs the requested GDS job.
 *   'full' = project → pagerank → louvain → knn → authority → ontology.
 *   Rate-limited to 1 full run per 5 min per user.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';
import {
  getGdsStatus,
  ensureGdsProjection,
  runPageRankMutate,
  runLouvainMutate,
  runKnnMutate,
  writeAuthorityScoresToQdrant,
  seedAndClassifyOntology,
} from '$lib/server/graph/neo4j-gds.js';

const RATE_LIMIT_KEY = (userId: string) => `gds:rebuild:rl:${userId}`;
const RATE_LIMIT_TTL = 300; // 5 min

const VALID_ACTIONS = ['project', 'pagerank', 'louvain', 'knn', 'authority', 'ontology', 'full'] as const;
type GdsAction = typeof VALID_ACTIONS[number];

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ apocAvailable: false, gdsAvailable: false, projectionExists: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const status = await getGdsStatus();
    return json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ apocAvailable: false, gdsAvailable: false, projectionExists: false, error: msg });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { action?: string };
  const action = (body.action ?? 'full') as GdsAction;

  if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
    return json({ error: `action must be ${VALID_ACTIONS.join(' | ')}` }, { status: 400 });
  }

  // Rate limit full rebuilds
  if (action === 'full') {
    const redis = getRedis();
    const key = RATE_LIMIT_KEY(locals.user.id ?? locals.user.email ?? 'anon');
    const existing = await redis.get(key).catch(() => null);
    if (existing) {
      return json({ error: 'Rate limited — wait 5 minutes between full GDS rebuilds' }, { status: 429 });
    }
    await redis.setex(key, RATE_LIMIT_TTL, '1').catch(() => {});
  }

  const t0 = Date.now();
  const result: Record<string, unknown> = { action };

  try {
    if (action === 'project' || action === 'full') {
      result.projection = await ensureGdsProjection(action === 'full');
    }
    if (action === 'pagerank' || action === 'full') {
      result.pagerank = await runPageRankMutate();
    }
    if (action === 'louvain' || action === 'full') {
      result.louvain = await runLouvainMutate();
    }
    if (action === 'knn' || action === 'full') {
      result.knn = await runKnnMutate();
    }
    if (action === 'authority' || action === 'full') {
      result.authority = await writeAuthorityScoresToQdrant();
    }
    if (action === 'ontology' || action === 'full') {
      result.ontology = await seedAndClassifyOntology();
    }
    result.totalMs = Date.now() - t0;
    return json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gds-status] action failed:', msg);
    return json({ error: msg, action, totalMs: Date.now() - t0 });
  }
};
