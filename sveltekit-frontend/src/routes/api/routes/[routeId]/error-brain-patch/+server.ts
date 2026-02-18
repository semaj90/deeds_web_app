/**
 * Error Brain Patch API
 *
 * POST /api/routes/:routeId/error-brain-patch - Create patch linked to analysis
 */

import {
	createErrorBrainPatch,
	getRouteMetadata,
	upsertRouteMetadata,
} from '$lib/db/queries/nes-command-center.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, request }) => {
	const { routeId } = params;

	try {
		const body = await request.json();

		// Validate required fields
		if (!body?.patch_content) {
			return json({ error: 'Missing required field: patch_content' }, { status: 400 });
		}
		if (!body?.analysis_id) {
			return json({ error: 'Missing required field: analysis_id' }, { status: 400 });
		}

		// Ensure route exists
		let route = await getRouteMetadata(routeId);
		if (!route) {
			route = await upsertRouteMetadata({
				routeId,
				path: `/${routeId}`,
				kind: 'page',
			});
		}

		const patch = await createErrorBrainPatch({
			analysisId: body.analysis_id,
			routeId,
			patchContent: body.patch_content,
			filePath: body.file_path ?? null,
		});

		return json({
			id: patch.id,
			route_path: routeId,
			file_path: patch.filePath,
			patch_content: patch.patchContent,
			analysis_id: patch.analysisId,
			verification_status: patch.verificationStatus ?? 'pending',
			risk_level: body.risk_level ?? null,
			created_at: patch.createdAt,
		}, { status: 201 });
	} catch (err) {
		console.error('[POST /api/routes/:routeId/error-brain-patch] Error:', err);
		return json({ error: 'Failed to create patch' }, { status: 500 });
	}
};