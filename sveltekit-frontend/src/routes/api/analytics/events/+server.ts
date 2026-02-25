/**
 * POST /api/analytics/events — Log an analytics event
 * GET  /api/analytics/events — Get recent events for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { logEvent, type AnalyticsEvent } from '$lib/server/analytics/event-logger.js';
import { sql } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const event: AnalyticsEvent = {
			userId: body.userId ?? null,
			sessionId: body.sessionId ?? null,
			eventType: body.eventType ?? 'route_opened',
			payload: body.payload ?? {}
		};
		await logEvent(event);
		return json({ ok: true });
	} catch {
		return json({ ok: false, error: 'Failed to log event' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

	try {
		const db = (await import('$lib/server/db')).default;
		const rows = await db.execute(
			sql`SELECT id, user_id, session_id, event_type, payload, created_at
				FROM user_analytics_events
				WHERE (${userId}::text IS NULL OR user_id::text = ${userId ?? ''})
				ORDER BY created_at DESC
				LIMIT ${limit}`
		);
		return json({ events: [...rows] });
	} catch {
		return json({ events: [], error: 'Database unavailable' }, { status: 503 });
	}
};
