import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  findPacketsForOpenCode,
  getPacketSOMCluster,
  getFeatureKMeansContext,
  getAllRecommendationsForOpenCode
} from '$lib/server/opencode-atlas-bridge.js';

/**
 * GET /api/opencode?query=...&file_path=...&limit=5
 *
 * Returns Parent Atlas packets with full contract response:
 * - Lineage chain (packet_key, feature_id, source_ref, qdrant_point_id, community_id, som_cluster)
 * - Provenance (source tier, latency, cache_hit, all attempted tiers, confidence score)
 * - 7-tier escalation: Redis → Qdrant → SOM → KMeans → Neo4j → Postgres → RG
 * - No placeholders ever returned; safe_next_action on NOT_FOUND
 */
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('query');
  const file_path = url.searchParams.get('file_path') || undefined;
  const feature_id = url.searchParams.get('feature_id') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 5); // Enforce 5-limit

  if (!query) {
    return error(400, 'query parameter required');
  }

  try {
    const response = await findPacketsForOpenCode({
      query,
      file_path,
      feature_id,
      limit
    });

    // Return full contract response with provenance
    return json({
      ok: response.ok,
      status: response.status,
      query,
      results: response.data,
      count: response.data.length,
      limit_enforced: response.data.length <= 5,
      lineage: response.lineage,
      provenance: response.provenance,
      safe_next_action: response.safe_next_action,
      error: response.error,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // Degrade gracefully with contract structure
    return json({
      ok: false,
      status: 'DEGRADED',
      query,
      results: [],
      count: 0,
      limit_enforced: true,
      lineage: [],
      provenance: {
        source: 'not_found',
        query_time_ms: 0,
        cache_hit: false,
        retrieval_attempts: [],
        confidence: 0.0
      },
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * POST /api/opencode
 *
 * Body:
 * {
 *   "action": "find" | "som-cluster" | "kmeans-context" | "all-recommendations",
 *   "packet_key": "...",
 *   "feature_id": "...",
 *   "query": "...",
 *   "limit": 5
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
  if (request.headers.get('content-type') !== 'application/json') {
    return error(400, 'Content-Type must be application/json');
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch (err) {
    return error(400, 'Invalid JSON');
  }

  const { action, packet_key, feature_id, query, limit = 5 } = body;

  try {
    switch (action) {
      case 'find':
        if (!query) return error(400, 'query required for find action');
        const results = await findPacketsForOpenCode({
          query,
          limit: Math.min(limit, 5)
        });
        return json({ ok: true, action, results });

      case 'som-cluster':
        if (!packet_key) return error(400, 'packet_key required');
        const somCluster = await getPacketSOMCluster(packet_key);
        return json({ ok: true, action, result: somCluster });

      case 'kmeans-context':
        if (!feature_id) return error(400, 'feature_id required');
        const kmeansCtx = await getFeatureKMeansContext(feature_id);
        return json({ ok: true, action, result: kmeansCtx });

      case 'all-recommendations':
        const allRecsResponse = await getAllRecommendationsForOpenCode(Math.min(limit, 5));
        return json({
          ok: allRecsResponse.ok,
          action,
          status: allRecsResponse.status,
          results: allRecsResponse.data,
          lineage: allRecsResponse.lineage,
          provenance: allRecsResponse.provenance,
          error: allRecsResponse.error
        });

      default:
        return error(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    // Degrade gracefully with contract structure
    return json(
      {
        ok: false,
        action,
        status: 'DEGRADED',
        error: err instanceof Error ? err.message : 'Unknown error',
        results: [],
        lineage: [],
        provenance: {
          source: 'not_found',
          query_time_ms: 0,
          cache_hit: false,
          retrieval_attempts: [],
          confidence: 0.0
        }
      },
      { status: 200 }
    );
  }
};
