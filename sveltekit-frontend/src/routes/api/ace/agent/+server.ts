/**
 * POST /api/ace/agent
 * Body: { query: string, model?: string, temperature?: number, maxTokens?: number }
 * Returns: AceAgentResult
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { runAceAgentQuery } from '$lib/server/ace/ace-agent.js';

const BodySchema = z.object({
  query:       z.string().min(1).max(2000),
  model:       z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens:   z.number().int().min(64).max(8192).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { query, model, temperature, maxTokens } = parsed.data;
  const result = await runAceAgentQuery(query, { model, temperature, maxTokens });

  return json(result);
};
