import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import { appendSceneDocumentRevisionV1, readSceneDocumentRevisionV1, sceneRevisionCommandV1Schema } from '$lib/server/scene-document-revisions-v1.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();
const parseScope = (id: string, sceneId: string) => {
	const caseResult = uuid.safeParse(id);
	const sceneResult = uuid.safeParse(sceneId);
	return caseResult.success && sceneResult.success ? { caseId: caseResult.data, sceneId: sceneResult.data } : null;
};

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user?.id) return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	const scope = parseScope(params.id, params.sceneId);
	if (!scope) return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	const actorId = Number(locals.user.id);
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(scope.caseId, actorId);
	} catch {
		return json({ success: false, data: null, message: 'Case authorization failed' }, { status: 500 });
	}
	if (!authorized) return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene persistence is disabled pending schema admission' }, { status: 503 });
	const revisionParam = url.searchParams.get('revision');
	const revision = revisionParam === null ? undefined : Number(revisionParam);
	if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) {
		return json({ success: false, data: null, message: 'Invalid revision' }, { status: 400 });
	}
	try {
		const row = await readSceneDocumentRevisionV1({ ...scope, revision });
		return json({ success: true, data: row ? { revision: row.revision, manifestSha256: row.manifestSha256, manifest: row.manifest } : null, message: row ? 'OK' : 'No scene revision' });
	} catch {
		return json({ success: false, data: null, message: 'Scene revision load failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user?.id) return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	const scope = parseScope(params.id, params.sceneId);
	if (!scope) return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	const actorId = Number(locals.user.id);
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(scope.caseId, actorId);
	} catch {
		return json({ success: false, data: null, message: 'Case authorization failed' }, { status: 500 });
	}
	if (!authorized) return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene persistence is disabled pending schema admission' }, { status: 503 });
	let body: unknown;
	try { body = await request.json(); } catch { return json({ success: false, data: null, message: 'Invalid JSON payload' }, { status: 400 }); }
	const command = sceneRevisionCommandV1Schema.safeParse(body);
	if (!command.success) return json({ success: false, data: null, message: command.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 });
	try {
		const result = await appendSceneDocumentRevisionV1({ ...scope, actorId, command: command.data });
		return json({ success: true, data: result, message: result.replayed ? 'Replayed' : 'Saved' }, { status: result.replayed ? 200 : 201 });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Scene revision save failed';
		if (message === 'SCENE_REVISION_CONFLICT' || message === 'SCENE_REVISION_PARENT_HASH_MISMATCH' || message === 'SCENE_REVISION_COMMAND_REUSE') {
			return json({ success: false, data: null, message }, { status: 409 });
		}
		if (message.startsWith('SCENE_REVISION_')) return json({ success: false, data: null, message }, { status: 400 });
		console.error('[scene-revisions] append failed', { caseId: scope.caseId, sceneId: scope.sceneId });
		return json({ success: false, data: null, message: 'Scene revision save failed' }, { status: 500 });
	}
};
