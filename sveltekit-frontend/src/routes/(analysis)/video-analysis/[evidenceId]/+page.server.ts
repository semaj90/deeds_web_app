import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Auth check (respects DEV_BYPASS_AUTH)
	if (!locals.user && process.env.DEV_BYPASS_AUTH !== 'true') {
		throw redirect(303, '/login');
	}

	const { evidenceId } = params;

	// Validate UUID format
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(evidenceId)) {
		return { loadError: 'Invalid evidence ID format', evidenceId: null, title: null };
	}

	try {
		const query = `
			SELECT id, title, evidence_type
			FROM evidence
			WHERE id = $1
			LIMIT 1
		`;

		const result = await db.execute(query, [evidenceId]);
		const rows = (result as any).rows;

		if (!rows || rows.length === 0) {
			return { loadError: 'Video evidence not found', evidenceId: null, title: null };
		}

		const videoEvidence = rows[0];

		// Verify it's video evidence
		if (videoEvidence.evidence_type !== 'video') {
			return {
				loadError: 'Evidence is not a video file',
				evidenceId: null,
				title: null
			};
		}

		// Return minimal data - full data fetched by client via API
		return {
			evidenceId,
			title: videoEvidence.title,
			loadError: null
		};
	} catch (error) {
		console.error('Error loading video evidence:', error);
		return { loadError: 'Failed to load video evidence', evidenceId: null, title: null };
	}
};
