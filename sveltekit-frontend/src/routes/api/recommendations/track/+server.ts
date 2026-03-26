/**
 * POST /api/recommendations/track
 * Track user interactions with recommendations
 *
 * Interaction types:
 *   - 'view': Document opened in detail panel (durationSeconds tracked)
 *   - 'click': User clicked a recommendation link
 *   - 'save': User saved the document to a case
 *   - 'share': User shared the document (email, export)
 *   - 'dismiss': User dismissed the recommendation
 *
 * Request:
 *   - interactionType: 'view' | 'click' | 'save' | 'share' | 'dismiss'
 *   - documentId: string
 *   - caseId?: string
 *   - recommendationId?: string (for click/dismiss tracking)
 *   - durationSeconds?: number (for view tracking)
 *   - searchContext?: string (search query that led to this interaction)
 *   - shareMethod?: 'email' | 'export' | 'link' (for share tracking)
 *   - dismissReason?: string (for dismiss tracking)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ApiResponse } from '$lib/types/api.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { db } from '$lib/server/db/client';
import { documentTopics } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Zod schema validates interactionType enum, documentId, and optional fields
const trackInteractionSchema = z.object({
	interactionType: z.enum(['view', 'click', 'save', 'share', 'dismiss']),
	documentId: z.string().min(1, 'Missing documentId').max(500),
	caseId: z.string().max(500).optional(),
	recommendationId: z.string().max(500).optional(),
	durationSeconds: z.number().min(0).optional(),
	searchContext: z.string().max(5000).optional(),
	shareMethod: z.enum(['email', 'export', 'link']).optional(),
	dismissReason: z.string().max(5000).optional(),
});

/**
 * POST /api/recommendations/track
 * Record user interaction with a recommendation
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireAuth(event);
	const startTime = Date.now();

	try {
		// Zod schema validates interactionType enum (view|click|save|share|dismiss) and documentId
		const parsed = trackInteractionSchema.safeParse(await event.request.json());
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' },
				{ status: 400 }
			);
		}
		const body = parsed.data;

		console.log(
			`[track-interaction] User ${auth.user.id}, type=${body.interactionType}, doc=${body.documentId}`
		);

		const tracker = new UserHistoryTracker(auth.user.id);

		// Infer topic preferences from document's topic memberships
		let inferredTopics: Array<{ topicId: number; affinity: number }> = [];

		try {
			const topicMemberships = await db
				.select({
					topicId: documentTopics.topicId,
					membershipProbability: documentTopics.membershipProbability
				})
				.from(documentTopics)
				.where(eq(documentTopics.documentId, body.documentId))
				.limit(5);

			inferredTopics = topicMemberships.map((t) => ({
				topicId: t.topicId,
				affinity: t.membershipProbability
			}));
		} catch (topicError) {
			console.warn('[track-interaction] Failed to infer topics:', topicError);
			// Non-fatal: continue without topic inference
		}

		// Record interaction based on type
		switch (body.interactionType) {
			case 'view':
				await tracker.recordView(
					body.documentId,
					body.caseId || 'unknown',
					body.durationSeconds || 0,
					body.searchContext,
					inferredTopics
				);
				break;

			case 'click':
				if (!body.recommendationId) {
					return json(
						{
							success: false,
							error: 'recommendationId required for click tracking'
						},
						{ status: 400 }
					);
				}
				await tracker.recordClick(
					body.recommendationId,
					body.documentId,
					body.caseId,
					inferredTopics
				);
				break;

			case 'save':
				if (!body.caseId) {
					return json(
						{
							success: false,
							error: 'caseId required for save tracking'
						},
						{ status: 400 }
					);
				}
				await tracker.recordSave(body.documentId, body.caseId, inferredTopics);
				break;

			case 'share':
				if (!body.shareMethod) {
					return json(
						{
							success: false,
							error: 'shareMethod required for share tracking'
						},
						{ status: 400 }
					);
				}
				await tracker.recordShare(body.documentId, body.shareMethod, body.caseId, inferredTopics);
				break;

			case 'dismiss':
				if (!body.recommendationId) {
					return json(
						{
							success: false,
							error: 'recommendationId required for dismiss tracking'
						},
						{ status: 400 }
					);
				}
				await tracker.recordDismiss(body.recommendationId, body.documentId, body.dismissReason);
				break;
		}

		const processingTime = Date.now() - startTime;

		return json(
			{
				success: true,
				data: {
					interactionType: body.interactionType,
					documentId: body.documentId,
					inferredTopics
				},
				metadata: {
					timestamp: new Date().toISOString(),
					version: '1.0',
					processing_time: processingTime
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		console.error('[track-interaction] Request error:', err);
		return json(
			{
				success: false,
				error: 'Interaction tracking failed'
			},
			{ status: 500 }
		);
	}
};
