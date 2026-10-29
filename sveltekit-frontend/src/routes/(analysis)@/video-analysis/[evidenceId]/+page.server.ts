import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases, evidenceItems } from '$lib/server/db/schema/index.js';
import { requireOwnedEvidenceCaseV1 } from '$lib/server/evidence-case-admission-v1.js';

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
		const [videoEvidence] = await db
			.select({ id: evidenceItems.id, caseId: evidenceItems.caseId, metadataJson: evidenceItems.metadataJson })
			.from(evidenceItems)
			.where(and(eq(evidenceItems.id, evidenceId), eq(evidenceItems.modality, 'video')))
			.limit(1);

		if (!videoEvidence) {
			return { loadError: 'Video evidence not found', evidenceId: null, title: null };
		}

		const ownerId = Number(locals.user?.id);
		await requireOwnedEvidenceCaseV1(videoEvidence.caseId, ownerId, async (caseId, userId) => {
			const [ownedCase] = await db
				.select({ id: cases.id })
				.from(cases)
				.where(and(eq(cases.id, caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))))
				.limit(1);
			return ownedCase?.id ?? null;
		});
		const metadata = videoEvidence.metadataJson && typeof videoEvidence.metadataJson === 'object'
			? videoEvidence.metadataJson as Record<string, unknown>
			: {};

		// Return minimal data - full data fetched by client via API
		return {
			evidenceId,
			title: typeof metadata.title === 'string' ? metadata.title : String(metadata.originalFileName ?? 'Video evidence'),
			loadError: null
		};
	} catch (error) {
		console.error('Error loading video evidence:', error);
		return { loadError: 'Failed to load video evidence', evidenceId: null, title: null };
	}
};
