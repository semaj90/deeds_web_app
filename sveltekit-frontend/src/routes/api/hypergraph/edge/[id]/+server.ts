// @vitest-environment node
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getHyperedgeById, expandEdgeMembers } from '$lib/server/hypergraph/hypergraph-search.js';

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const { id } = params;
  if (!id?.trim()) throw error(400, 'Missing edge id');

  const expand = url.searchParams.get('expand') === 'true';

  if (expand) {
    const result = await expandEdgeMembers(id);
    if (!result.edge) throw error(404, 'Edge not found');
    return json(result);
  }

  const edge = await getHyperedgeById(id);
  if (!edge) throw error(404, 'Edge not found');
  return json(edge);
};
