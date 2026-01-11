/**
 * API endpoint for reranking items using the server-side AI assistant.
 * Accepts POST requests with a RerankRequest payload and returns reranked results.
 * Falls back to a 500 error if the server rerank fails.
 */
import type { RequestHandler } from '@sveltejs/kit';
import type { serverRerank  } from '$lib/server/ai/ai-assistant-input-synthesizer';
import type { RerankRequest } from '$lib/types';
import { json } from '@sveltejs/kit';;

export const POST: RequestHandler = async ({ request }) => {
  const body: RerankRequest = await request.json();

  // Production: use server GPU pipeline
  try {
    const result = await serverRerank(body);
    return json(result, { status: 200 });
  } catch (err) {
    console.error('Server rerank failed: ', err);

    // If fallback fails, return error response
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
  }
};
