/**
 * Error Brain Analysis API
 *
 * POST /api/routes/:routeId/error-brain-analysis - Create analysis
 */

import {
	createErrorBrainAnalysis,
	getRouteMetadata,
	upsertRouteMetadata,
} from '$lib/db/queries/nes-command-center.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const VALID_PHASES = ['suggesting', 'analyzing', 'patching', 'verifying', 'complete'];

export const POST: RequestHandler = async ({ params, request }) => {
	const { routeId } = params;

	try {
		const body = await request.json();

		// Validate required fields
		if (!body?.suggestions || !Array.isArray(body.suggestions) || body.suggestions.length === 0) {
			return json({ error: 'Missing or empty suggestions array' }, { status: 400 });
		}

		// Validate phase if provided
		if (body.phase && !VALID_PHASES.includes(body.phase)) {
			return json({ error: `Invalid phase. Must be one of: ${VALID_PHASES.join(', ')}` }, { status: 400 });
		}

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