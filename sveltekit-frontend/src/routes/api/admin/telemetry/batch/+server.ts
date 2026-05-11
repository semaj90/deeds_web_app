import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { productionLogger } from '$lib/server/production-logger.js';

import { z } from 'zod';

const telemetrySchema = z.object({
	events: z.array(z.object({
		type: z.string().optional(),
		event: z.string().optional(),
		data: z.any().optional(),
		timestamp: z.number().optional()
	}))
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// Optional auth check - telemetry can be anonymous but we prefer user id
	const userId = locals.user ? Number(locals.user.id) : null;

	try {
		const body = await request.json();
		const { events } = telemetrySchema.parse(body);

		console.log(`[Telemetry] Batch received: ${events.length} events from user ${userId || 'anon'}`);

		// Bulk insert into admin_telemetry
		// Note: We use raw SQL here for speed and to avoid schema sync issues during rapid dev
		for (const event of events) {
			try {
				await db.execute(sql`
					INSERT INTO admin_telemetry (user_id, type, event, data, timestamp)
					VALUES (${userId}, ${event.type || 'generic'}, ${event.event || 'unspecified'}, ${JSON.stringify(event.data || event)}, ${new Date(event.timestamp || Date.now()).toISOString()})
				`);
			} catch (e) {
				console.error('[Telemetry] Failed to insert event:', e);
			}
		}

		// Also log to production logger for aggregation
		productionLogger.info(`Telemetry batch processed: ${events.length} events`, {
			userId: userId?.toString(),
			count: events.length
		});

		return json({ ok: true, count: events.length });
	} catch (err) {
		console.error('[Telemetry] Batch error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
