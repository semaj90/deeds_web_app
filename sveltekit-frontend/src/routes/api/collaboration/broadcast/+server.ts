import { json } from '@sveltejs/kit';
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

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const { caseId, type, payload, timestamp } = await request.json();
		
		if (!caseId) {
			return json({ error: 'Missing caseId' }, { status: 400 });
		}

		const pub = getPublisher();
		const message = JSON.stringify({
			userId: locals.user.id,
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
