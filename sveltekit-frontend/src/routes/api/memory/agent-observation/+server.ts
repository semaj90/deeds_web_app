import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ingestAgentObservation, agentObservationSchema } from '$lib/server/memory/agent-observation-ingest.js';

export const POST: RequestHandler = async ({ request, locals}) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const result = agentObservationSchema.safeParse(body);
    if (!result.success) {
      return json({ ok: false, error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
    }
    const ingestResult = await ingestAgentObservation(result.data);
    return json(ingestResult, { status: 201 });
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'Invalid payload or ingest failure',
        detail: error instanceof Error ? error.message : 'unknown_error',
      },
      { status: 400 }
    );
  }
};
