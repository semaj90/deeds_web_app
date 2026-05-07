import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';
import { traverseHypergraph } from '$lib/server/hypergraph/hypergraph-traversal.js';
import { SEARCH_MODES, MEMBER_KINDS } from '$lib/server/hypergraph/hypergraph-types.js';

const schema = z.object({
  anchor_key:  z.string().min(1).max(500),
  search_mode: z.enum(SEARCH_MODES).default('global'),
  member_kind: z.enum(MEMBER_KINDS).optional(),
  max_hops:    z.number().int().min(1).max(4).default(2),
  limit:       z.number().int().min(1).max(50).default(20),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try { body = await request.json(); }
  catch { throw error(400, 'Invalid JSON'); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.message);

  const result = await traverseHypergraph({
    anchor_key:  parsed.data.anchor_key,
    search_mode: parsed.data.search_mode,
    member_kind: parsed.data.member_kind,
    max_hops:    parsed.data.max_hops,
    limit:       parsed.data.limit,
  });

  return json(result);
};
