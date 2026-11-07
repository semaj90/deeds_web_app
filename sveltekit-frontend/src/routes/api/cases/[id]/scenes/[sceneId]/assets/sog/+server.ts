import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import { readBoundedSceneAssetRequestV1, SCENE_SOG_PACKAGE_MAX_BYTES, SCENE_SOG_PACKAGE_MAX_FILES, sha256Bytes, storeSceneSogPackageV1 } from '$lib/server/scene-assets-v1.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();
const receiptSchema = z.array(z.object({
	path: z.string().min(1).max(500),
	bytes: z.number().int().positive().max(64 * 1024 * 1024),
	sha256: z.string().regex(/^[a-f0-9]{64}$/i)
}).strict()).min(1).max(SCENE_SOG_PACKAGE_MAX_FILES);
const MAX_MULTIPART_OVERHEAD_BYTES = 8 * 1024 * 1024;

function parseScope(caseId: string, sceneId: string) {
	const c = uuid.safeParse(caseId);
	const s = uuid.safeParse(sceneId);
	return c.success && s.success ? { caseId: c.data, sceneId: s.data } : null;
}

async function authorize(locals: App.Locals, scope: { caseId: string; sceneId: string }) {
	if (!locals.user?.id) return { response: json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 }) };
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return { response: json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 }) };
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(scope.caseId, actorId);
	} catch {
		return { response: json({ success: false, data: null, message: 'Case authorization failed' }, { status: 500 }) };
	}
	if (!authorized) return { response: json({ success: false, data: null, message: 'Case not found' }, { status: 404 }) };
	return { actorId };
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const scope = parseScope(params.id, params.sceneId);
	if (!scope) return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	const access = await authorize(locals, scope);
	if ('response' in access) return access.response;
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene SOG writes are disabled pending schema and bucket admission' }, { status: 503 });
	if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'multipart/form-data') {
		return json({ success: false, data: null, message: 'Streamed SOG package requires multipart/form-data' }, { status: 415 });
	}
	const contentLength = Number(request.headers.get('content-length'));
	if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > SCENE_SOG_PACKAGE_MAX_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
		return json({ success: false, data: null, message: 'Invalid or missing bounded Content-Length' }, { status: 413 });
	}
	try {
		const boundedBody = await readBoundedSceneAssetRequestV1(request.body, contentLength, SCENE_SOG_PACKAGE_MAX_BYTES + MAX_MULTIPART_OVERHEAD_BYTES);
		const formRequest = new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type')! }, body: boundedBody });
		const form = await formRequest.formData();
		const rawReceipt = form.get('receipt');
		if (typeof rawReceipt !== 'string') return json({ success: false, data: null, message: 'Package receipt is required' }, { status: 400 });
		let parsedReceipt: z.infer<typeof receiptSchema>;
		try { parsedReceipt = receiptSchema.parse(JSON.parse(rawReceipt)); }
		catch { return json({ success: false, data: null, message: 'Package receipt is invalid' }, { status: 400 }); }

		const expected = new Map(parsedReceipt.map((file) => [`file:${file.path}`, file]));
		if (expected.size !== parsedReceipt.length) return json({ success: false, data: null, message: 'Package receipt contains duplicate paths' }, { status: 400 });
		const files: Array<{ path: string; bytes: Uint8Array }> = [];
		let totalBytes = 0;
		for (const [name, value] of form.entries()) {
			if (name === 'receipt') continue;
			const receipt = expected.get(name);
			if (!receipt || typeof value === 'string') return json({ success: false, data: null, message: 'Multipart package members do not match the receipt' }, { status: 400 });
			const bytes = new Uint8Array(await value.arrayBuffer());
			if (bytes.byteLength !== receipt.bytes || sha256Bytes(bytes).toLowerCase() !== receipt.sha256.toLowerCase()) {
				return json({ success: false, data: null, message: 'Package member bytes differ from receipt' }, { status: 400 });
			}
			totalBytes += bytes.byteLength;
			if (totalBytes > SCENE_SOG_PACKAGE_MAX_BYTES) return json({ success: false, data: null, message: 'Package exceeds the 64 MiB admission budget' }, { status: 413 });
			files.push({ path: receipt.path, bytes });
			expected.delete(name);
		}
		if (expected.size || files.length !== parsedReceipt.length) return json({ success: false, data: null, message: 'Multipart package is incomplete' }, { status: 400 });
		const asset = await storeSceneSogPackageV1({ ...scope, actorId: access.actorId, files });
		return json({ success: true, data: asset, message: 'Streamed SOG package stored and verified' }, { status: 201 });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : '';
		if (message === 'SCENE_ASSET_BYTE_LIMIT_EXCEEDED') return json({ success: false, data: null, message }, { status: 413 });
		if (message.startsWith('SCENE_SOG_') || message.startsWith('SCENE_ASSET_') || message.startsWith('SOG_')) return json({ success: false, data: null, message }, { status: 400 });
		console.error('[scene-assets] SOG package store failed', { caseId: scope.caseId, sceneId: scope.sceneId });
		return json({ success: false, data: null, message: 'Streamed SOG storage or readback verification failed' }, { status: 502 });
	}
};
