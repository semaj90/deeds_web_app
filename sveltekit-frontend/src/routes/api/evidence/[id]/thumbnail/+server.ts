import type { RequestHandler } from './$types';
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';

const thumbnailManifestSchema = z.object({
	kind: z.literal('thumbnail'),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	objectKey: z.string().min(1).max(1024),
	bucket: z.string().min(1).max(63),
	mimeType: z.literal('image/jpeg'),
	outputSha256: z.string().regex(/^[a-f0-9]{64}$/),
	width: z.number().int().min(1).max(256),
	height: z.number().int().min(1).max(256),
	preprocessingRevision: z.string().min(1).max(200),
}).strict();

const failure = (error: string, status: number) => Response.json(
	{ success: false, error },
	{ status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } },
);

function sourceRevision(value: unknown): string | null {
	const digest = String(value ?? '').replace(/^sha256:/i, '').toLowerCase();
	return /^[a-f0-9]{64}$/.test(digest) ? `sha256:${digest}` : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === 'string') {
		try { value = JSON.parse(value); } catch { return null; }
	}
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Serves only a validated thumbnail manifest for the currently authorized source revision. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const evidenceId = params.id;
	if (!locals.user?.id) return failure('UNAUTHORIZED', 401);
	if (!isUuid(evidenceId)) return failure('INVALID_EVIDENCE_ID', 400);
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId <= 0) return failure('UNAUTHORIZED', 401);

	try {
		const [source] = await db.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash })
			.from(evidence)
			.leftJoin(cases, eq(evidence.caseId, cases.id))
			.where(and(
				eq(evidence.id, evidenceId), isNull(evidence.deletedAt),
				or(
					eq(evidence.userId, userId),
					eq(evidence.uploadedBy, userId),
					and(isNotNull(evidence.caseId), or(eq(cases.userId, userId), eq(cases.assignedAttorney, userId))),
				),
			)).limit(1);
		if (!source) return failure('EVIDENCE_NOT_FOUND', 404);
		const currentRevision = sourceRevision(source.hash);
		if (!currentRevision) return failure('SOURCE_REVISION_INVALID', 409);

		const result = await db.execute(sql`
			SELECT source_revision, metadata
			FROM public.evidence_multimodal_vectors
			WHERE evidence_id = ${evidenceId}::uuid
			  AND modality = 'image'
			  AND source_locator->>'kind' = 'whole_image'
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		`);
		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row || sourceRevision(row.source_revision) !== currentRevision) return failure('THUMBNAIL_NOT_FOUND', 404);
		const metadata = objectRecord(row.metadata);
		const derivatives = objectRecord(metadata?.imageDerivatives);
		const parsed = thumbnailManifestSchema.safeParse(derivatives?.thumbnail);
		if (!parsed.success) return failure('THUMBNAIL_NOT_FOUND', 404);
		const thumbnail = parsed.data;
		const sourceHash = currentRevision.slice('sha256:'.length);
		const expectedKey = `evidence/${source.caseId ?? 'default'}/${evidenceId}/${sourceHash}/thumbnail-${thumbnail.outputSha256}.jpg`;
		if (thumbnail.sourceRevision !== currentRevision
			|| thumbnail.bucket !== ENV.SEAWEED_ARTIFACTS_BUCKET
			|| thumbnail.objectKey !== expectedKey) return failure('THUMBNAIL_NOT_FOUND', 404);

		const bytes = await getFileFromSeaweed({ bucket: thumbnail.bucket, objectKey: thumbnail.objectKey, maximumBytes: 2 * 1024 * 1024 });
		const digest = createHash('sha256').update(bytes).digest('hex');
		if (digest !== thumbnail.outputSha256) return failure('THUMBNAIL_INTEGRITY_CHECK_FAILED', 502);
		if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
			return failure('THUMBNAIL_FORMAT_INVALID', 502);
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
		return failure('THUMBNAIL_READ_FAILED', 502);
	}
};
