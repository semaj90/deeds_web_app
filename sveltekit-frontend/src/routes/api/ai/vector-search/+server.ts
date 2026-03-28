import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const bodySchema = z.object({
	query: z.string().min(1).max(10000),
	limit: z.number().min(1).max(50).default(10),
	threshold: z.number().min(0).max(1).default(0.5)
});

/**
 * POST /api/ai/vector-search — Alias for /api/vector-search
 * Delegates to the main vector-search endpoint for consistency.
 */
export const POST: RequestHandler = async ({ request, fetch: kitFetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = bodySchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;
		const res = await kitFetch('/api/vector-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json();
		return json(data, { status: res.status });
	} catch (err) {
		console.error('[/api/ai/vector-search] proxy error:', err);
		return json([], { status: 500 });
	}
};