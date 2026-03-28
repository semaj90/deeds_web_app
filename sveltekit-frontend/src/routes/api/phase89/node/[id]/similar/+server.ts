/**
 * API: GET /api/phase89/node/{ id }/similar
 * Finds similar nodes using vector similarity (pgvector)
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import postgres from 'postgres';
import type { RequestHandler } from './$types';
import { getDatabaseUrl } from '$lib/config/env.server.js';
import { isUuid } from '$lib/server/validation.js';

const sql = postgres(getDatabaseUrl());

const querySchema = z.object({
  topK: z.coerce.number().int().min(1).max(50).default(5)
});

export const GET: RequestHandler = async ({ params, url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = params;

  if (!isUuid(id)) {
    return json({ error: 'Invalid ID format' }, { status: 400 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  const topK = parsed.success ? parsed.data.topK : 5;

  try {
    // Get node and its embedding
    const [node] = await sql`
      SELECT id, kind, label, embedding FROM kg_nodes WHERE id = ${id}
    `;

    if (!node) {
      return json({ error: 'Node not found' }, { status: 404 });
    }

    if (!node.embedding) {
      return json({ error: 'Node has no embedding', results: [] });
    }

    // Find similar nodes using cosine distance
    const similar = await sql`
      SELECT
        id, kind,
        label, meta,
        1 - (embedding <=> ${node.embedding}::vector) AS similarity
      FROM kg_nodes
      WHERE
        kind = ${node.kind}
        AND id != ${id}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${node.embedding}::vector
      LIMIT ${topK}
    `;

    const results = similar.map((s: Record<string, unknown>) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      meta: s.meta,
      similarity: parseFloat(String(s.similarity)),
    }));

    return json({ results });
  } catch (error) {
    console.error('Error finding similar nodes:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error', results: [] }, { status: 500 });
  }
};
