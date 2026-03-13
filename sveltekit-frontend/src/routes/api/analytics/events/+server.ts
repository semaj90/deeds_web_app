/**
 * POST /api/analytics/events — Log analytics event(s)
 *   Accepts single event or batch array: { batch: [...] }
 * GET  /api/analytics/events — Get recent events for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { logEvent, logEventBatch, type AnalyticsEvent } from '$lib/server/analytics/event-logger.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const ANALYTICS_EVENT_TYPES = [
	'chat_query', 'tool_search', 'codebase_search', 'route_opened',
	'case_created', 'case_updated', 'evidence_uploaded', 'rag_search',
	'embedding_generated', 'cache_hit', 'cache_miss', 'error_analyzed',
	'patch_applied', 'document_indexed'
] as const;

const singleEventSchema = z.object({
	userId: z.string().max(200).optional(),
	sessionId: z.string().max(100).optional(),
	eventType: z.enum(ANALYTICS_EVENT_TYPES),
	payload: z.record(z.string(), z.unknown()).optional().default({})
});

const batchEventSchema = z.object({
	batch: z.array(singleEventSchema).min(1).max(200)
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();

		// Batch mode: { batch: [...] }
		if (Array.isArray(raw?.batch)) {
			const parsed = batchEventSchema.safeParse(raw);
			if (!parsed.success) {
				return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid batch' }, { status: 400 });
			}
			const events: AnalyticsEvent[] = parsed.data.batch.map(e => ({
				userId: e.userId ?? null,
				sessionId: e.sessionId ?? null,
				eventType: e.eventType,
				payload: e.payload
			}));
			const logged = await logEventBatch(events);

			// Fire-and-forget: publish user-associated events to RabbitMQ for async processing
			const userEvents = events.filter(e => e.userId);
			if (userEvents.length > 0) {
				import('$lib/server/queue/rabbitmq-manager-fixed.js').then(({ rabbitmq }) => {
					for (const e of userEvents) {
						rabbitmq.publishAnalyticsEvent({
							eventType: e.eventType,
							payload: { ...e.payload, userId: e.userId, sessionId: e.sessionId }
						}).catch(() => {});
					}
				}).catch(() => {});
			}

			return json({ ok: true, logged });
		}

		// Single event mode (backwards compatible)
		const parsed = singleEventSchema.safeParse(raw);
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
