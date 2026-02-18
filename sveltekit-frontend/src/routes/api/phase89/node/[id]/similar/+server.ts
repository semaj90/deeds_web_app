/**
 * API: GET /api/phase89/node/{ id }/similar
 * Finds similar nodes using vector similarity (pgvector)
 */

import { json } from '@sveltejs/kit';
import postgres from 'postgres';
import type { RequestHandler } from './$types';
import { getDatabaseUrl } from '$lib/config/env.server.js';

const sql = postgres(getDatabaseUrl());

export const GET: RequestHandler = async ({ params, url }) => {
  const { id } = params;
  const topK = parseInt(url.searchParams.get('topK') ?? '5');

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

    const results = similar.map((s: any) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      meta: s.meta,
      similarity: parseFloat(s.similarity),
    }));

    return json({ results });
  } catch (error: any) {
    console.error('Error finding similar nodes:', error);
    return json({ error: error?.message ?? 'Unknown error', results: [] }, { status: 500 });
  }
};
