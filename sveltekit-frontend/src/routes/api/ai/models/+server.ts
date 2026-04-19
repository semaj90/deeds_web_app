/**
 * GET /api/ai/models
 *
 * Lists available Ollama models. Proxies Ollama's /api/tags endpoint
 * and normalizes the response for the AI dashboard.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const ollamaTagsSchema = z.object({
	models: z.array(z.object({
		name: z.string().default(''),
		size: z.number().or(z.string()).default(''),
		modified_at: z.string().default(''),
		digest: z.string().default(''),
	}).passthrough()).optional().default([]),
}).passthrough();

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const ollamaUrl = ENV.OLLAMA_BASE_URL;

	try {
		const res = await fetch(`${ollamaUrl}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});

		if (!res.ok) {
			console.warn('[api/ai/models] Ollama returned', res.status);
			return json({ models: [] }, { headers: cacheControl.medium });
		}

		const raw = await res.json();
		const data = ollamaTagsSchema.parse(raw);
		const models = data.models.map((m) => ({
			name: String(m.name),
			size: String(m.size),
			modified_at: String(m.modified_at),
			digest: String(m.digest).slice(0, 12)
		}));

		const responseData = { models };

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.medium, ETag: etag }
		});
	} catch (err) {
		console.warn('[api/ai/models] Ollama connection failed:', (err as Error).message?.slice(0, 80));
		return json({ models: [] }, { headers: cacheControl.medium });
	}
};
