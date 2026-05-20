import { json } from '@sveltejs/kit';
import { z } from 'zod';
import IORedis from 'ioredis';
import { ENV } from '$lib/server/env.server.js';
import type { RequestHandler } from './$types';

const REDIS_URL = ENV.REDIS_URL;
let publisher: IORedis | null = null;

function getPublisher() {
	if (!publisher || publisher.status === 'end') {
		publisher = new IORedis(REDIS_URL);
	}
	return publisher;
}

const BroadcastSchema = z.object({
	caseId: z.string().uuid(),
	type: z.string(),
	payload: z.any(),
	timestamp: z.number().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const parsed = BroadcastSchema.safeParse(body);
		
		if (!parsed.success) {
			return json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
		}

		const { caseId, type, payload, timestamp } = parsed.data;

		const pub = getPublisher();
		const message = JSON.stringify({
			userId: Number(locals.user.id),
			userName: locals.user.email,
			caseId,
			type,
			payload,
			timestamp: timestamp || Date.now()
		});

		// Publish to the same channel the SSE endpoint subscribes to
		await pub.publish(`updates:${caseId}`, message);

		return json({ success: true });
	} catch (err) {
		console.error('[Collaboration Broadcast] Error:', err);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
