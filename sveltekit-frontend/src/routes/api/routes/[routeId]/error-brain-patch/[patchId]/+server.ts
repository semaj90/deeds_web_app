/**
 * Error Brain Patch Verification API
 *
 * PUT /api/routes/:routeId/error-brain-patch/:patchId - Update patch verification status
 */

import { updatePatchVerificationStatus } from '$lib/db/queries/nes-command-center.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const VALID_STATUSES = ['pending', 'passed', 'failed'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT: RequestHandler = async ({ params, request }) => {
	const { patchId } = params;

	// Validate UUID format to avoid DB errors on non-existent IDs
	if (!UUID_RE.test(patchId)) {
		return json({ error: 'Patch not found' }, { status: 404 });
	}

	try {
		const body = await request.json();

		// Validate verification_status
		if (!body?.verification_status || !VALID_STATUSES.includes(body.verification_status)) {
			return json(
				{ error: `Invalid verification_status. Must be one of: ${VALID_STATUSES.join(', ')}` },
				{ status: 400 }
			);
		}

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