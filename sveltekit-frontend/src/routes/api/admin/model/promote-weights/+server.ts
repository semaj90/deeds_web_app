import { json } from '@sveltejs/kit';
import { ModelManager } from '$lib/server/admin/model-manager.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const PromoteSchema = z.object({
  component: z.string().min(1),
  version: z.string().min(1)
});

/**
 * POST /api/admin/model/promote-weights
 * Atomically promotes a candidate weight version to 'live' status.
 */
export async function POST({ request, locals }) {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const parsed = PromoteSchema.safeParse(raw);
    
    if (!parsed.success) {
      return json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { component, version } = parsed.data;
    const result = await ModelManager.promoteCandidate(component, version);
    
    if (!result.success) {
      return json({ error: result.error }, { status: 400 });
    }

    return json({ 
      success: true, 
      message: `Component ${component} promoted to version ${version}.` 
    });
  } catch (err) {
    console.error('[ModelPromote] Error:', err);
    return json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
