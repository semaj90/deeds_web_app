import { json } from '@sveltejs/kit';
import { z } from 'zod';

import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { ENV } from '$lib/server/env.server.js';

const QDRANT_URL = ENV.QDRANT_URL;

const querySchema = z.object({
	file_path: z.string().min(1, 'file_path parameter required').max(500),
	limit: z.coerce.number().int().min(1).max(100).default(10)
});

interface KBEntry { id: string, score: number;
	content: string, tags: string[];
	type: string, file_path: string;
	timestamp: string;
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'file_path parameter required' }, { status: 400 });
	}
	const { file_path: filePath, limit } = parsed.data;

	try {
		// Query Qdrant for KB entries matching this file
		const response = await fetch(`${QDRANT_URL}/collections/phase76_knowledge_base/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ filter: { must: [
						{
						key: 'file_path',
							match: { value: filePath }
						}
					]
				},
				limit,
				with_payload: true,
				with_vector: false
			}),
			signal: AbortSignal.timeout(10_000)
		});

		if (!response.ok) {
			throw new Error(`Qdrant query failed: ${response.statusText}`);
		}

		const data = await response.json();
		const points = data.result?.points ?? [];

		const entries: KBEntry[] = points.map((point: Record<string, any>) => ({
			id: point.id,
			score: 1.0, // No scoring in scroll query
			content: point.payload?.content ?? point.payload?.text ?? '',
			tags: point.payload?.tags ?? [],
			type: point.payload?.type ?? 'unknown',
			file_path: point.payload?.file_path ?? filePath,
			timestamp: point.payload?.timestamp ?? new Date().toISOString()
		}));

		// Also check phase89_error_chunks collection
		const errorResponse = await fetch(`${QDRANT_URL}/collections/phase89_error_chunks/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ filter: { must: [
						{
						key: 'file_path',
							match: { value: filePath }
						}
					]
				},
				limit: 5,
				with_payload: true,
				with_vector: false
			}),
			signal: AbortSignal.timeout(10_000)
		});

		if (errorResponse.ok) {
			const errorData = await errorResponse.json();
			const errorPoints = errorData.result?.points ?? [];

			for (const point of errorPoints) {
				entries.push({
					id: point.id,
					score: 1.0,
					content: point.payload?.content ?? point.payload?.error_message ?? '',
					tags: [...(point.payload?.tags ?? []), 'error'],
					type: 'error',
					file_path: point.payload?.file_path ?? filePath,
					timestamp: point.payload?.timestamp ?? new Date().toISOString()
				});
			}
		}

		const responseData = {
			file_path: filePath,
			entries,
			total: entries.length,
			collections: ['phase76_knowledge_base', 'phase89_error_chunks']
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (error) {
		console.error('Knowledge query error:', error);
		const fallbackData = {
			file_path: filePath,
			entries: [],
			total: 0,
			collections: ['phase76_knowledge_base', 'phase89_error_chunks']
		};
		return json(fallbackData, {
			headers: cacheControl.short
		});
	}
};

