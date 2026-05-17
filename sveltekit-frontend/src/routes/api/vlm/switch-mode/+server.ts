import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { switchVlmMode, VlmMode } from '$lib/server/inference/vlm-lifecycle.js';
import { z } from 'zod';

const SwitchModeSchema = z.object({
  mode: z.nativeEnum(VlmMode)
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const validation = SwitchModeSchema.safeParse(body);
    
    if (!validation.success) {
      return json(
        { success: false, error: 'Invalid VLM mode', details: validation.error.format() },
        { status: 400 }
      );
    }
    
    const { mode } = validation.data;
    console.info(`🚀 [VLM Status API] Switch triggered: switching to mode ${mode}`);
    
    const result = await switchVlmMode(mode);
    if (!result.success) {
      return json({ success: false, error: result.error ?? 'Failed to switch mode' }, { status: 500 });
    }
    
    return json({ success: true, mode });
  } catch (err: any) {
    console.error('[VLM Status API] POST switch error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
