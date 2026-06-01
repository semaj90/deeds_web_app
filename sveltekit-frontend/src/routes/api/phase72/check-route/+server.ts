import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const bodySchema = z.object({
	route: z.string().max(500),
	file_path: z.string().max(1000).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
	}

	return json({ ok: true, route: parsed.data.route, status: 'healthy' });
};
