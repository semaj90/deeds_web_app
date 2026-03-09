import type { RequestHandler } from './$types';
import { queryGraphRag } from '$lib/server/ai/graph-rag-orchestrator';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { text, embedding, limit, expandNeighbors, filters } = body;
    const results = await queryGraphRag({
      text,
      embedding,
      limit,
      expandNeighbors,
      filters,
    });
    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
