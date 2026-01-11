import { json } from '@sveltejs/kit';
import type { type RequestHandler } from '@sveltejs/kit';
import type { contextualUnderstanding } from '$lib/server/ai/contextual-understanding-service';

export const GET: RequestHandler = async ({ url }) => {
 try {
 const sessionId = url.searchParams.get('sessionId')?.trim() ?? '';
 const userId = url.searchParams.get('userId')?.trim() ?? '';

 if (!sessionId ?? !userId) {
 return json(
 { success: false, error: 'sessionId and userId query parameters are required' },
 { status: 400 }
 );
 }

 const stats = await contextualUnderstanding.getSessionStats(sessionId, userId);
 return json({ success: true, data: stats }, { status: 200 });
 } catch (error) {
 console.error('[contextual-stats] Failed to fetch stats', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'Unexpected error',
 },
 { status: 500 }
 );
 }
};


