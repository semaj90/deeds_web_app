/**
 * Error Brain Analysis API
 *
 * POST /api/routes/:routeId/error-brain-analysis - Create analysis
 */

import {
  createErrorBrainAnalysis,
  getRouteMetadata,
  upsertRouteMetadata,
} from '$lib/db/queries/route-health-queries.js';
import { isValidRouteId } from '$lib/server/validation.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const errorBrainAnalysisSchema = z.object({
	suggestions: z.array(z.unknown()).min(1, 'Missing or empty suggestions array').max(100),
	selected_suggestion_index: z.number().int().optional(),
	phase: z.enum(['suggesting', 'analyzing', 'patching', 'verifying', 'complete']).optional().default('suggesting'),
	error_message: z.string().max(5000).optional()
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { routeId } = params;
	if (!isValidRouteId(routeId)) return json({ error: 'Invalid route ID format' }, { status: 400 });

	try {
		const raw = await request.json();
		const parsed = errorBrainAnalysisSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;

		// Ensure route exists in route_metadata (auto-create for integration tests)
		let route = await getRouteMetadata(routeId);
		if (!route) {
			route = await upsertRouteMetadata({
				routeId,
				path: `/${routeId}`,
				kind: 'page',
			});
		}

		const analysis = await createErrorBrainAnalysis({
			routeId,
			suggestions: body.suggestions,
			selectedSuggestionIndex: body.selected_suggestion_index ?? null,
			phase: body.phase ?? 'suggesting',
			errorMessage: body.error_message ?? null,
		});

		return json({
			id: analysis.id,
			route_path: routeId,
			suggestions: analysis.suggestions,
			selected_suggestion_index: analysis.selectedSuggestionIndex,
			phase: analysis.phase,
			error_message: analysis.errorMessage,
			status: analysis.status,
			created_at: analysis.createdAt,
		}, { status: 201 });
	} catch (err) {
		console.error('[POST /api/routes/:routeId/error-brain-analysis] Error:', err);
		return json({ error: 'Failed to create analysis' }, { status: 500 });
	}
};