/**
 * GET  /api/codebase-index/tags
 *
 * Faceted tag browser for codebase_chunks_768.
 *
 * Returns:
 *   - `tags`         — all unique tag values + counts (top 200)
 *   - `kinds`        — chunk kind distribution (route, component, util…)
 *   - `routeTypes`   — neo4j_routeType distribution
 *   - `auditFlags`   — counts for auth/zod/cache/sse/worker guard flags
 *   - `clusters`     — gpu cluster distribution from neo4j_gpuCluster
 *   - `totalChunks`  — total points scrolled
 *
 * Query params:
 *   ?limit=<n>   — max points to scroll (default 20000, hard cap 50000)
 *   ?kind=<k>    — filter by chunk kind before aggregating
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DELETE /api/codebase-index/tags
 *
 * Removes a tag from every chunk in codebase_chunks_768 that carries it.
 * Scrolls with a Qdrant filter on the tag value, then strips it from the
 * `tags` array (or clears the field when it is the only tag) for each point.
 *
 * Body: { tag: string }
 *
 * Response: { success, tag, removed }
 *   - `removed` — number of Qdrant points that had the tag stripped
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { ENV } from '$lib/server/env.server.js';

const COLLECTION = 'codebase_chunks_768';
const QDRANT_URL  = ENV.QDRANT_URL;

const querySchema = z.object({
  limit: z.coerce.number().int().min(100).max(50_000).optional().default(20_000),
  kind:  z.string().optional(),
});

// ── Payload shape we care about ───────────────────────────────────────────────

interface ChunkPayload {
  tags?:                  string | string[];
  kind?:                  string;
  relativePath?:          string;
  neo4j_routeType?:       string;
  neo4j_gpuCluster?:      number;
  neo4j_hasAuthGuard?:    boolean;
  neo4j_hasZodValidation?: boolean;
  neo4j_hasCachePattern?: boolean;
  neo4j_isSseEndpoint?:   boolean;
  neo4j_isWorkerBoundary?: boolean;
  neo4j_hasErrorHandling?: boolean;
  neo4j_complexity?:      number;
  neo4j_pageRankScore?:   number;
  [key: string]: unknown;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const { limit, kind } = params.success ? params.data : { limit: 20_000, kind: undefined };

  try {
    // ── 1. Scroll Qdrant ──────────────────────────────────────────────────────
    const payloads: ChunkPayload[] = [];
    let offset: string | number | null = null;
    let fetched = 0;
    const PAGE_SIZE = 1_000;

    while (fetched < (limit ?? 20_000)) {
      const body: Record<string, unknown> = {
        limit:        PAGE_SIZE,
        with_payload: true,
        with_vector:  false,
      };
      if (offset !== null) body['offset'] = offset;
      if (kind) {
        body['filter'] = { must: [{ key: 'kind', match: { value: kind } }] };
      }

      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        if (fetched > 0) break; // partial result
        return json(
          { tags: [], kinds: {}, routeTypes: {}, auditFlags: {}, clusters: {}, totalChunks: 0, error: `Qdrant ${res.status}` },
          { status: 200 }
        );
      }

      const raw  = await res.text();
      const data = fastJsonParse<{ result?: { points?: { payload?: ChunkPayload }[]; next_page_offset?: string | number | null } }>(raw);
      const points = data?.result?.points ?? [];

      for (const pt of points) {
        if (pt.payload) payloads.push(pt.payload);
      }

      fetched     += points.length;
      offset       = data?.result?.next_page_offset ?? null;
      if (!offset || points.length < PAGE_SIZE) break;
    }

    // ── 2. Aggregate facets ────────────────────────────────────────────────────
    const tagCounts     = new Map<string, number>();
    const kindCounts    = new Map<string, number>();
    const routeCounts   = new Map<string, number>();
    const clusterCounts = new Map<number, number>();

    const auditFlags = {
      hasAuthGuard:    0,
      noAuthGuard:     0,
      hasZodValidation: 0,
      noZodValidation: 0,
      hasCachePattern: 0,
      isSseEndpoint:   0,
      isWorkerBoundary: 0,
      hasErrorHandling: 0,
    };

    let complexitySum = 0;
    let complexityCount = 0;
    let pageRankSum = 0;
    let pageRankCount = 0;

    for (const p of payloads) {
      // tags — can be string or string[]
      const rawTags = p.tags;
      if (rawTags) {
        const arr = Array.isArray(rawTags) ? rawTags : [rawTags];
        for (const t of arr) {
          if (t) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }

      // kind
      const k = p.kind ?? 'unknown';
      kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);

      // routeType (from Neo4j enrichment)
      const rt = p.neo4j_routeType;
      if (rt) routeCounts.set(rt, (routeCounts.get(rt) ?? 0) + 1);

      // gpuCluster
      const cl = p.neo4j_gpuCluster;
      if (cl !== null && cl !== undefined) {
        clusterCounts.set(cl, (clusterCounts.get(cl) ?? 0) + 1);
      }

      // audit flags
      if (p.neo4j_hasAuthGuard === true)     auditFlags.hasAuthGuard++;
      else if (p.neo4j_hasAuthGuard === false) auditFlags.noAuthGuard++;

      if (p.neo4j_hasZodValidation === true)  auditFlags.hasZodValidation++;
      else if (p.neo4j_hasZodValidation === false) auditFlags.noZodValidation++;

      if (p.neo4j_hasCachePattern)   auditFlags.hasCachePattern++;
      if (p.neo4j_isSseEndpoint)     auditFlags.isSseEndpoint++;
      if (p.neo4j_isWorkerBoundary)  auditFlags.isWorkerBoundary++;
      if (p.neo4j_hasErrorHandling)  auditFlags.hasErrorHandling++;

      if (p.neo4j_complexity !== null && p.neo4j_complexity !== undefined) {
        complexitySum += Number(p.neo4j_complexity);
        complexityCount++;
      }
      if (p.neo4j_pageRankScore !== null && p.neo4j_pageRankScore !== undefined) {
        pageRankSum += Number(p.neo4j_pageRankScore);
        pageRankCount++;
      }
    }

    // Sort tags by frequency, top 200
    const tags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(([tag, count]) => ({ tag, count }));

    const clusters = [...clusterCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([cluster, count]) => ({ cluster, count }));

    return json({
      totalChunks:     payloads.length,
      enriched:        payloads.filter(p => p.neo4j_enrichedAt !== undefined).length,
      tags,
      kinds:           Object.fromEntries([...kindCounts.entries()].sort((a, b) => b[1] - a[1])),
      routeTypes:      Object.fromEntries([...routeCounts.entries()].sort((a, b) => b[1] - a[1])),
      clusters,
      auditFlags,
      averageComplexity: complexityCount > 0 ? complexitySum / complexityCount : null,
      averagePageRank:   pageRankCount   > 0 ? pageRankSum   / pageRankCount   : null,
      scrolledLimit:     limit,
      kindFilter:        kind ?? null,
    });
  } catch (err) {
    console.error('[codebase-index/tags] Error:', err);
    return json(
      {
        totalChunks:      0,
        enriched:         0,
        tags:             [],
        kinds:            {},
        routeTypes:       {},
        clusters:         [],
        auditFlags: {
          hasAuthGuard: 0, noAuthGuard: 0,
          hasZodValidation: 0, noZodValidation: 0,
          hasCachePattern: 0, isSseEndpoint: 0, isWorkerBoundary: 0, hasErrorHandling: 0,
        },
        averageComplexity: null,
        averagePageRank:   null,
        scrolledLimit:     limit ?? 20_000,
        kindFilter:        kind ?? null,
      },
      { status: 200 }
    );
  }
};

// ── DELETE ────────────────────────────────────────────────────────────────────

const deleteSchema = z.object({
  tag: z.string().min(1).max(200),
});

export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { tag } = parsed.data;
  let removed = 0;

  try {
    let offset: string | number | null = null;

    do {
      const scrollBody: Record<string, unknown> = {
        limit:        500,
        with_payload: true,
        with_vector:  false,
        filter: { must: [{ key: 'tags', match: { value: tag } }] },
      };
      if (offset !== null) scrollBody['offset'] = offset;

      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(scrollBody),
        signal:  AbortSignal.timeout(30_000),
      });

      if (!res.ok) break;

      const data = fastJsonParse<{
        result?: {
          points?: { id: string | number; payload?: ChunkPayload }[];
          next_page_offset?: string | number | null;
        };
      }>(await res.text());

      const points = data?.result?.points ?? [];
      if (points.length === 0) break;

      // Strip the tag from each point's tags array (per-point — each has a unique tag set)
      const updates = points.map((pt) => {
        const existing = pt.payload?.tags;
        let updated: string[];
        if (Array.isArray(existing)) {
          updated = existing.filter((t) => t !== tag);
        } else if (typeof existing === 'string') {
          updated = existing === tag ? [] : [existing];
        } else {
          updated = [];
        }
        return { id: pt.id, tags: updated };
      });

      // PUT payload per-point in parallel batches of 50
      const BATCH = 50;
      for (let i = 0; i < updates.length; i += BATCH) {
        await Promise.all(
          updates.slice(i, i + BATCH).map((u) =>
            fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
              method:  'PUT',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ payload: { tags: u.tags }, points: [u.id] }),
              signal:  AbortSignal.timeout(15_000),
            })
          )
        );
      }

      removed += points.length;
      const next = data?.result?.next_page_offset ?? null;
      offset = (typeof next === 'string' || typeof next === 'number') ? next : null;
    } while (offset !== null);

    return json({ success: true, tag, removed });
  } catch (err) {
    console.error('[codebase-index/tags DELETE] Error:', err);
    return json({ error: 'Tag deletion failed' }, { status: 500 });
  }
};
