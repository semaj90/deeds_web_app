/**
 * API: GET /api/phase89/node/{ id }/docs
 * Retrieves relevant documentation for a graph node (error/symbol/file)
 */

import { json } from '@sveltejs/kit';
import postgres from 'postgres';
import type { RequestHandler } from './$types';

const sql = postgres(process.env?.DATABASE_URL?? 'postgresql://user:pass@127.0.0.1:5434/legal');
const QDRANT_URL = process.env?.QDRANT_URL?? 'http://127.0.0.1:6333';
const KNOWLEDGE_COLLECTION = 'phase76_knowledge_base';

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({model: 'embeddinggemma:latest',
      prompt: text,
    }),
  });
  const data = await response.json();
  return data.embedding;
}

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    // Get node detailsSELECT id, kind, label, meta, embedding FROM kg_nodes WHERE id = ${id}
    `;

    if (!node) {
      return json({ error: 'Node not found' }, { status: 404 });
    }

    // Generate query based on node type
    let query = '';
    if (node.kind === 'error') {
      const code = node.meta?.code?? '';
      const message = node.meta?.message?? '';
      query = `Fix TypeScript error ${code}: ${message}`;
    } else if (node.kind === 'file') {
      query = `Code examples for ${node.label}`;
    } else if (node.kind === 'symbol') {
      query = `Documentation for ${node.label}`;
    }

    // Generate embedding for query
    const embedding = await generateEmbedding(query);

    // Search Qdrant
    const response = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({vector: embedding,
        limit: 5,
        with_payload: true,
      }),
    });

    const searchResults = await response.json();

    const results = (searchResults?.result|| []).map((hit: any) => ({
      title: hit.payload?.title ?? hit.payload?.source ?? 'Unknown',
      snippet: hit.payload?.content?.substring(0, 200) ?? hit.payload?.text?.substring(0, 200) ?? '',
      score: hit.score,
      tags: hit.payload?.tags ?? [],
    }));

    return json({ results, query });
  } catch (error) {
    console.error('Error retrieving docs:', error);
    return json({ error: error.message }, { status: 500 });
  }
};
