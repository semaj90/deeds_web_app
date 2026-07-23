import { pgRows } from '$lib/server/db/client';
/**
 * POST /api/analytics/events — Log analytics event(s)
 *   Accepts single event or batch array: { batch: [...] }
 * GET  /api/analytics/events — Get recent events for a user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logEvent, logEventBatch, type AnalyticsEvent } from '$lib/server/analytics/event-logger.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const ANALYTICS_EVENT_TYPES = [
	'chat_query', 'tool_search', 'codebase_search', 'route_opened', 'page_view',
	'case_created', 'case_updated', 'evidence_uploaded', 'rag_search',
	'embedding_generated', 'cache_hit', 'cache_miss', 'error_analyzed',
	'patch_applied', 'document_indexed'
] as const;

type AnalyticsEventInputType = (typeof ANALYTICS_EVENT_TYPES)[number];

function normalizeEventType(eventType: AnalyticsEventInputType): AnalyticsEvent['eventType'] {
	return eventType === 'page_view' ? 'route_opened' : eventType;
}

const singleEventSchema = z.object({
	userId: z.string().max(200).nullish(),
	sessionId: z.string().max(100).nullish(),
	eventType: z.enum(ANALYTICS_EVENT_TYPES),
	payload: z.record(z.string(), z.unknown()).optional().default({})
});

const batchEventSchema = z.object({
	batch: z.array(singleEventSchema).min(1).max(200)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();

		// Batch mode: { batch: [...] }
		if (Array.isArray(raw?.batch)) {
			const parsed = batchEventSchema.safeParse(raw);
			if (!parsed.success) {
				return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid batch' }, { status: 400 });
			}
			const events: AnalyticsEvent[] = parsed.data.batch.map(e => ({
				userId: e.userId ?? undefined,
				sessionId: e.sessionId ?? undefined,
				eventType: normalizeEventType(e.eventType),
				payload: e.payload
			}));
			void logEventBatch(events);

			// Fire-and-forget: publish user-associated events to RabbitMQ for async processing
			const userEvents = events.filter(e => e.userId);
			if (userEvents.length > 0) {
				import('$lib/server/queue/dispatch-inline.js').then(({ dispatchOrExecuteInline }) => {
					for (const e of userEvents) {
						dispatchOrExecuteInline('analytics.track', {
							eventType: e.eventType,
							payload: { ...e.payload, userId: e.userId, sessionId: e.sessionId }
						}).catch(() => {});
					}
				}).catch(() => {});
			}

			return json({ ok: true, logged: events.length });
		}

		// Single event mode (backwards compatible)
		const parsed = singleEventSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const event: AnalyticsEvent = {
			userId: parsed.data.userId ?? undefined,
			sessionId: parsed.data.sessionId ?? undefined,
			eventType: normalizeEventType(parsed.data.eventType),
			payload: parsed.data.payload
		};
		void logEvent(event);
		return json({ ok: true });
	} catch {
		return json({ ok: false, error: 'Failed to log event' }, { status: 500 });
	}
};

const eventListQuerySchema = z.object({
	userId: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	const parsed = eventListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
	}
	const { userId, limit } = parsed.data;
	const scopedUserIdText = locals.user.role === 'admin' && userId ? userId : String(locals.user.id);
	const scopedUserIdInt = Number(scopedUserIdText);
	const userIdFilter = Number.isFinite(scopedUserIdInt)
		? sql`user_id = ${scopedUserIdInt}`
		: sql`user_id::text = ${scopedUserIdText}`;

	try {
		const { db } = await import('$lib/server/db/client');
		const rows = await db.execute(
			sql`SELECT id, user_id, session_id, event_type, payload, created_at
				FROM analytics_events
				WHERE ${userIdFilter}
				ORDER BY created_at DESC
				LIMIT ${limit}`
		);

		const responseData = { events: pgRows(rows) };
		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.private, ETag: etag }
		});
	} catch {
		return json({ events: [], error: 'Database unavailable' }, {
			status: 503,
			headers: cacheControl.private
		});
	}
};
