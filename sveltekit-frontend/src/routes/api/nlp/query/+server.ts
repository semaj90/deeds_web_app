import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { analyzeQueryRouting } from '$lib/server/nlp/query-routing.js';

const querySchema = z.object({
  query: z.string().min(1),
  context: z.object({
    repositoryId: z.string().optional(),
    previousIntent: z.string().optional(),
    taskState: z.string().optional(),
    domainHint: z.string().optional(),
  }).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const analysis = await analyzeQueryRouting(parsed.data.query, parsed.data.context ?? {});
  return json(analysis);
};

