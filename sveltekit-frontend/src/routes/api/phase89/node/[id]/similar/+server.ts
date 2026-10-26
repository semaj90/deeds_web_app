/**
 * API: GET /api/phase89/node/{ id }/similar
 * Finds similar nodes using vector similarity (pgvector)
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import postgres from 'postgres';
import type { RequestHandler } from './$types';

import { ENV } from '$lib/server/env.server.js';

const sql = postgres(ENV.DATABASE_URL);

// kg_nodes.id is an integer (serial), not a UUID.
const nodeIdSchema = z.coerce.number().int().min(1).max(2147483647);

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsedId = nodeIdSchema.safeParse(params.id);
  if (!parsedId.success || !/^\d+$/.test(params.id)) {
    return json({ error: 'Invalid ID format' }, { status: 400 });
  }
  const id = parsedId.data;

  try {
    // kg_nodes columns: id, node_type, label, properties. It has no embedding column, so similarity
    // search is not available for these nodes (embeddings live in phase89_embeddings / raw_error_embeddings,
    // keyed by error_hash, not by kg_nodes.id).
    const [node] = await sql`
      SELECT id, node_type AS kind, label FROM kg_nodes WHERE id = ${id}
    `;

    if (!node) {
      return json({ error: 'Node not found' }, { status: 404 });
    }

    return json({ error: 'Node has no embedding', results: [] });
  } catch (error) {
    console.error('Error finding similar nodes:', error);
    return json({ results: [] });
  }
};
