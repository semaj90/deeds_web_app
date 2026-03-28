/**
 * Error Brain Analyses History API
 *
 * GET /api/routes/:routeId/error-brain-analyses - List analyses with pagination + nested patches
 */

import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/db/pool.js';
import {
	errorBrainAnalysis,
	errorBrainPatch,
} from '$lib/db/schema/nes-command-center.js';
import { isValidRouteId } from '$lib/server/validation.js';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types.js';

const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0)
});

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { routeId } = params;
	if (!isValidRouteId(routeId)) return json({ error: 'Invalid route ID format' }, { status: 400 });

	try {
		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		const { limit, offset } = parsed.success ? parsed.data : { limit: 20, offset: 0 };
		const db = getDb();

		// Get analyses with pagination
		const analyses = await db
			.select()
			.from(errorBrainAnalysis)
			.where(eq(errorBrainAnalysis.routeId, routeId))
			.orderBy(desc(errorBrainAnalysis.createdAt))
			.limit(limit)
			.offset(offset);

		// Get total count
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(errorBrainAnalysis)
			.where(eq(errorBrainAnalysis.routeId, routeId));
		const total = Number(countResult[0]?.count ?? 0);

		// Get patches for each analysis
		const data = await Promise.all(
			analyses.map(async (a) => {
				const patches = await db
					.select()
					.from(errorBrainPatch)
					.where(eq(errorBrainPatch.analysisId, a.id))
					.orderBy(desc(errorBrainPatch.createdAt));

				return {
					id: a.id,
					route_path: a.routeId,
					suggestions: a.suggestions,
					selected_suggestion_index: a.selectedSuggestionIndex,
					phase: a.phase,
					error_message: a.errorMessage,
					status: a.status,
					created_at: a.createdAt,
					patches: patches.map((p) => ({
						id: p.id,
						route_path: p.routeId,
						file_path: p.filePath,
						patch_content: p.patchContent,
						analysis_id: p.analysisId,
						verification_status: p.verificationStatus ?? 'pending',
						verification_timestamp: p.verificationTimestamp,
						verification_message: p.verificationMessage,
						created_at: p.createdAt,
					})),
				};
			})
		);

		return json({ data, total, limit, offset });
	} catch (err) {
		console.error('[GET /api/routes/:routeId/error-brain-analyses] Error:', err);
		return json({ error: 'Failed to fetch analyses' }, { status: 500 });
	}
};