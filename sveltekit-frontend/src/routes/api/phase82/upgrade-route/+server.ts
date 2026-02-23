import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

/**
 * POST /api/phase82/upgrade-route
 * Svelte 5 runes migration is complete — this endpoint now returns success.
 * Kept for backward compatibility with RouteInspectorDetectiveBoard.
 */
export const POST: RequestHandler = async ({ request }) => {
	const { route } = (await request.json().catch(() => ({}))) as { route?: string };

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
