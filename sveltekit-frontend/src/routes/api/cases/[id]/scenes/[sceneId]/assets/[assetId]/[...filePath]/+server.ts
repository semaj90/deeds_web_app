import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import { readSceneSogPackageFileV1 } from '$lib/server/scene-assets-v1.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();

export const GET: RequestHandler = async ({ locals, params }) => {
	const caseResult = uuid.safeParse(params.id);
	const sceneResult = uuid.safeParse(params.sceneId);
	const assetResult = uuid.safeParse(params.assetId);
	if (!caseResult.success || !sceneResult.success || !assetResult.success) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}
	if (!locals.user?.id) return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	const scope = { caseId: caseResult.data, sceneId: sceneResult.data, assetId: assetResult.data };
	const authorized = await getAuthorizedCase(scope.caseId, actorId);
	if (!authorized) return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene asset reads are disabled pending schema and bucket admission' }, { status: 503 });
	try {
		const result = await readSceneSogPackageFileV1({ ...scope, path: params.filePath });
		if (!result) return json({ success: false, data: null, message: 'Streamed SOG package member not found' }, { status: 404 });
		return new Response(new Uint8Array(result.bytes), { headers: {
			'content-type': result.contentType,
			'content-length': String(result.bytes.byteLength),
			'etag': `"sha256-${result.sha256}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		} });
	} catch {
		return json({ success: false, data: null, message: 'Streamed SOG package member verification failed' }, { status: 502 });
	}
};
