/**
 * GET /api/graph/cluster-summaries
 *
 * Returns the joined cluster_summaries × code_llm_index list as readable JSON,
 * matching the shape produced by scripts/export-cluster-summaries.mjs:
 *
 *   {
 *     generatedAt, repoId, clusterCount, totalMembers, totalLlmHits,
 *     clusters: [{
 *       clusterId, summary, purpose, patterns, warnings, tags,
 *       bowTerms, representativePaths,
 *       memberCount, llmPathCount, llmTotalHits,
 *       centroidDistanceMean, summaryModel, hasEmbedding,
 *       metadata, createdAt, updatedAt,
 *     }]
 *   }
 *
 * Query params:
 *   ?repo=<id>     Filter by repo_id (default: 'default')
 *   ?top=<n>       Limit to top-N by member_count
 *   ?cluster=<id>  Return a single cluster (404 if missing)
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { db }    from '$lib/server/db/client';
import { sql }   from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

interface ClusterRow {
  cluster_id:               number;
  summary:                  string;
  purpose:                  string | null;
  patterns:                 string[] | null;
  warnings:                 string[] | null;
  member_count:             number;
  tags:                     string[] | null;
  centroid_distance_mean:   number | null;
  summary_model:            string | null;
  has_embedding:            boolean;
  metadata:                 Record<string, unknown>;
  created_at:               Date;
  updated_at:               Date;
  llm_path_count:           number;
  llm_total_hits:           number;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const repo    = url.searchParams.get('repo') ?? 'default';
  const top     = Number(url.searchParams.get('top') ?? '0') || 0;
  const single  = url.searchParams.get('cluster');
  const singleId = single !== null ? Number(single) : null;

  let rowsRaw;
  try {
    if (singleId !== null && Number.isFinite(singleId)) {
      rowsRaw = await db.execute(sql`
        SELECT
          cs.gpu_cluster                            AS cluster_id,
          cs.summary, cs.purpose, cs.patterns, cs.warnings, cs.member_count, cs.tags,
          cs.centroid_distance_mean, cs.summary_model,
          (cs.summary_embedding IS NOT NULL)        AS has_embedding,
          cs.metadata, cs.created_at, cs.updated_at,
          COALESCE(li.path_count, 0)                AS llm_path_count,
          COALESCE(li.total_hits, 0)                AS llm_total_hits
        FROM cluster_summaries cs
        LEFT JOIN (
          SELECT glyph_cluster_id, COUNT(*) AS path_count, SUM(hit_count) AS total_hits
          FROM code_llm_index WHERE glyph_cluster_id IS NOT NULL
          GROUP BY glyph_cluster_id
        ) li ON li.glyph_cluster_id = cs.gpu_cluster
        WHERE cs.repo_id = ${repo} AND cs.gpu_cluster = ${singleId}
        LIMIT 1
      `);
    } else {
      rowsRaw = await db.execute(sql`
        SELECT
          cs.gpu_cluster                            AS cluster_id,
          cs.summary, cs.purpose, cs.patterns, cs.warnings, cs.member_count, cs.tags,
          cs.centroid_distance_mean, cs.summary_model,
          (cs.summary_embedding IS NOT NULL)        AS has_embedding,
          cs.metadata, cs.created_at, cs.updated_at,
          COALESCE(li.path_count, 0)                AS llm_path_count,
          COALESCE(li.total_hits, 0)                AS llm_total_hits
        FROM cluster_summaries cs
        LEFT JOIN (
          SELECT glyph_cluster_id, COUNT(*) AS path_count, SUM(hit_count) AS total_hits
          FROM code_llm_index WHERE glyph_cluster_id IS NOT NULL
          GROUP BY glyph_cluster_id
        ) li ON li.glyph_cluster_id = cs.gpu_cluster
        WHERE cs.repo_id = ${repo}
        ORDER BY cs.member_count DESC
        ${top > 0 ? sql`LIMIT ${top}` : sql``}
      `);
    }
  } catch (e) {
    return json({ error: (e as Error).message, clusters: [], clusterCount: 0 }, { status: 200 });
  }

  const rows = (rowsRaw as unknown as { rows: ClusterRow[] }).rows ?? [];
  if (singleId !== null && rows.length === 0) {
    return json({ error: 'Cluster not found' }, { status: 404 });
  }

  const redis = getRedis();
  const enriched = await Promise.all(rows.map(async (r) => {
    let bowTerms: string[] = [];
    let paths:    string[] = [];
    try {
      const tile = await redis.get(`texture:bow:cluster:${r.cluster_id}`);
      if (tile) {
        const parsed = JSON.parse(tile);
        bowTerms = Array.isArray(parsed.terms) ? parsed.terms.slice(0, 12) : [];
      }
    } catch { /* non-fatal */ }
    try {
      const pathRes = await db.execute(sql`
        SELECT path FROM code_llm_index
         WHERE glyph_cluster_id = ${r.cluster_id}
         ORDER BY hit_count DESC, refreshed_at DESC LIMIT 5
      `);
      paths = ((pathRes as unknown as { rows: { path: string }[] }).rows ?? []).map((p) => p.path);
    } catch { /* non-fatal */ }

    return {
      clusterId:            r.cluster_id,
      summary:              r.summary,
      purpose:              r.purpose,
      patterns:             r.patterns ?? [],
      warnings:             r.warnings ?? [],
      tags:                 r.tags ?? [],
      bowTerms,
      representativePaths:  paths,
      memberCount:          r.member_count,
      llmPathCount:         Number(r.llm_path_count),
      llmTotalHits:         Number(r.llm_total_hits),
      centroidDistanceMean: r.centroid_distance_mean,
      summaryModel:         r.summary_model,
      hasEmbedding:         r.has_embedding,
      metadata:             r.metadata,
      createdAt:            r.created_at,
      updatedAt:            r.updated_at,
    };
  }));

  if (singleId !== null) return json({ cluster: enriched[0] });

  return json({
    generatedAt:  new Date().toISOString(),
    repoId:       repo,
    clusterCount: enriched.length,
    totalMembers: enriched.reduce((s, c) => s + (c.memberCount ?? 0), 0),
    totalLlmHits: enriched.reduce((s, c) => s + c.llmTotalHits, 0),
    clusters:     enriched,
  });
};
