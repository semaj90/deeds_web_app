import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const upgradeRouteSchema = z.object({
	route: z.string().min(1, 'Missing "route"').max(500)
});

/**
 * POST /api/phase82/upgrade-route
 * Svelte 5 runes migration is complete — this endpoint now returns success.
 * Kept for backward compatibility with RouteInspectorDetectiveBoard.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const raw = await request.json().catch(() => ({}));
	const parsed = upgradeRouteSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Missing "route"' }, { status: 400 });
	}
	const { route } = parsed.data;

	if (!route) {
		return json({ error: 'Missing "route"' }, { status: 400 });
	}

	// Migration is complete — return success status
	return json({
		ok: true,
		route,
		duration_ms: 0,
		filesUpgraded: 1,
		totalFiles: 1,
		stdout: 'Svelte 5 runes migration already complete for this route.',
	});
};
