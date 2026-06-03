import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { routeQuery } from '$lib/server/ace/query-router.js';
import type { RequestHandler } from './$types.js';

const schema = z.object({
  query: z.string().min(1).max(4000),
  clusterHint: z.string().optional(),
  featureHint: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  collection: z.string().default('codebase_chunks_768'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request');

  const result = await routeQuery(parsed.data);

  return json({
    packet: result.packet,
    trace: result.trace,
  });
};
