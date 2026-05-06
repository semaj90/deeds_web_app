/**
 * Manifold4-bounded retrieval — 4D Euclidean neighborhood search over
 * codebase_chunk_index.manifold4 [som_x, som_y, semantic_z, grpo_w].
 *
 * The four dimensions encode orthogonal structure:
 *   som_x / som_y  — SOM grid position (topology / neighbourhood)
 *   semantic_z     — mean-pooled embedding centroid projection (semantics)
 *   grpo_w         — GRPO reward weight (retrieval quality / RL signal)
 *
 * SQL uses Euclidean distance on the real[] column — no pgvector extension
 * required.  The query is fast on 100K rows with a GIN index on manifold4
 * (or a partial B-tree on somCluster + gpuCluster that narrows the scan).
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Manifold4Point = [number, number, number, number];

export interface Manifold4SearchOptions {
  /** Center of the search sphere in 4D manifold space */
  center: Manifold4Point;
  /** Euclidean radius (default: 0.25) */
  radius?: number;
  /** Max rows returned (default: 30) */
  limit?: number;
  /** Optionally narrow to a specific SOM cluster */
  somCluster?: number;
  /** Optionally require all of these semantic tags */
  tags?: string[];
  /** Min manifold score threshold 0–1 (default: 0) */
  minScore?: number;
}

export interface Manifold4Hit {
  id: string;
  relativePath: string;
  chunkIndex: number | null;
  symbol: string | null;
  kind: string | null;
  content: string | null;
  signature: string | null;
  semanticTags: string[];
  somCluster: number | null;
  gpuCluster: number | null;
  somBmuRow: number | null;
  somBmuCol: number | null;
  pageRankScore: number | null;
  manifold4: Manifold4Point | null;
  /** 1 / (1 + manifold_distance) — higher = closer to center */
  manifoldScore: number;
  manifoldDistance: number;
}

export interface Manifold4SearchResult {
  hits: Manifold4Hit[];
  center: Manifold4Point;
  radius: number;
  totalFound: number;
  durationMs: number;
}

// ── Core search ───────────────────────────────────────────────────────────────

/**
 * Search codebase_chunk_index within a 4D Euclidean ball around `center`.
 * Returns rows ordered by proximity (closest first).
 */
export async function searchManifold4(
  opts: Manifold4SearchOptions,
): Promise<Manifold4SearchResult> {
  const t0 = Date.now();
  const { center, radius = 0.25, limit = 30, somCluster, tags, minScore = 0 } = opts;
  const [x, y, z, w] = center;

  try {
    // Build WHERE clauses dynamically
    const whereParts: string[] = [
      `manifold4 IS NOT NULL`,
      `array_length(manifold4, 1) = 4`,
      `(
        power(manifold4[1] - ${x}, 2) +
        power(manifold4[2] - ${y}, 2) +
        power(manifold4[3] - ${z}, 2) +
        power(manifold4[4] - ${w}, 2)
      ) <= ${radius * radius}`,
    ];

    if (somCluster != null) whereParts.push(`som_cluster = ${somCluster}`);
    if (tags?.length) {
      // Each tag must appear in semantic_tags array
      for (const tag of tags) {
        whereParts.push(`$${JSON.stringify(tag)} = ANY(semantic_tags)`);
      }
    }

    const whereClause = whereParts.join('\n  AND ');

    const rows = await db.execute(sql.raw(`
      SELECT
        id,
        relative_path,
        line_start         AS chunk_index,
        symbol,
        kind,
        content,
        summary            AS signature,
        semantic_tags,
        som_cluster,
        gpu_cluster,
        som_bmu_row,
        som_bmu_col,
        page_rank_score,
        manifold4,
        sqrt(
          power(manifold4[1] - ${x}, 2) +
          power(manifold4[2] - ${y}, 2) +
          power(manifold4[3] - ${z}, 2) +
          power(manifold4[4] - ${w}, 2)
        ) AS manifold_distance
      FROM codebase_chunk_index
      WHERE ${whereClause}
      ORDER BY manifold_distance ASC
      LIMIT ${limit}
    `));

    const hits: Manifold4Hit[] = (rows.rows as Record<string, unknown>[])
      .map((r) => {
        const dist = Number(r.manifold_distance ?? 0);
        const score = 1 / (1 + dist);
        if (score < minScore) return null;
        const m4 = Array.isArray(r.manifold4) ? (r.manifold4 as number[]) : null;
        return {
          id: String(r.id),
          relativePath: String(r.relative_path ?? ''),
          chunkIndex: r.chunk_index != null ? Number(r.chunk_index) : null,
          symbol: r.symbol != null ? String(r.symbol) : null,
          kind: r.kind != null ? String(r.kind) : null,
          content: r.content != null ? String(r.content) : null,
          signature: r.signature != null ? String(r.signature) : null,
          semanticTags: Array.isArray(r.semantic_tags) ? (r.semantic_tags as string[]) : [],
          somCluster: r.som_cluster != null ? Number(r.som_cluster) : null,
          gpuCluster: r.gpu_cluster != null ? Number(r.gpu_cluster) : null,
          somBmuRow: r.som_bmu_row != null ? Number(r.som_bmu_row) : null,
          somBmuCol: r.som_bmu_col != null ? Number(r.som_bmu_col) : null,
          pageRankScore: r.page_rank_score != null ? Number(r.page_rank_score) : null,
          manifold4: m4?.length === 4 ? (m4 as Manifold4Point) : null,
          manifoldScore: score,
          manifoldDistance: dist,
        } satisfies Manifold4Hit;
      })
      .filter((h): h is Manifold4Hit => h !== null);

    return { hits, center, radius, totalFound: hits.length, durationMs: Date.now() - t0 };
  } catch {
    return { hits: [], center, radius, totalFound: 0, durationMs: Date.now() - t0 };
  }
}

// ── Centroid helper ───────────────────────────────────────────────────────────

/**
 * Compute the manifold4 centroid of a set of chunks (mean over non-null rows).
 * Used to project an existing Qdrant hit-list into manifold space before
 * expanding to nearby neighbors.
 */
export function computeManifold4Centroid(
  points: Array<Manifold4Point | null | undefined>,
): Manifold4Point | null {
  const valid = points.filter((p): p is Manifold4Point => p?.length === 4);
  if (!valid.length) return null;
  const sum = valid.reduce<[number, number, number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2], acc[3] + p[3]],
    [0, 0, 0, 0],
  );
  const n = valid.length;
  return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n];
}

// ── Score combiner ────────────────────────────────────────────────────────────

/**
 * Combine a base vector score (0–1) with a manifold4 proximity score (0–1).
 *
 * Weights derived from the ACE scoring spine (CLAUDE.md):
 *   vector_score × 0.22 + manifold_score × 0.16 + ...
 *
 * This function only handles the manifold4 contribution.  The caller is
 * responsible for the remaining terms.
 *
 * @param vectorScore  Cosine similarity from Qdrant (0–1)
 * @param manifoldDist Euclidean distance in 4D space
 * @returns Combined score blending vector + manifold signals
 */
export function blendManifoldScore(vectorScore: number, manifoldDist: number): number {
  const manifoldScore = 1 / (1 + manifoldDist);
  return vectorScore * 0.22 + manifoldScore * 0.16;
}
