/**
 * codeintel-datastore.ts — ACE-facing normalized datastore for CodeIntel.
 *
 * All functions return stable shapes — never throw to callers.
 * Arrays are always arrays. Objects are always objects. Failures degrade gracefully.
 *
 * Consumers:
 *   - gemma4-codeintel.ts  (prompt builder + LLM caller)
 *   - /api/codeintel/ace   (HTTP route)
 *   - MCP tool codeintel.ace.context
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Canonical shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface AceClusterSummary {
  gpuCluster: number;
  summary: string | null;
  purpose: string | null;
  patterns: string[];
  warnings: string[];
  tags: string[];
  memberCount: number;
}

export interface AceChunkContext {
  chunkId: string;
  relativePath: string | null;
  kind: string | null;
  domain: string | null;
  language: string | null;
  extension: string | null;
  semanticTags: string[];
  summary: string | null;
  gpuCluster: number | null;
}

export interface AceHealthSummary {
  ok: boolean;
  chunkCount: number;
  clusterCount: number;
  embeddingCoverage: number | null;
}

export interface AceCodeIntelContext {
  query: string;
  repoId: string;
  clusterContext: AceClusterSummary[];
  chunkContext: AceChunkContext[];
  health: AceHealthSummary;
  degraded: boolean;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual fetchers
// ─────────────────────────────────────────────────────────────────────────────

export async function getClusterSummariesForAce(opts: {
  repoId?: string;
  clusterIds?: number[];
  limit?: number;
}): Promise<{ summaries: AceClusterSummary[]; error?: string }> {
  const repoId = opts.repoId ?? 'default';
  const limit  = Math.min(opts.limit ?? 20, 50);

  try {
    const rows = opts.clusterIds?.length
      ? await db.execute(sql`
          SELECT gpu_cluster, COALESCE(summary,'') AS summary,
                 COALESCE(purpose,'') AS purpose,
                 COALESCE(patterns,'{}') AS patterns,
                 COALESCE(warnings,'{}') AS warnings,
                 COALESCE(tags,'{}') AS tags,
                 COALESCE(member_count,0) AS member_count
          FROM cluster_summaries
          WHERE repo_id = ${repoId}
            AND gpu_cluster = ANY(${opts.clusterIds})
          ORDER BY gpu_cluster
          LIMIT ${limit}
        `)
      : await db.execute(sql`
          SELECT gpu_cluster, COALESCE(summary,'') AS summary,
                 COALESCE(purpose,'') AS purpose,
                 COALESCE(patterns,'{}') AS patterns,
                 COALESCE(warnings,'{}') AS warnings,
                 COALESCE(tags,'{}') AS tags,
                 COALESCE(member_count,0) AS member_count
          FROM cluster_summaries
          WHERE repo_id = ${repoId}
          ORDER BY gpu_cluster
          LIMIT ${limit}
        `);

    return {
      summaries: rows.rows.map((r: any) => ({
        gpuCluster: Number(r.gpu_cluster),
        summary:    r.summary   || null,
        purpose:    r.purpose   || null,
        patterns:   Array.isArray(r.patterns) ? r.patterns : [],
        warnings:   Array.isArray(r.warnings) ? r.warnings : [],
        tags:       Array.isArray(r.tags)     ? r.tags     : [],
        memberCount: Number(r.member_count),
      })),
    };
  } catch (e: any) {
    return { summaries: [], error: `cluster_summaries fetch failed` };
  }
}

export async function getClusterSummaryForAce(
  repoId: string,
  clusterId: number,
): Promise<{ cluster: AceClusterSummary | null; error?: string }> {
  try {
    const rows = await db.execute(sql`
      SELECT gpu_cluster, COALESCE(summary,'') AS summary,
             COALESCE(purpose,'') AS purpose,
             COALESCE(patterns,'{}') AS patterns,
             COALESCE(warnings,'{}') AS warnings,
             COALESCE(tags,'{}') AS tags,
             COALESCE(member_count,0) AS member_count
      FROM cluster_summaries
      WHERE repo_id = ${repoId} AND gpu_cluster = ${clusterId}
      LIMIT 1
    `);

    if (rows.rows.length === 0) return { cluster: null };
    const r = rows.rows[0] as any;

    return {
      cluster: {
        gpuCluster: Number(r.gpu_cluster),
        summary:    r.summary  || null,
        purpose:    r.purpose  || null,
        patterns:   Array.isArray(r.patterns) ? r.patterns : [],
        warnings:   Array.isArray(r.warnings) ? r.warnings : [],
        tags:       Array.isArray(r.tags)     ? r.tags     : [],
        memberCount: Number(r.member_count),
      },
    };
  } catch {
    return { cluster: null, error: `cluster ${clusterId} fetch failed` };
  }
}

export async function getChunkForAce(
  _repoId: string,
  chunkIdOrPath: string,
): Promise<{ chunk: AceChunkContext | null; error?: string }> {
  try {
    // Try by qdrant_id first, then by relative_path
    const rows = await db.execute(sql`
      SELECT qdrant_id, relative_path, kind, domain, language, extension,
             COALESCE(semantic_tags, '{}') AS semantic_tags,
             COALESCE(summary, '') AS summary,
             gpu_cluster
      FROM codebase_chunk_index
      WHERE qdrant_id = ${chunkIdOrPath}
         OR relative_path = ${chunkIdOrPath}
      LIMIT 1
    `);

    if (rows.rows.length === 0) return { chunk: null };
    const r = rows.rows[0] as any;

    return {
      chunk: {
        chunkId:      String(r.qdrant_id ?? ''),
        relativePath: r.relative_path   || null,
        kind:         r.kind            || null,
        domain:       r.domain          || null,
        language:     r.language        || null,
        extension:    r.extension       || null,
        semanticTags: Array.isArray(r.semantic_tags) ? r.semantic_tags : [],
        summary:      r.summary         || null,
        gpuCluster:   r.gpu_cluster != null ? Number(r.gpu_cluster) : null,
      },
    };
  } catch {
    return { chunk: null, error: `chunk fetch failed` };
  }
}

export async function getCodeIntelHealthForAce(): Promise<AceHealthSummary> {
  try {
    const [chunkStats, clusterStats] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) AS total,
               COUNT(summary) AS with_summary
        FROM codebase_chunk_index
      `),
      db.execute(sql`
        SELECT COUNT(*) AS total,
               COUNT(summary_embedding) AS with_embedding
        FROM cluster_summaries
      `),
    ]);

    const total   = Number((chunkStats.rows[0] as any)?.total ?? 0);
    const withSum = Number((chunkStats.rows[0] as any)?.with_summary ?? 0);
    const clusters = Number((clusterStats.rows[0] as any)?.total ?? 0);
    const withEmb  = Number((clusterStats.rows[0] as any)?.with_embedding ?? 0);

    return {
      ok:                true,
      chunkCount:        total,
      clusterCount:      clusters,
      embeddingCoverage: clusters > 0 ? Math.round((withEmb / clusters) * 100) / 100 : null,
    };
  } catch {
    return { ok: false, chunkCount: 0, clusterCount: 0, embeddingCoverage: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary assembly function
// ─────────────────────────────────────────────────────────────────────────────

export async function assembleAceContext(
  query: string,
  opts: {
    repoId?: string;
    clusterIds?: number[];
    chunkIds?: string[];
    limit?: number;
  } = {},
): Promise<AceCodeIntelContext> {
  const repoId = opts.repoId ?? 'default';
  const errors: string[] = [];
  let degraded = false;

  // Fetch all in parallel
  const [clustersResult, chunksResults, health] = await Promise.all([
    getClusterSummariesForAce({
      repoId,
      clusterIds: opts.clusterIds,
      limit: opts.limit ?? 20,
    }),
    opts.chunkIds?.length
      ? Promise.all(opts.chunkIds.map(id => getChunkForAce(repoId, id)))
      : Promise.resolve([]),
    getCodeIntelHealthForAce(),
  ]);

  if (clustersResult.error) {
    errors.push(clustersResult.error);
    degraded = true;
  }

  const chunkContext: AceChunkContext[] = [];
  for (const result of chunksResults as Awaited<ReturnType<typeof getChunkForAce>>[]) {
    if (result.error) {
      errors.push(result.error);
      degraded = true;
    }
    if (result.chunk) chunkContext.push(result.chunk);
  }

  if (!health.ok) degraded = true;

  return {
    query,
    repoId,
    clusterContext: clustersResult.summaries,
    chunkContext,
    health,
    degraded,
    errors,
  };
}
