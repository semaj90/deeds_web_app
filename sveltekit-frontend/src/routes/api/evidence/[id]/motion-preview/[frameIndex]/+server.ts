import type { RequestHandler } from './$types';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { isUuid } from '$lib/server/validation.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { ARTIFACTS_BUCKET } from '$lib/server/storage/storage-buckets.js';
import {
	decodeVideoMotionLutIndicesV1,
	hasValidMotionComparisonV1,
	VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1,
	videoMotionLutManifestV1Schema,
	hasValidMotionSampleComparisonV1,
	videoMotionSampleManifestV1Schema,
} from '$lib/shared/video-motion-lut-v1.js';

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

/** Hash-check and return one compact motion tile only for an authorized, current source revision. */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	const evidenceId = params.id;
	const frameIndex = Number(params.frameIndex);
	if (!locals.user?.id) return failure('UNAUTHORIZED', 401);
	if (!isUuid(evidenceId)) return failure('INVALID_EVIDENCE_ID', 400);
	if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= 300) return failure('INVALID_FRAME_INDEX', 400);
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId <= 0) return failure('UNAUTHORIZED', 401);

	try {
		const [source] = await db.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash, aiAnalysis: evidence.aiAnalysis })
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
			)).limit(1);
		if (!source) return failure('EVIDENCE_NOT_FOUND', 404);
		const sourceHash = String(source.hash ?? '').replace(/^sha256:/i, '').toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(sourceHash)) return failure('SOURCE_REVISION_INVALID', 409);
		const currentRevision = formatEvidenceSourceRevisionV1(source.hash);
		const videoAnalysis = objectRecord(objectRecord(source.aiAnalysis)?.videoAnalysis);
		if (videoAnalysis?.sourceRevision !== currentRevision || typeof videoAnalysis.analysisRevision !== 'string' || !Array.isArray(videoAnalysis.frames)) {
			return failure('MOTION_TILE_NOT_FOUND', 404);
		}
		const requestedLane = url.searchParams.get('lane');
		if (requestedLane === 'motion-sample') {
			const rawMotionSamples = Array.isArray(videoAnalysis.motionSamples) ? videoAnalysis.motionSamples : [];
			const parsedSample = videoMotionSampleManifestV1Schema.safeParse(rawMotionSamples[frameIndex]);
			if (!parsedSample.success) return failure('MOTION_TILE_NOT_FOUND', 404);
			const sample = parsedSample.data;
			if (sample.sampleIndex !== frameIndex || sample.evidenceId !== evidenceId || sample.sourceRevision !== currentRevision ||
				sample.analysisRevision !== videoAnalysis.analysisRevision || sample.artifact.sourceRevision !== currentRevision ||
				sample.artifact.analysisRevision !== videoAnalysis.analysisRevision || !hasValidMotionSampleComparisonV1(sample, rawMotionSamples)) {
				return failure('MOTION_TILE_NOT_FOUND', 404);
			}
			const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
			const prefix = `evidence/${source.caseId ?? 'default'}/${evidenceId}/${sourceHash}/`;
			const fileName = `motion-sample-${String(frameIndex).padStart(4, '0')}.atm`;
			const remainder = sample.artifact.objectKey.startsWith(prefix) ? sample.artifact.objectKey.slice(prefix.length) : '';
			const separator = remainder.indexOf('/');
			const jobId = separator > 0 ? remainder.slice(0, separator) : '';
			const keyFile = separator > 0 ? remainder.slice(separator + 1) : '';
			if (sample.artifact.bucket !== bucket || !isUuid(jobId) || keyFile !== fileName) return failure('MOTION_TILE_NOT_FOUND', 404);
			const bytes = await getFileFromSeaweed({ bucket, objectKey: sample.artifact.objectKey, maximumBytes: VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1 });
			const digest = createHash('sha256').update(bytes).digest('hex');
			if (bytes.byteLength !== VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1 || `sha256:${digest}` !== sample.artifact.sha256) return failure('MOTION_TILE_INTEGRITY_FAILED', 502);
			try { decodeVideoMotionLutIndicesV1(new Uint8Array(bytes)); }
			catch { return failure('MOTION_TILE_FORMAT_INVALID', 502); }
			return new Response(new Uint8Array(bytes), {
				headers: {
					'Content-Type': 'application/vnd.atlas.video-motion-lut-v1',
					'Content-Length': String(bytes.byteLength),
					'Cache-Control': 'private, no-store',
					'X-Content-Type-Options': 'nosniff',
					'Cross-Origin-Resource-Policy': 'same-origin',
					'X-Source-Revision': currentRevision,
					'X-Analysis-Revision': sample.analysisRevision,
					'X-Frame-Timestamp-Ms': String(sample.timestampMs),
					ETag: `"sha256-${digest}"`,
				},
			});
		}
		if (requestedLane !== null) return failure('INVALID_MOTION_LANE', 400);
	if (frameIndex >= 60) return failure('MOTION_TILE_NOT_FOUND', 404);
		const frame = objectRecord(videoAnalysis.frames[frameIndex]);
		const parsed = videoMotionLutManifestV1Schema.safeParse(frame?.motionLut);
		if (!parsed.success) return failure('MOTION_TILE_NOT_FOUND', 404);
		const tile = parsed.data;
		if (
			frame?.frameIndex !== frameIndex || frame.sourceRevision !== currentRevision ||
			frame.analysisRevision !== videoAnalysis.analysisRevision ||
			tile.evidenceId !== evidenceId || tile.sourceRevision !== currentRevision ||
			tile.analysisRevision !== videoAnalysis.analysisRevision || tile.frameIndex !== frameIndex ||
			tile.timestampMs !== frame?.timestampMs || tile.artifact.sourceRevision !== currentRevision ||
			tile.artifact.analysisRevision !== videoAnalysis.analysisRevision ||
			!hasValidMotionComparisonV1(tile, videoAnalysis.frames)
		) return failure('MOTION_TILE_NOT_FOUND', 404);

		const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
		const prefix = `evidence/${source.caseId ?? 'default'}/${evidenceId}/${sourceHash}/`;
		const fileName = `motion-${String(frameIndex).padStart(4, '0')}.atm`;
		const remainder = tile.artifact.objectKey.startsWith(prefix) ? tile.artifact.objectKey.slice(prefix.length) : '';
		const separator = remainder.indexOf('/');
		const jobId = separator > 0 ? remainder.slice(0, separator) : '';
		const keyFile = separator > 0 ? remainder.slice(separator + 1) : '';
		if (tile.artifact.bucket !== bucket || !isUuid(jobId) || keyFile !== fileName) return failure('MOTION_TILE_NOT_FOUND', 404);

		const bytes = await getFileFromSeaweed({ bucket, objectKey: tile.artifact.objectKey, maximumBytes: VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1 });
		const digest = createHash('sha256').update(bytes).digest('hex');
		if (bytes.byteLength !== VIDEO_MOTION_LUT_ARTIFACT_BYTES_V1 || `sha256:${digest}` !== tile.artifact.sha256) {
			return failure('MOTION_TILE_INTEGRITY_FAILED', 502);
		}
		try { decodeVideoMotionLutIndicesV1(new Uint8Array(bytes)); }
		catch { return failure('MOTION_TILE_FORMAT_INVALID', 502); }
		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': 'application/vnd.atlas.video-motion-lut-v1',
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
				'Cross-Origin-Resource-Policy': 'same-origin',
				'X-Source-Revision': currentRevision,
				'X-Analysis-Revision': tile.analysisRevision,
				'X-Frame-Timestamp-Ms': String(tile.timestampMs),
				ETag: `"sha256-${digest}"`,
			},
		});
	} catch {
		return failure('MOTION_TILE_READ_FAILED', 502);
	}
};
