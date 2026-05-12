import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeDeepResearch } from '$lib/server/ai/hermes/deep-research-dag';

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = locals.user?.id;
  const { query, sessionId, caseId, parentTaskId } = await request.json();

  if (!query) {
    return json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const result = await executeDeepResearch({
      query,
      userId: userId ? Number(userId) : undefined,
      sessionId,
      caseId,
      parentTaskId
    });

    if (result.error) {
      return json({ 
        error: result.error,
        plan: result.plan,
        status: 'failed'
      }, { status: 500 });
    }

    return json({
      plan: result.plan,
      contextPacket: result.contextPacket,
      answer: result.answer,
      artifacts: {
        runId: result.runId,
        qdrantCount: result.qdrantHits?.length ?? 0,
        couchCount: result.couchRows?.length ?? 0
      }
    });
  } catch (e: any) {
    console.error('[deep-research] DAG execution failed:', e);
    return json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
};
