import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import { readSceneGlbV1, storeSceneGlbV1 } from '$lib/server/scene-assets-v1.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();
function parseScope(caseId: string, sceneId: string) {
	const c = uuid.safeParse(caseId);
	const s = uuid.safeParse(sceneId);
	return c.success && s.success ? { caseId: c.data, sceneId: s.data } : null;
}

async function authorize(locals: App.Locals, scope: { caseId: string; sceneId: string }) {
	if (!locals.user?.id) return { response: json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 }) };
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return { response: json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 }) };
	const authorized = await getAuthorizedCase(scope.caseId, actorId);
	if (!authorized) return { response: json({ success: false, data: null, message: 'Case not found' }, { status: 404 }) };
	return { actorId };
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const scope = parseScope(params.id, params.sceneId);
	if (!scope) return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	const access = await authorize(locals, scope);
	if ('response' in access) return access.response;
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene asset writes are disabled pending schema and bucket admission' }, { status: 503 });
	if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'model/gltf-binary') {
		return json({ success: false, data: null, message: 'Only binary GLB v2 uploads are supported' }, { status: 415 });
	}
	try {
		const asset = await storeSceneGlbV1({ ...scope, actorId: access.actorId, body: request.body, contentLength: request.headers.get('content-length') });
		return json({ success: true, data: asset, message: 'Stored and verified' }, { status: 201 });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : '';
		if (message.startsWith('SCENE_ASSET_')) return json({ success: false, data: null, message }, { status: 400 });
		console.error('[scene-assets] store failed', { caseId: scope.caseId, sceneId: scope.sceneId });
		return json({ success: false, data: null, message: 'Scene asset storage or exact-object readback failed' }, { status: 502 });
	}
};

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const scope = parseScope(params.id, params.sceneId);
	if (!scope) return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	const access = await authorize(locals, scope);
	if ('response' in access) return access.response;
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene asset reads are disabled pending schema and bucket admission' }, { status: 503 });
	const parsedAssetId = uuid.safeParse(url.searchParams.get('assetId'));
	if (!parsedAssetId.success) return json({ success: false, data: null, message: 'Invalid assetId' }, { status: 400 });
	try {
		const result = await readSceneGlbV1({ ...scope, assetId: parsedAssetId.data });
		if (!result) return json({ success: false, data: null, message: 'Scene asset not found' }, { status: 404 });
		return new Response(new Uint8Array(result.bytes), { headers: {
			'content-type': result.contentType,
			'content-length': String(result.bytes.byteLength),
			'etag': `"sha256-${result.sha256}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		} });
	} catch {
		return json({ success: false, data: null, message: 'Scene asset readback verification failed' }, { status: 502 });
	}
};
