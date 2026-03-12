/**
 * POST /api/analytics/events — Log an analytics event
 * GET  /api/analytics/events — Get recent events for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { logEvent, type AnalyticsEvent } from '$lib/server/analytics/event-logger.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const ANALYTICS_EVENT_TYPES = [
	'chat_query', 'tool_search', 'codebase_search', 'route_opened',
	'case_created', 'case_updated', 'evidence_uploaded', 'rag_search',
	'embedding_generated', 'cache_hit', 'cache_miss', 'error_analyzed',
	'patch_applied', 'document_indexed'
] as const;

const analyticsEventSchema = z.object({
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(100).optional(),
	eventType: z.enum(ANALYTICS_EVENT_TYPES),
	payload: z.record(z.string(), z.unknown()).optional().default({})
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = analyticsEventSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const event: AnalyticsEvent = {
			userId: parsed.data.userId ?? null,
			sessionId: parsed.data.sessionId ?? null,
			eventType: parsed.data.eventType,
			payload: parsed.data.payload
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
