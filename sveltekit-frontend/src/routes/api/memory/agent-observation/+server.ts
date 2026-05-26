import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ingestAgentObservation } from '$lib/server/memory/agent-observation-ingest.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const result = await ingestAgentObservation(await request.json());
    return json(result, { status: 201 });
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
