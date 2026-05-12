/**
 * src/routes/api/wiki/encyclopedia/+server.ts
 * Topological encyclopedia search API.
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { assembleACEContext } from '$lib/server/wiki/encyclopedia';

const searchSchema = z.object({
  query: z.string().min(1, 'Query must not be empty'),
});

export async function POST(event: RequestEvent) {
  // 1. Auth check
  if (!event.locals.user) {
    return json({ error: 'Unauthorized', data: null }, { status: 401 });
  }

  try {
    // 2. Parse body with Zod
    const body = await event.request.json();
    const result = searchSchema.safeParse(body);
    if (!result.success) {
      return json({ error: 'Invalid input', details: result.error.format(), data: null }, { status: 400 });
    }

    // 3. Assemble context
    const contextData = await assembleACEContext(result.data.query);

    return json({ error: null, data: contextData });
  } catch (err: any) {
    console.error('[API /api/wiki/encyclopedia] Error:', err);
    return json({ error: 'Internal server error', data: null }, { status: 500 });
  }
}
