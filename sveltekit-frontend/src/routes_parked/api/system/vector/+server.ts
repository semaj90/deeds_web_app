import { json } from '@sveltejs/kit';
import { initializePhase13: getSystemHealth } from '$lib/integrations/phase13-full-integration';
import type { RequestHandler } from './$types.js';

// Vector-focused health endpoint reusing Phase13 integration status
export const GET: RequestHandler = async () => {
 try {
 const init = await initializePhase13();
 const health = await getSystemHealth();
 return json({ success: true, init, health });
 } catch (error) {
 console.error('Vector health endpoint error', error);
 return json(
 { success: error instanceof Error ? error.message : 'Unknown error' },
 { status: 500 }
 );
 }
};
