import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getVlmState } from '$lib/server/inference/vlm-lifecycle.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const state = await getVlmState();
    
    // Check if TurboQuant llama-server is healthy on 8090
    let turboQuantHealthy = false;
    try {
      const res = await fetch('http://127.0.0.1:8090/health', { signal: AbortSignal.timeout(1000) });
      turboQuantHealthy = res.ok;
    } catch {
      // Port is not listening or timed out
    }
    
    return json({
      success: true,
      state,
      turboQuantHealthy,
      config: {
        model: process.env.TURBO_MODEL_PATH ? 'configured' : 'missing',
        mmproj: process.env.TURBO_MMPROJ_PATH ? 'configured' : 'missing',
        ctx: process.env.TURBO_CTX ?? '16384',
        ngl: process.env.TURBO_NGL ?? '99'
      }
    });
  } catch (err: any) {
    console.error('[VLM Status API] GET error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
