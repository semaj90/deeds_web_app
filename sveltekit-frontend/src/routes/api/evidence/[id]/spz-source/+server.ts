import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { EVIDENCE_BUCKET, assertEvidenceBucket } from '$lib/server/storage/storage-buckets.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { SPZ_DEFAULT_MAX_SOURCE_BYTES } from '$lib/splat/spz-loader.js';
import { SpzEvidenceSourceError, verifySpzEvidenceSourceV1 } from '$lib/server/splat/evidence-source-v1.js';
import { isUuid } from '$lib/server/validation.js';
import { ENV } from '$lib/server/env.server.js';
import { readSceneDocumentRevisionV1 } from '$lib/server/scene-document-revisions-v1.js';
import { admitSpzSceneV1, SceneAdmissionError } from '$lib/server/splat/scene-admission-v1.js';

const failure = (error: string, status: number) => json({ success: false, error, asset: null }, { status });

function evidenceObjectRef(fileUrl: string): { bucket: string; key: string } | null {
	if (fileUrl.startsWith('seaweed://') || fileUrl.startsWith('minio://')) {
		const rest = fileUrl.slice(fileUrl.indexOf('://') + 3);
		const slash = rest.indexOf('/');
		if (slash <= 0 || slash === rest.length - 1) return null;
		return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
	}
	// Legacy rows may store only the object key. External URLs are deliberately rejected.
	if (!fileUrl.includes('/') || fileUrl.startsWith('/') || fileUrl.includes('..')) return null;
	return { bucket: EVIDENCE_BUCKET, key: fileUrl };
}

/** Read-only source admission for an SPZ already registered as case evidence. */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user?.id) return failure('UNAUTHORIZED', 401);
	if (!isUuid(params.id)) return failure('INVALID_EVIDENCE_ID', 400);
	const caseId = url.searchParams.get('caseId');
	if (!caseId || !isUuid(caseId)) return failure('INVALID_CASE_ID', 400);
	const sceneId = url.searchParams.get('sceneId');
	const revisionText = url.searchParams.get('revision');
	if ((sceneId === null) !== (revisionText === null)) return failure('SCENE_REVISION_SCOPE_REQUIRED', 400);
	if (sceneId !== null && (!isUuid(sceneId) || !/^[1-9]\d*$/.test(revisionText ?? ''))) return failure('SCENE_REVISION_SCOPE_INVALID', 400);
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return failure('UNAUTHORIZED', 401);

	try {
		// Prove case access before reading the evidence row or storage locator.
		const authorizedCase = await getAuthorizedCase(caseId, actorId);
		if (!authorizedCase) return failure('EVIDENCE_NOT_FOUND', 404);
		if (sceneId !== null && !ENV.SCENE_PERSISTENCE_ENABLED) return failure('SCENE_PERSISTENCE_DISABLED', 503);

		const [item] = await db
			.select({ id: evidence.id, caseId: evidence.caseId, fileUrl: evidence.fileUrl, fileName: evidence.fileName, fileType: evidence.fileType, mimeType: evidence.mimeType, hash: evidence.hash })
			.from(evidence)
			.where(and(eq(evidence.id, params.id), eq(evidence.caseId, authorizedCase.id)))
			.limit(1);
		if (!item?.fileUrl) return failure('EVIDENCE_NOT_FOUND', 404);
		const sceneRevision = sceneId === null ? null : await readSceneDocumentRevisionV1({ caseId: authorizedCase.id, sceneId, revision: Number(revisionText) });
		if (sceneId !== null && !sceneRevision) return failure('SCENE_REVISION_NOT_FOUND', 404);
		const ref = evidenceObjectRef(item.fileUrl);
		if (!ref || ref.bucket !== EVIDENCE_BUCKET || !ref.key.startsWith('evidence/') || ref.key.includes('..') || ref.key.includes('\\')) {
			return failure('EVIDENCE_OBJECT_REFERENCE_INVALID', 409);
		}
		assertEvidenceBucket(ref.bucket);

		const bytes = await getFileFromSeaweed({ objectKey: ref.key, bucket: ref.bucket, maximumBytes: SPZ_DEFAULT_MAX_SOURCE_BYTES });
		const verified = verifySpzEvidenceSourceV1({
			fileName: item.fileName,
			mimeType: item.mimeType ?? item.fileType,
			expectedSha256: item.hash,
			bytes,
		});
		const sceneAdmission = sceneRevision ? admitSpzSceneV1({
			caseId: authorizedCase.id,
			sceneId: sceneId!,
			revision: Number(revisionText),
			manifest: sceneRevision.manifest,
			source: {
				caseId: authorizedCase.id,
				evidenceId: item.id,
				sourceRevision: item.hash ?? '',
				sourceSha256: verified.sourceSha256.slice('sha256:'.length),
				mimeType: item.mimeType ?? item.fileType,
				byteLength: verified.byteLength,
				decodedByteLength: verified.decodedByteLength,
				pointCount: verified.pointCount,
			}
		}) : null;
		return json({
			success: true,
			error: null,
			asset: {
				evidenceId: item.id,
				caseId: authorizedCase.id,
				sourceSha256: verified.sourceSha256,
				byteLength: verified.byteLength,
				pointCount: verified.pointCount,
				shDegree: verified.shDegree,
				admission: sceneAdmission?.status ?? 'SOURCE_VERIFIED',
				sceneAdmission,
				// Case-authorized download endpoint rechecks access on the subsequent request.
				downloadUrl: `/api/evidence/${encodeURIComponent(item.id)}/download?caseId=${encodeURIComponent(authorizedCase.id)}&inline=1`,
			},
		}, { headers: { 'cache-control': 'private, no-store' } });
	} catch (cause) {
		if (cause instanceof SceneAdmissionError) return failure(cause.code, 409);
		if (cause instanceof SpzEvidenceSourceError) {
			const status = cause.code === 'EVIDENCE_SOURCE_NOT_SPZ' ? 415 : cause.code === 'EVIDENCE_SOURCE_TOO_LARGE' ? 413 : 409;
			return failure(cause.code, status);
		}
		console.error('[spz-source] source admission failed', cause instanceof Error ? cause.message : 'unknown error');
		return failure('SPZ_SOURCE_UNAVAILABLE', 503);
	}
};
