/**
 * Error Brain Patch Verification API
 *
 * PUT /api/routes/:routeId/error-brain-patch/:patchId - Update patch verification status
 */

import { updatePatchVerificationStatus } from '$lib/db/queries/route-health-queries.js';
import { isValidRouteId } from '$lib/server/validation.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

// 'passed' is intentionally NOT accepted from callers. It may only be set by a
// server-owned verifier that validates a matching test receipt (not yet wired).
const patchVerificationSchema = z.object({
	verification_status: z.enum(['pending', 'passed', 'failed']),
	verification_message: z.string().max(5000).optional()
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { routeId, patchId } = params;
	if (!routeId || !isValidRouteId(routeId)) {
		return json({ error: 'Invalid route ID format' }, { status: 400 });
	}

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

		if (body.verification_status === 'passed') {
			return json(
				{
					error: 'VERIFICATION_RECEIPT_REQUIRED',
					message:
						'A patch can only be marked passed by the server-side verifier from a validated test receipt.'
				},
				{ status: 403 }
			);
		}

		const updated = await updatePatchVerificationStatus(
			patchId,
			body.verification_status,
			body.verification_message,
			routeId
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