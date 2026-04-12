import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { ollamaBreaker, qdrantBreaker, redisBreaker } from '$lib/server/circuit-breaker.js';

export const GET: RequestHandler = async ({ request }) => {
	const responseData = {
		breakers: {
			ollama: ollamaBreaker.getStatus(),
			qdrant: qdrantBreaker.getStatus(),
			redis: redisBreaker.getStatus(),
		}
	};

	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);

	return json(responseData, {
		headers: { ...cacheControl.short, ETag: etag }
	});
};
