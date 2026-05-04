/**
 * POST /api/graph/hypergraph/address
 *
 * ACE contextual addressing — query hyperedges within a 4D bounding region.
 *
 * Body (all optional):
 *   xRange  [x_min, x_max]  — SOM grid x window
 *   yRange  [y_min, y_max]  — SOM grid y window
 *   zMax    number          — max semantic depth (0=at centroid, 1=far from centroid)
 *   wMin    number          — min GRPO reward score (default 0.55 = Grade B+)
 *   limit   number          — max edges to return (default 5)
 *
 * Used by ACE context assembly and search-intelligence to inject grade-A/B
 * hyperedge summaries as structured research context into the system prompt.
 */

import { json }                from '@sveltejs/kit';
import { z }                   from 'zod';
import type { RequestHandler } from './$types';
import { addressHyperedges }   from '$lib/server/graph/hypergraph-4d.js';

const RangePair = z.array(z.number()).length(2).transform(a => [a[0], a[1]] as [number, number]);

const AddressSchema = z.object({
  xRange: RangePair.optional(),
  yRange: RangePair.optional(),
  zMax:   z.number().min(0).max(1).optional(),
  wMin:   z.number().min(0).max(1).optional(),
  limit:  z.number().int().min(1).max(20).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  // Internal endpoint, but still HTTP-exposed — require auth (defense in depth).
  // ACE server-internal calls already pass through locals.user via DEV_BYPASS_AUTH/session.
  if (!locals.user) return json({ edges: [], error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }

  const parsed = AddressSchema.safeParse(body);
  const opts = parsed.success ? { wMin: 0.55, limit: 5, ...parsed.data } : { wMin: 0.55, limit: 5 };

  const edges = await addressHyperedges(opts);
  return json({ edges, total: edges.length });
};
