/**
 * POST /api/cases/[id]/scenes/[sceneKey]/markers
 *
 * Creates a marker (client supplies markerId and commandId). Same auth rule as the PATCH move:
 * an authenticated user who owns the case, or an admin. Response envelope: { success, data, message }.
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import {
	CommandReuseError,
	EvidenceNotInCaseError,
	createMarker,
	listSceneMarkers
} from '$lib/server/scene-markers/move-marker.js';
import { authorizeSceneAccess } from '$lib/server/scene-markers/scene-access-v1.js';
import { anchorProvenanceSchema, markerAnchorSchema } from '$lib/server/scene-markers/marker-anchor-v1.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();

const createBody = z
	.object({
		markerId: uuid,
		commandId: uuid,
		evidenceId: uuid,
		label: z.string().max(500).nullable().default(null),
		position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
		// Optional anchor (MARK-01). Omitted = positional marker, exactly as before.
		anchor: markerAnchorSchema.nullable().default(null),
		provenance: anchorProvenanceSchema.default({ sourceRevision: null, sourceSha256: null })
	})
	.strict();

/** GET: saved markers for one scene (hydration on reopen). Same ownership rule as writes. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	}
	const caseId = uuid.safeParse(params.id);
	const sceneKey = params.sceneKey ?? '';
	if (!caseId.success || sceneKey.length < 1 || sceneKey.length > 200) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}
	const access = await authorizeSceneAccess(locals, caseId.data);
	if (access.ok === false) return json({ success: false, data: null, message: access.message }, { status: access.status });
	try {
		const markers = await listSceneMarkers(db, caseId.data, sceneKey);
		return json({ success: true, data: { markers }, message: 'OK' });
	} catch {
		console.error('[scene-markers] list failed', { caseId: caseId.data });
		return json({ success: false, data: null, message: 'Load failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	}

	const caseId = uuid.safeParse(params.id);
	const sceneKey = params.sceneKey ?? '';
	if (!caseId.success || sceneKey.length < 1 || sceneKey.length > 200) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ success: false, data: null, message: 'Invalid JSON payload' }, { status: 400 });
	}
	const parsed = createBody.safeParse(raw);
	if (!parsed.success) {
		return json(
			{ success: false, data: null, message: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 }
		);
	}

	const access = await authorizeSceneAccess(locals, caseId.data);
	if (access.ok === false) return json({ success: false, data: null, message: access.message }, { status: access.status });
	const userId = access.userId;

	try {
		const result = await createMarker(db, {
			caseId: caseId.data,
			sceneKey,
			markerId: parsed.data.markerId,
			evidenceId: parsed.data.evidenceId,
			commandId: parsed.data.commandId,
			position: parsed.data.position,
			label: parsed.data.label,
			userId: Number.isNaN(userId) ? 0 : userId,
			anchor: parsed.data.anchor,
			sourceRevision: parsed.data.provenance.sourceRevision,
			sourceSha256: parsed.data.provenance.sourceSha256
		});
		return json({ success: true, data: result, message: result.replayed ? 'Replayed' : 'Created' }, {
			status: result.replayed ? 200 : 201
		});
	} catch (err) {
		if (err instanceof CommandReuseError) {
			return json({ success: false, data: null, message: 'commandId already used' }, { status: 409 });
		}
		if (err instanceof EvidenceNotInCaseError) {
			return json({ success: false, data: null, message: 'Evidence is not an active exhibit of this case' }, { status: 422 });
		}
		console.error('[scene-markers] create failed', { caseId: caseId.data });
		return json({ success: false, data: null, message: 'Save failed' }, { status: 500 });
	}
};
