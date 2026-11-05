import { createHash } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { EVIDENCE_BUCKET, assertEvidenceBucket } from '$lib/server/storage/storage-buckets.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { createMarker, deleteMarker, listSceneMarkers, MarkerConflictError, MarkerNotFoundError, moveMarker } from '$lib/server/scene-markers/move-marker.js';
import { SPZ_DEFAULT_MAX_SOURCE_BYTES } from '$lib/splat/spz-loader.js';
import { isUuid } from '$lib/server/validation.js';
import type { RequestHandler } from './$types';

const sourceDigest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const position = z.object({ x: coordinate, y: coordinate, z: coordinate }).strict();
const createBody = z.object({
	markerId: z.uuid(), commandId: z.uuid(), expectedSourceSha256: sourceDigest,
	label: z.string().max(500).nullable().default(null), position,
}).strict();
const moveBody = z.object({
	markerId: z.uuid(), commandId: z.uuid(), expectedRevision: z.number().int().min(1),
	expectedSourceSha256: sourceDigest, position,
}).strict();
const deleteBody = z.object({
	markerId: z.uuid(), commandId: z.uuid(), expectedRevision: z.number().int().min(1),
	expectedSourceSha256: sourceDigest,
}).strict();

const emptyData = { sourceSha256: null, markers: [] };
const fail = (error: string, status: number) => json({ success: false, error, data: emptyData }, { status });

function objectReference(fileUrl: string) {
	if (fileUrl.startsWith('seaweed://') || fileUrl.startsWith('minio://')) {
		const rest = fileUrl.slice(fileUrl.indexOf('://') + 3);
		const slash = rest.indexOf('/');
		if (slash <= 0 || slash === rest.length - 1) return null;
		return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
	}
	if (!fileUrl.includes('/') || fileUrl.startsWith('/') || fileUrl.includes('..') || fileUrl.includes('\\')) return null;
	return { bucket: EVIDENCE_BUCKET, key: fileUrl };
}

async function authorizedSource(caseIdValue: string | null, evidenceId: string, user: App.Locals['user']) {
	if (!user?.id) return { error: 'UNAUTHORIZED' as const, status: 401 };
	if (!caseIdValue || !isUuid(caseIdValue) || !isUuid(evidenceId)) return { error: 'INVALID_IDENTIFIERS' as const, status: 400 };
	const actorId = Number(user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return { error: 'UNAUTHORIZED' as const, status: 401 };
	const caseRow = await getAuthorizedCase(caseIdValue, actorId);
	if (!caseRow) return { error: 'EVIDENCE_NOT_FOUND' as const, status: 404 };
	const [item] = await db.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash, fileName: evidence.fileName, fileUrl: evidence.fileUrl })
		.from(evidence).where(and(eq(evidence.id, evidenceId), eq(evidence.caseId, caseRow.id))).limit(1);
	if (!item || !item.fileName?.toLowerCase().endsWith('.spz')) return { error: 'EVIDENCE_NOT_FOUND' as const, status: 404 };
	if (!sourceDigest.safeParse(item.hash).success) return { error: 'SOURCE_HASH_UNAVAILABLE' as const, status: 409 };
	const ref = item.fileUrl ? objectReference(item.fileUrl) : null;
	if (!ref || ref.bucket !== EVIDENCE_BUCKET || !ref.key.startsWith('evidence/') || ref.key.includes('..') || ref.key.includes('\\')) {
		return { error: 'EVIDENCE_OBJECT_REFERENCE_INVALID' as const, status: 409 };
	}
	try {
		assertEvidenceBucket(ref.bucket);
		const bytes = await getFileFromSeaweed({ objectKey: ref.key, bucket: ref.bucket, maximumBytes: SPZ_DEFAULT_MAX_SOURCE_BYTES });
		const actualHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		if (actualHash !== item.hash) return { error: 'SOURCE_BYTES_HASH_MISMATCH' as const, status: 409 };
	} catch {
		return { error: 'SOURCE_OBJECT_UNAVAILABLE' as const, status: 503 };
	}
	return {
		caseId: caseRow.id,
		evidenceId: item.id,
		sourceSha256: item.hash as string,
		sceneKey: `spz:v1:${item.id}:${item.hash}`,
		actorId,
	};
}

/** Case/evidence-bound 3D anchors. Access is checked before marker reads or writes. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	try {
		const source = await authorizedSource(url.searchParams.get('caseId'), params.id ?? '', locals.user);
		if ('error' in source) return fail(source.error, source.status);
		const markers = await listSceneMarkers(db, source.caseId, source.sceneKey);
		return json({ success: true, error: null, data: { sourceSha256: source.sourceSha256, markers } }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (cause) {
		console.error('[spz-markers] list failed', cause instanceof Error ? cause.message : 'unknown error');
		return fail('SPZ_MARKERS_UNAVAILABLE', 503);
	}
};

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	const source = await authorizedSource(url.searchParams.get('caseId'), params.id ?? '', locals.user);
	if ('error' in source) return fail(source.error, source.status);
	let raw: unknown;
	try { raw = await request.json(); } catch { return fail('INVALID_JSON', 400); }
	const parsed = createBody.safeParse(raw);
	if (!parsed.success) return fail('INVALID_INPUT', 400);
	if (parsed.data.expectedSourceSha256 !== source.sourceSha256) return fail('SOURCE_REVISION_STALE', 409);
	try {
		const result = await createMarker(db, {
			caseId: source.caseId, sceneKey: source.sceneKey, markerId: parsed.data.markerId,
			evidenceId: source.evidenceId, commandId: parsed.data.commandId,
			position: parsed.data.position, label: parsed.data.label, userId: source.actorId,
		});
		return json({ success: true, error: null, data: { ...result, sourceSha256: source.sourceSha256 } }, { status: result.replayed ? 200 : 201 });
	} catch (cause) {
		console.error('[spz-markers] create failed', cause instanceof Error ? cause.message : 'unknown error');
		return fail('SPZ_MARKER_SAVE_FAILED', 503);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	const source = await authorizedSource(url.searchParams.get('caseId'), params.id ?? '', locals.user);
	if ('error' in source) return fail(source.error, source.status);
	let raw: unknown;
	try { raw = await request.json(); } catch { return fail('INVALID_JSON', 400); }
	const parsed = moveBody.safeParse(raw);
	if (!parsed.success) return fail('INVALID_INPUT', 400);
	if (parsed.data.expectedSourceSha256 !== source.sourceSha256) return fail('SOURCE_REVISION_STALE', 409);
	try {
		const result = await moveMarker(db, {
			caseId: source.caseId, sceneKey: source.sceneKey, markerId: parsed.data.markerId,
			evidenceId: source.evidenceId, commandId: parsed.data.commandId,
			expectedRevision: parsed.data.expectedRevision, position: parsed.data.position,
			userId: source.actorId,
		});
		return json({ success: true, error: null, data: { ...result, sourceSha256: source.sourceSha256 } });
	} catch (cause) {
		console.error('[spz-markers] move failed', cause instanceof Error ? cause.message : 'unknown error');
		return fail('SPZ_MARKER_MOVE_FAILED', 503);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	const source = await authorizedSource(url.searchParams.get('caseId'), params.id ?? '', locals.user);
	if ('error' in source) return fail(source.error, source.status);
	let raw: unknown;
	try { raw = await request.json(); } catch { return fail('INVALID_JSON', 400); }
	const parsed = deleteBody.safeParse(raw);
	if (!parsed.success) return fail('INVALID_INPUT', 400);
	if (parsed.data.expectedSourceSha256 !== source.sourceSha256) return fail('SOURCE_REVISION_STALE', 409);
	try {
		const result = await deleteMarker(db, {
			caseId: source.caseId, sceneKey: source.sceneKey, markerId: parsed.data.markerId,
			evidenceId: source.evidenceId, commandId: parsed.data.commandId,
			expectedRevision: parsed.data.expectedRevision, userId: source.actorId,
		});
		return json({ success: true, error: null, data: { ...result, sourceSha256: source.sourceSha256 } });
	} catch (cause) {
		console.error('[spz-markers] delete failed', cause instanceof Error ? cause.message : 'unknown error');
		if (cause instanceof MarkerConflictError) return fail('MARKER_CONFLICT', 409);
		if (cause instanceof MarkerNotFoundError) return fail('MARKER_NOT_FOUND', 404);
		return fail('SPZ_MARKER_DELETE_FAILED', 503);
	}
};
