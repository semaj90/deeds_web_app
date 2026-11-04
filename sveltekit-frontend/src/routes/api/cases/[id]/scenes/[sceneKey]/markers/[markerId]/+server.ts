/**
 * PATCH /api/cases/[id]/scenes/[sceneKey]/markers/[markerId]
 *
 * Commits one marker move (pointer release, not per frame). Requires an authenticated user
 * who owns the case (or is an admin). Body: commandId, evidenceId, expectedRevision, position.
 * Response envelope: { success, data | null, message }.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { cases } from '$lib/server/db/schema-postgres.js';
import {
	CommandReuseError,
	EvidenceMismatchError,
	MarkerConflictError,
	MarkerNotFoundError,
	moveMarker
} from '$lib/server/scene-markers/move-marker.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();

const moveBody = z
	.object({
		commandId: uuid,
		evidenceId: uuid,
		expectedRevision: z.number().int().min(1),
		position: z.object({ x: z.number(), y: z.number(), z: z.number() })
	})
	.strict();

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	}

	const caseId = uuid.safeParse(params.id);
	const markerId = uuid.safeParse(params.markerId);
	const sceneKey = params.sceneKey ?? '';
	if (!caseId.success || !markerId.success || sceneKey.length < 1 || sceneKey.length > 200) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ success: false, data: null, message: 'Invalid JSON payload' }, { status: 400 });
	}
	const parsed = moveBody.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ success: false, data: null, message: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 }
		);
	}

	const [owner] = await db
		.select({ userId: cases.userId })
		.from(cases)
		.where(eq(cases.id, caseId.data))
		.limit(1);
	if (!owner) {
		return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	}

	const userId = Number(locals.user.id);
	const isAdmin = locals.user.role === 'admin';
	if (!isAdmin && (Number.isNaN(userId) || owner.userId !== userId)) {
		return json({ success: false, data: null, message: 'Forbidden' }, { status: 403 });
	}

	try {
		const result = await moveMarker(db, {
			caseId: caseId.data,
			sceneKey,
			markerId: markerId.data,
			evidenceId: parsed.data.evidenceId,
			commandId: parsed.data.commandId,
			expectedRevision: parsed.data.expectedRevision,
			position: parsed.data.position,
			userId: Number.isNaN(userId) ? 0 : userId
		});
		return json({ success: true, data: result, message: 'Committed' });
	} catch (err) {
		if (err instanceof MarkerConflictError) {
			return json(
				{ success: false, data: { currentRevision: err.currentRevision }, message: 'MARKER_CONFLICT' },
				{ status: 409 }
			);
		}
		if (err instanceof MarkerNotFoundError) {
			return json({ success: false, data: null, message: 'Marker not found' }, { status: 404 });
		}
		if (err instanceof EvidenceMismatchError) {
			return json({ success: false, data: null, message: 'Evidence does not match marker' }, { status: 422 });
		}
		if (err instanceof CommandReuseError) {
			return json({ success: false, data: null, message: 'commandId already used' }, { status: 409 });
		}
		console.error('[scene-markers] move failed', { caseId: caseId.data, markerId: markerId.data });
		return json({ success: false, data: null, message: 'Save failed' }, { status: 500 });
	}
};
