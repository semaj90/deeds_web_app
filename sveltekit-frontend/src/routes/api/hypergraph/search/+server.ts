// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { searchHyperedges } from '$lib/server/hypergraph/hypergraph-search.js';
import type { HyperedgeSearchParams } from '$lib/server/hypergraph/hypergraph-types.js';

const EDGE_TYPE_VALUES = ['retrieval', 'fix_attempt', 'test_coverage', 'cluster_context', 'agents_context'] as const;
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
  const params: HyperedgeSearchParams = {
    member_key:  parsed.data.query ?? parsed.data.member_key,
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
