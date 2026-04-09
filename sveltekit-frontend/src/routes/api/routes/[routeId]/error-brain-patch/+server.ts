/**
 * Error Brain Patch API
 *
 * POST /api/routes/:routeId/error-brain-patch - Create patch linked to analysis
 */

import {
  createErrorBrainPatch,
  getRouteMetadata,
  upsertRouteMetadata,
} from '$lib/db/queries/route-health-queries.js';
import { isValidRouteId } from '$lib/server/validation.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const errorBrainPatchSchema = z.object({
	patch_content: z.string().min(1, 'Missing required field: patch_content').max(50000),
	analysis_id: z.string().min(1, 'Missing required field: analysis_id').max(500),
	file_path: z.string().max(1000).optional(),
	risk_level: z.string().max(50).optional()
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { routeId } = params;
	if (!isValidRouteId(routeId)) return json({ error: 'Invalid route ID format' }, { status: 400 });

	try {
		const raw = await request.json();
		const parsed = errorBrainPatchSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const body = parsed.data;

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