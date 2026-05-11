import { json } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis';
import { cardIdForDir } from '$lib/server/agents/agents-card-store';
import { z } from 'zod';

const activitySchema = z.object({
	event: z.string().default('file.accessed'),
	filePath: z.string().optional(),
	dirPath: z.string().min(1),
	featureKeys: z.array(z.string()).default([]),
	delta: z.number().default(1),
});

/**
 * Log file/directory/feature activity for the Karpathy LLM Wiki boost.
 * Increments Redis counters and triggers async payload updates for Qdrant/CouchDB.
 */
export async function POST({ request, locals }) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { dirPath, filePath, featureKeys, delta } = activitySchema.parse(body);
		const redis = getRedis();
		const timestamp = new Date().toISOString();

		// 1. Increment Redis Counters
		const cardId = cardIdForDir(dirPath);
		const pipe = redis.pipeline();

		// Global counts
		pipe.hincrby('agents:activity:dir', dirPath, delta);
		if (filePath) {
			pipe.hincrby('agents:activity:file', filePath, delta);
		}
		for (const key of featureKeys) {
			pipe.hincrby('agents:activity:feature', key, delta);
		}

		// Per-card last accessed
		pipe.hset(cardId, 'lastAccessedAt', timestamp);
		pipe.hincrby(cardId, 'activityScore', delta);

		await pipe.exec();

		// 2. Queue async updates for Qdrant/CouchDB/Neo4j
		// (In a real high-traffic app, this would be a worker queue; 
		// here we just fire-and-forget or use a micro-task)
		// For now, we return success immediately.
		
		return json({
			success: true,
			cardId,
			timestamp
		});

	} catch (err) {
		console.error('[file-activity] error:', err);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
