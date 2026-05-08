// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { searchHyperedges } from '$lib/server/hypergraph/hypergraph-search.js';
import type { HyperedgeSearchParams } from '$lib/server/hypergraph/hypergraph-types.js';
import { ENV } from '$lib/server/env.server.js';

const EDGE_TYPE_VALUES = ['retrieval', 'fix_attempt', 'test_coverage', 'cluster_context', 'agents_context', 'shared_resource', 'vault_link', 'topo_context'] as const;
const MEMBER_KIND_VALUES = ['query', 'file', 'agents_md', 'cluster', 'prior_answer', 'test', 'chunk', 'neo4j_node'] as const;

const schema = z.object({
  // Free-text search maps to member_key ILIKE or label/query_hash prefix
  query:       z.string().max(500).optional(),
  // Internal structured params (used by MCP tools)
  member_key:  z.string().max(500).optional(),
  member_kind: z.enum(MEMBER_KIND_VALUES).optional(),
  edge_type:   z.enum(EDGE_TYPE_VALUES).optional(),
  run_id:      z.string().uuid().optional(),
  query_hash:  z.string().max(128).optional(),
  limit:       z.number().int().min(1).max(50).default(10),
  offset:      z.number().int().min(0).default(0),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.message);

  // Translate free-text `query` into member_key search if no structured params given
  // Free-text path: ILIKE on title/summary/label/member_ids. Exact-match
  // member_key was too narrow for cluster_context edges seeded from
  // qdrant_cluster_members (members are file paths; queries are NL).
  if (parsed.data.query && !parsed.data.member_key) {
    const { default: pg } = await import('pg');
    // Use the canonical DATABASE_URL from env.server.ts (which resolves the
    // .env-defined value, not the fallback that may point at a legacy DB
    // missing title/summary columns).
    const pool = new pg.Pool({
      connectionString: ENV.DATABASE_URL,
      max: 2,
    });
    try {
      const q = `%${parsed.data.query.replace(/[%_]/g, '\\$&')}%`;
      const rows = await pool.query(
        `SELECT id, edge_type, label, weight, title, summary, grade_label,
                grade_score, confidence, member_ids, gpu_cluster, topo_class,
                metadata, created_at
         FROM hypergraph_edges
         WHERE (title ILIKE $1 OR summary ILIKE $1 OR label ILIKE $1
                OR EXISTS (SELECT 1 FROM unnest(member_ids) m WHERE m ILIKE $1))
           AND ($2::text IS NULL OR edge_type = $2)
         ORDER BY grade_score DESC NULLS LAST, weight DESC
         LIMIT $3 OFFSET $4`,
        [q, parsed.data.edge_type ?? null, parsed.data.limit, parsed.data.offset],
      );
      return json({
        results: rows.rows.map(r => ({
          edge: {
            id:           r.id,
            edgeType:     r.edge_type,
            label:        r.label,
            weight:       r.weight,
            title:        r.title,
            summary:      r.summary,
            gradeLabel:   r.grade_label,
            gradeScore:   r.grade_score,
            confidence:   r.confidence,
            memberCount:  Array.isArray(r.member_ids) ? r.member_ids.length : 0,
            gpuCluster:   r.gpu_cluster,
            topoClass:    r.topo_class,
            metadata:     r.metadata,
          },
          activationScore: r.grade_score ?? 0.5,
          matchedKeys:     [],
        })),
        totalMatched: rows.rowCount ?? 0,
        durationMs:   0,
      });
    } finally {
      await pool.end().catch(() => {});
    }
  }

  // Structured search path (exact member_key etc.) — unchanged
  const params: HyperedgeSearchParams = {
    member_key:  parsed.data.member_key,
    member_kind: parsed.data.member_kind,
    edge_type:   parsed.data.edge_type,
    run_id:      parsed.data.run_id,
    query_hash:  parsed.data.query_hash,
    limit:       parsed.data.limit,
    offset:      parsed.data.offset,
  };

  const results = await searchHyperedges(params);
  return json(results);
};
