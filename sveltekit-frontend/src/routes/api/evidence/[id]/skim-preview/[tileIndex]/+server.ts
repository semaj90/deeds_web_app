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
import { videoSkimPreviewManifestV1Schema } from '$lib/server/features/evidence/video/video-skim-preview-v1.js';

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

/** Returns one hash-checked preview sprite only for an authorized, current evidence revision. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const evidenceId = params.id;
	const tileIndex = Number(params.tileIndex);
	if (!locals.user?.id) return failure('UNAUTHORIZED', 401);
	if (!isUuid(evidenceId)) return failure('INVALID_EVIDENCE_ID', 400);
	if (!Number.isSafeInteger(tileIndex) || tileIndex < 0 || tileIndex > 143) return failure('INVALID_TILE_INDEX', 400);
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
		const aiAnalysis = objectRecord(source.aiAnalysis);
		const videoAnalysis = objectRecord(aiAnalysis?.videoAnalysis);
		if (videoAnalysis?.sourceRevision !== currentRevision) return failure('SKIM_PREVIEW_NOT_FOUND', 404);
		const parsed = videoSkimPreviewManifestV1Schema.safeParse(videoAnalysis.skimPreview);
		if (!parsed.success || parsed.data.sourceRevision !== currentRevision || parsed.data.analysisRevision !== videoAnalysis.analysisRevision) {
			return failure('SKIM_PREVIEW_NOT_FOUND', 404);
		}
		const tile = parsed.data.tiles.find((candidate) => candidate.index === tileIndex);
		if (!tile) return failure('SKIM_TILE_NOT_FOUND', 404);
		const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
		const expectedKey = `evidence/${source.caseId ?? 'default'}/${evidenceId}/${sourceHash}/skim-preview-v1/tile-${String(tile.index).padStart(4, '0')}-${tile.sha256}.jpg`;
		if (!bucket || tile.objectKey !== expectedKey) return failure('SKIM_TILE_NOT_FOUND', 404);

		const bytes = await getFileFromSeaweed({ bucket, objectKey: tile.objectKey, maximumBytes: 8 * 1024 * 1024 });
		const digest = createHash('sha256').update(bytes).digest('hex');
		if (bytes.byteLength !== tile.byteLength || digest !== tile.sha256) return failure('SKIM_TILE_INTEGRITY_FAILED', 502);
		if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
			return failure('SKIM_TILE_FORMAT_INVALID', 502);
		}
		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': 'image/jpeg',
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'private, no-store',
				'X-Content-Type-Options': 'nosniff',
				'Cross-Origin-Resource-Policy': 'same-origin',
				ETag: `"sha256-${digest}"`,
			},
		});
	} catch {
		return failure('SKIM_TILE_READ_FAILED', 502);
	}
};
