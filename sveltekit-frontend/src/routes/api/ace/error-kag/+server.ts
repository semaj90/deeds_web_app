/**
 * POST /api/ace/error-kag
 *
 * Accepts raw error output and runs the full pipeline:
 *   LLM summarize → Postgres research_summaries → Qdrant upsert → KAG tags
 *
 * Body: {
 *   errorText:      string   (required — raw compiler/test/runtime output)
 *   affectedFiles?: string[]
 *   source?:        'svelte-check' | 'vitest' | 'runtime' | 'playwright'
 * }
 *
 * Returns: ErrorKagResult
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { summarizeErrorToKag } from '$lib/server/ace/ace-error-kag.js';

const BodySchema = z.object({
  errorText:     z.string().min(1).max(20_000),
  affectedFiles: z.array(z.string()).optional(),
  source:        z.enum(['svelte-check', 'vitest', 'runtime', 'playwright', 'unknown']).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw    = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await summarizeErrorToKag(parsed.data);
  return json(result);
};
