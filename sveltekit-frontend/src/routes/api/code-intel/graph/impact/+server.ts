/**
 * GET /api/code-intel/graph/impact?stableKey=<key>&depth=3&limit=250&categorize=true
 *
 * Expands up to `depth` hops from the given stableKey using APOC
 * apoc.path.expandConfig (relationship filter: IMPORTS|CONTAINS|BELONGS_TO_CLUSTER|
 * REFERENCES|EVIDENCE_FOR|DOCUMENTS|CONSULTED).  Falls back to plain Cypher if
 * APOC is not installed.
 *
 * When categorize=true (default), returns:
 *   { stableKey, impacted: { routes, tests, clusters, wikiNotes, researchNotes, files }, paths }
 *
 * When categorize=false, returns legacy flat shape:
 *   { stableKey, affected, totalCount, durationMs }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getImpactNeighborhood, getImpactCategorized } from '$lib/server/graph/neo4j-gds.js';

const DEGRADED_CAT = {
  stableKey: '', impacted: { routes: [], tests: [], clusters: [], wikiNotes: [], researchNotes: [], files: [] },
  paths: [], totalCount: 0, durationMs: 0, apocUsed: false,
};
const DEGRADED_FLAT = { stableKey: '', affected: [], totalCount: 0, durationMs: 0 };

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ ...DEGRADED_CAT, error: 'Unauthorized' }, { status: 401 });

  const stableKey = url.searchParams.get('stableKey')?.trim();
  if (!stableKey) return json({ ...DEGRADED_CAT, error: 'stableKey required' }, { status: 400 });

  const depth      = Math.min(5, Math.max(1, parseInt(url.searchParams.get('depth') ?? '3') || 3));
  const limit      = Math.min(250, Math.max(1, parseInt(url.searchParams.get('limit') ?? '250') || 250));
  const categorize = url.searchParams.get('categorize') !== 'false';

  try {
    if (categorize) {
      const result = await getImpactCategorized(stableKey, depth, limit);
      return json(result);
    } else {
      const result = await getImpactNeighborhood(stableKey, depth, limit);
      return json(result);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[graph/impact] error:', msg);
    return json(categorize
      ? { ...DEGRADED_CAT, stableKey, error: msg }
      : { ...DEGRADED_FLAT, stableKey, error: msg });
  }
};
