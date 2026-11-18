import type { RequestHandler } from './$types';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { ARTIFACTS_BUCKET } from '$lib/server/storage/storage-buckets.js';
import { isUuid } from '$lib/server/validation.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';

const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_FRAME_COUNT = 60;
const failure = (error: string, status: number) => Response.json(
	{ success: false, error },
	{ status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } },
);

function objectRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'string') {
		try { value = JSON.parse(value); } catch { return null; }
	}
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Serves one current, case-authorized JPEG derived from the canonical video-analysis run. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const evidenceId = params.id;
	const frameIndex = Number(params.frameIndex);
	if (!locals.user?.id) return failure('UNAUTHORIZED', 401);
	if (!isUuid(evidenceId)) return failure('INVALID_EVIDENCE_ID', 400);
	if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= MAX_FRAME_COUNT) return failure('INVALID_FRAME_INDEX', 400);
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId <= 0) return failure('UNAUTHORIZED', 401);

	try {
		const [source] = await db.select({
			id: evidence.id,
			caseId: evidence.caseId,
			hash: evidence.hash,
			aiAnalysis: evidence.aiAnalysis,
		})
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(evidence.id, evidenceId),
				isNull(evidence.deletedAt),
				or(
					eq(evidence.userId, userId),
					eq(evidence.uploadedBy, userId),
					and(isNotNull(evidence.caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))),
				),
			))
			.limit(1);
		if (!source) return failure('EVIDENCE_NOT_FOUND', 404);

		let sourceRevision: string;
		try {
			if (!source.hash) return failure('SOURCE_REVISION_INVALID', 409);
			sourceRevision = formatEvidenceSourceRevisionV1(source.hash);
		} catch {
			return failure('SOURCE_REVISION_INVALID', 409);
		}
		const analysisRoot = objectRecord(source.aiAnalysis);
		const video = objectRecord(analysisRoot?.videoAnalysis);
		if (video?.schema !== 'atlas.video-analysis.v1' || video.sourceRevision !== sourceRevision ||
			typeof video.analysisRevision !== 'string' || typeof video.analysisJobId !== 'string' || !isUuid(video.analysisJobId) ||
			!Array.isArray(video.frames)) return failure('VIDEO_ANALYSIS_NOT_FOUND', 404);
		const frame = objectRecord(video.frames[frameIndex]);
		if (!frame || frame.frameIndex !== frameIndex || frame.sourceRevision !== sourceRevision || frame.analysisRevision !== video.analysisRevision) {
			return failure('VIDEO_FRAME_NOT_FOUND', 404);
		}
		const artifact = objectRecord(frame.artifact);
		const sourceWidth = frame.width;
		const sourceHeight = frame.height;
		const artifactWidth = artifact?.width;
		const artifactHeight = artifact?.height;
		const validDimensions = (width: unknown, height: unknown): boolean =>
			Number.isSafeInteger(width) && Number(width) > 0 && Number(width) <= 32768 &&
			Number.isSafeInteger(height) && Number(height) > 0 && Number(height) <= 32768 &&
			Number(width) * Number(height) <= 100_000_000;
		const sourceDimensionsPresent = sourceWidth !== undefined || sourceHeight !== undefined;
		const artifactDimensionsPresent = artifactWidth !== undefined || artifactHeight !== undefined;
		if (!Number.isSafeInteger(frame.timestampMs) || Number(frame.timestampMs) < 0 ||
			(sourceDimensionsPresent && !validDimensions(sourceWidth, sourceHeight)) ||
			(artifactDimensionsPresent && !validDimensions(artifactWidth, artifactHeight))) {
			return failure('VIDEO_FRAME_DIMENSIONS_INVALID', 409);
		}
		const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
		const sourceHash = sourceRevision.slice('sha256:'.length);
		const prefix = `evidence/${source.caseId ?? 'default'}/${evidenceId}/${sourceHash}/${video.analysisJobId}/`;
		const expectedKey = `${prefix}frame-${String(frameIndex).padStart(4, '0')}.jpg`;
		if (!artifact || artifact.bucket !== bucket || artifact.objectKey !== expectedKey || artifact.contentType !== 'image/jpeg' ||
			artifact.sourceRevision !== sourceRevision || typeof artifact.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.sha256) ||
			typeof artifact.byteLength !== 'number' || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0 || artifact.byteLength > MAX_FRAME_BYTES) {
			return failure('VIDEO_FRAME_NOT_FOUND', 404);
		}

		const bytes = await getFileFromSeaweed({ bucket, objectKey: expectedKey, maximumBytes: MAX_FRAME_BYTES });
		const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		if (bytes.byteLength !== artifact.byteLength || digest !== artifact.sha256) return failure('VIDEO_FRAME_INTEGRITY_MISMATCH', 409);
		const responseBody = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(responseBody).set(bytes);
		return new Response(responseBody, {
			headers: {
				'Content-Type': 'image/jpeg',
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
				'X-Source-Revision': sourceRevision,
				'X-Analysis-Revision': video.analysisRevision,
				'X-Frame-Index': String(frameIndex),
				'X-Frame-Timestamp-Ms': String(frame.timestampMs),
				...(validDimensions(sourceWidth, sourceHeight) ? {
					'X-Source-Frame-Width': String(sourceWidth),
					'X-Source-Frame-Height': String(sourceHeight),
				} : {}),
				...(validDimensions(artifactWidth, artifactHeight) ? {
					'X-Artifact-Frame-Width': String(artifactWidth),
					'X-Artifact-Frame-Height': String(artifactHeight),
				} : {}),
			},
		});
	} catch (error) {
		console.error('[EvidenceVideoFrame] Read failed:', error);
		return failure('VIDEO_FRAME_READ_FAILED', 500);
	}
};
