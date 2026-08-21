import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { traverseGraphV1 } from '$lib/server/atlas/graph/graph-traversal.js';
import type { GraphTraverseRequestV1 } from '$lib/server/atlas/graph/graph-runtime-contracts.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  const { request } = event;
  try {
    const body = (await request.json()) as GraphTraverseRequestV1;
    const result = await traverseGraphV1(body);
    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 400 });
  }
};
