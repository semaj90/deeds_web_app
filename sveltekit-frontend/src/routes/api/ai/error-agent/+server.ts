import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runWorkflowLoopLangGraph } from '$lib/server/ai/error-agent/workflow-loop-langgraph.js';
import { z } from 'zod';

const errorAgentInputSchema = z.object({
  runId: z.string().optional(),
  query: z.string().min(1),
  hmmErrorClass: z.enum([
    'meta_hygiene',
    'stale_migration',
    'schema_mismatch',
    'vector_infra_missing',
    'env_url_mismatch',
    'route_contract_mismatch',
    'api_validation_gap',
    'ssr_safety_violation',
    'unknown'
  ]),
  caseId: z.string().optional(),
  userId: z.string().optional(),
  targetPath: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const validated = errorAgentInputSchema.parse(body);

    const result = await runWorkflowLoopLangGraph({
      ...validated,
      userId: validated.userId ?? (locals.user?.id ? String(locals.user.id) : '1')
    });

    return json({ ok: true, result });
  } catch (err: any) {
    console.error('[ErrorAgent API] Error:', err);
    return json({ ok: false, error: err.message }, { status: 500 });
  }
};
