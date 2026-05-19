import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { searchAce, type AceSearchInput, type AceSearchOutput } from '$lib/server/ai/ace-search.js';

const requestSchema = z.object({
  query: z.string().trim().min(1, 'Query string is required').max(1024, 'Query string is too long'),
  intent: z.enum(['code', 'schema', 'legal', 'startup', 'debug']).optional(),
  limit: z.number().int().min(1).max(10).optional(),
  includeFullText: z.boolean().optional(),
  tokenBudget: z.number().int().min(256).max(3500).optional(),
});

function emptyResult(error: string, status: number) {
  return json(
    {
      query: '',
      hits: [],
      ontology: { entities: [], relations: [] },
      llm_synthesis: { summary: '', next_actions: [], token_estimate: 0 },
      error,
    },
    { status }
  );
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return emptyResult('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return emptyResult(parsed.error.issues.map((issue) => issue.message).join('; '), 400);
    }

    const input: AceSearchInput = parsed.data;
    const result: AceSearchOutput = await searchAce(input, String(locals.user.id));
    return json(result);
  } catch (err) {
    console.error('[ace-search-api] Error:', err);
    return emptyResult((err as Error).message, 500);
  }
};
