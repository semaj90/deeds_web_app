import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { executeDeepResearch } from '$lib/server/ai/hermes/deep-research-dag.js';

const bodySchema = z.object({
  query: z.string().min(3).max(4_000),
  mode: z.string().optional().default('deep-research'),
  writeToObsidian: z.boolean().optional().default(false),
  sessionId: z.string().optional(),
  caseId: z.string().optional(),
  parentTaskId: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = locals.user?.id;
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);

  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await executeDeepResearch({
      query: parsed.data.query,
      mode: parsed.data.mode,
      writeToObsidian: parsed.data.writeToObsidian,
      userId: userId ? Number(userId) : undefined,
      sessionId: parsed.data.sessionId,
      caseId: parsed.data.caseId,
      parentTaskId: parsed.data.parentTaskId,
    });

    return json({
      plan: result.plan,
      activeClusterIds: result.activeClusterIds,
      contextPacket: result.contextPacket,
      answer: result.answer,
      artifacts: result.artifacts,
    });
  } catch (e: any) {
    console.error('[deep-research] DAG execution failed:', e);
    return json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
};
