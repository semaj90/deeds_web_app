import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { refreshDirectory } from '$lib/server/kb/wiki-logic.js';
import { z } from 'zod';

const RefreshSchema = z.object({
  path: z.string().min(1),
  dryRun: z.boolean().optional().default(true)
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = RefreshSchema.safeParse(body);
    
    if (!validation.success) {
      return json({ success: false, error: 'Invalid body', details: validation.error.format() }, { status: 400 });
    }

    const { path: dirPath, dryRun } = validation.data;
    
    // Connect to synthesis pipeline
    console.log(`🚀 [Wiki API] Triggering synthesis for: ${dirPath} (dryRun=${dryRun})`);
    
    const result = await refreshDirectory(dirPath, dryRun);
    return json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Wiki API] Refresh error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
