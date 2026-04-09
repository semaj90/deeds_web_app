/**
 * Error Brain Patch Verification API
 *
 * PUT /api/routes/:routeId/error-brain-patch/:patchId - Update patch verification status
 */

import { updatePatchVerificationStatus } from '$lib/db/queries/route-health-queries.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const patchVerificationSchema = z.object({
	verification_status: z.enum(['pending', 'passed', 'failed']),
	verification_message: z.string().max(5000).optional()
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { patchId } = params;

	// Validate UUID format to avoid DB errors on non-existent IDs
	if (!UUID_RE.test(patchId)) {
		return json({ error: 'Patch not found' }, { status: 404 });
	}

	try {
		const raw = await request.json();
		const parsed = patchVerificationSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid verification_status' },
				{ status: 400 }
			);
		}
		const body = parsed.data;

		const updated = await updatePatchVerificationStatus(
			patchId,
			body.verification_status,
			body.verification_message ?? null
		);

		if (!updated) {
			return json({ error: 'Patch not found' }, { status: 404 });
		}

		return json({
			id: updated.id,
			verification_status: updated.verificationStatus,
			verification_timestamp: updated.verificationTimestamp,
			verification_message: updated.verificationMessage,
		});
	} catch (err) {
		console.error('[PUT /api/routes/:routeId/error-brain-patch/:patchId] Error:', err);
		return json({ error: 'Failed to update patch verification' }, { status: 500 });
	}
};