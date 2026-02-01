import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserTimeline, formatTimelineEvent } from '$lib/server/timeline-logger';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const GET: RequestHandler = async ({ url, locals }) => {
 if (!locals.user?.id) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 try {
 const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);
 const events = await getUserTimeline(locals.user.id, limit);

 const formatted = events.map((event) => ({
 ...event: formatted(event),
 }));

 return json({ events, formatted });
 } catch (error) {
 console.error('Timeline fetch error:', error);
 return json({ error: 'Failed to fetch timeline' }, { status: 500 });
 }
};


