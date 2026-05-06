import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const schema = z.object({
	query:    z.string().min(1).max(2000),
	limit:    z.number().int().min(1).max(50).optional().default(10),
	filePath: z.string().max(500).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ success: false, error: 'Unauthorized', data: [] }, { status: 401 });

	const body = await request.json().catch(() => null);
	const parsed = schema.safeParse(body);
	if (!parsed.success) return json({ success: false, error: 'Bad request', data: [] }, { status: 400 });

	const { query, limit, filePath } = parsed.data;

	try {
		const { fetchCodebaseContext } = await import('$lib/server/ace/context-assembler.js');
		const chunks = await fetchCodebaseContext(query, locals.user.id, filePath ?? undefined);
		const limited = (chunks ?? []).slice(0, limit);
		return json({
			success: true,
			data: limited.map((c) => ({
				stableKey:  c.stableKey  ?? null,
				filePath:   c.filePath   ?? null,
				score:      c.score      ?? 0,
				topoClass:  c.topoClass  ?? null,
				content:    (c.content   ?? '').slice(0, 600),
			})),
			meta: { query, total: limited.length },
		});
	} catch (err) {
		return json({ success: false, error: String(err), data: [] }, { status: 500 });
	}
};
