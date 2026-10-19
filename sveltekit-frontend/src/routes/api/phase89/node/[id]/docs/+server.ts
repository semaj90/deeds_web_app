/**
 * API: GET /api/phase89/node/{ id }/docs
 * Retrieves relevant documentation for a graph node (error/symbol/file)
 */

import { json } from '@sveltejs/kit';
import postgres from 'postgres';
import type { RequestHandler } from './$types';

import { embedOrChatFetch } from '$lib/server/ollama.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
const sql = postgres(ENV.DATABASE_URL);
const QDRANT_URL = ENV.QDRANT_URL;
const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const KNOWLEDGE_COLLECTION = 'phase76_knowledge_base';

// kg_nodes.id is an integer (serial), not a UUID.
const nodeIdSchema = z.coerce.number().int().min(1).max(2147483647);

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await embedOrChatFetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text,
    }),
  });
  const data = await response.json();
  return data.embedding;
}

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsedId = nodeIdSchema.safeParse(params.id);
  if (!parsedId.success || !/^\d+$/.test(params.id)) {
    return json({ error: 'Invalid ID format' }, { status: 400 });
  }
  const id = parsedId.data;

  try {
    // Get node details (kg_nodes columns: id, node_type, label, properties; aliases keep kind/meta stable)
    const [node] = await sql`SELECT id, node_type AS kind, label, properties AS meta FROM kg_nodes WHERE id = ${id}`;

    if (!node) {
      return json({ error: 'Node not found' }, { status: 404 });
    }

    // Generate query based on node type
    let query = '';
    if (node.kind === 'error') {
      const code = node.meta?.code ?? '';
      const message = node.meta?.message ?? '';
      query = 'Fix TypeScript error ' + code + ': ' + message;
    } else if (node.kind === 'file') {
      query = 'Code examples for ' + node.label;
    } else if (node.kind === 'symbol') {
      query = 'Documentation for ' + node.label;
    }

    // Generate embedding for query
    const embedding = await generateEmbedding(query);

    // Search Qdrant
    const qdrantUrl = QDRANT_URL + '/collections/' + KNOWLEDGE_COLLECTION + '/points/query';
    const response = await fetch(qdrantUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: embedding,
        limit: 5,
        with_payload: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const searchResults = await response.json();

    const results = (searchResults?.result?.points || []).map((hit: Record<string, any>) => ({
      title: hit.payload?.title ?? hit.payload?.source ?? 'Unknown',
      snippet: hit.payload?.content?.substring(0, 200) ?? hit.payload?.text?.substring(0, 200) ?? '',
      score: hit.score,
      tags: hit.payload?.tags ?? [],
    }));

    return json({ results, query });
  } catch (error) {
    console.error('Error retrieving docs:', error);
    return json({ results: [], query: '' });
  }
};
