import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ollamaBreaker, qdrantBreaker, redisBreaker } from '$lib/server/circuit-breaker.js';

export const GET: RequestHandler = async () => {
	return json({
		breakers: {
			ollama: ollamaBreaker.getStatus(),
			qdrant: qdrantBreaker.getStatus(),
			redis: redisBreaker.getStatus(),
		}
	});
};
