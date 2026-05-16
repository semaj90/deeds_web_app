import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { HyperRagFusionService } from '$lib/server/retrieval/hyperrag-fusion-service.js';

const requestSchema = z.object({
  query: z.string().trim().min(1, 'Query string is required').max(1024, 'Query string is too long'),
  mode: z.enum(['codebase', 'evidence', 'legal', 'docs']).default('codebase'),
  topK: z.number().int().min(1).max(50).optional(),
  useTurboVec: z.boolean().optional(),
  useGraph: z.boolean().optional(),
  useAceCache: z.boolean().optional(),
  synthesize: z.boolean().optional(),
});

function emptyResult(error: string, status: number) {
  return json(
    {
      query: '',
      variants: [],
      hits: [],
      graphPaths: [],
      synthesis: null,
      error,
      provenance: { qdrant: false, turbovec: false, redis: false, neo4j: false, ace: false },
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

    const input = parsed.data;

    const service = HyperRagFusionService.getInstance();
    const result = await service.search({
      query: input.query,
      mode: input.mode,
      topK: input.topK ?? 15,
      useTurboVec: input.useTurboVec !== false,
      useGraph: input.useGraph !== false,
      useAceCache: input.useAceCache !== false,
      synthesize: input.synthesize,
      userId: locals.user.id,
    });

    return json(result);
  } catch (err) {
    console.error('[hyperrag-api] Error:', err);
    return emptyResult((err as Error).message, 500);
  }
};
