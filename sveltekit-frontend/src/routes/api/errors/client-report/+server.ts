/**
 * Client Error Batch Receiver
 *
 * POST /api/errors/client-report
 * Body: { errors: [{ message, stack, url, timestamp, type }] }
 *
 * Receives batched client-side errors from hooks.client.ts,
 * stores them in the error_events table, and publishes to
 * the error.embed RabbitMQ queue for async embedding.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { errorEvents } from '$lib/server/db/schema-postgres.js';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';

const clientErrorSchema = z.object({
	message: z.string().max(5000),
	stack: z.string().max(10000).default(''),
	url: z.string().max(500).default(''),
	timestamp: z.string().max(50).default(''),
	type: z.enum(['handleError', 'uncaught', 'unhandledrejection', 'fetch-failure']),
});

const batchSchema = z.object({
	errors: z.array(clientErrorSchema).min(1).max(20),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// Allow unauthenticated — client errors happen before/during auth flows
	const parsed = batchSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { errors } = parsed.data;
	const userId = locals.user?.id;
	let stored = 0;
	let published = 0;

	for (const err of errors) {
		try {
			// Map client error type to error_kind enum
			const kind = err.type === 'fetch-failure' ? 'api' : 'runtime';
			const severity = err.type === 'handleError' ? 'error' : 'warn';

			await db.insert(errorEvents).values({
				routePath: err.url || '/',
				kind,
				severity,
				message: err.message,
				stack: err.stack || null,
				collectedAt: err.timestamp ? new Date(err.timestamp) : new Date(),
			});
			stored++;

			// Publish to RabbitMQ for async embedding (fire-and-forget)
			rabbitmq.publishErrorEmbed({
				errorMessage: err.message,
				routePath: err.url || '/',
				stackTrace: err.stack || undefined,
				severity,
			}).catch(() => {});
			published++;
		} catch {
			// Continue processing remaining errors
		}
	}

	return json({ stored, published, total: errors.length });
};
